// Manifest — poll-flight-status Edge Function
//
// Two callers, one function:
//  1. pg_cron (see the cron.schedule job registered alongside this
//     function's deploy — not in a migration file, same as send-reminders)
//     fires this every 10 minutes with no body — the finest cadence this
//     needs (see PRE_DEPARTURE_INTERVAL_MIN below). It sweeps every flight
//     item that's within its tracking window (departure - 4h, up to a
//     safety cutoff after departure) and not already at a terminal status,
//     and checks each one against AeroDataBox that's actually due for a
//     check — the cron frequency is just the upper bound on precision, not
//     the real per-flight cadence.
//  2. The app calls it with { item_id } for a manual "refresh now" tap —
//     from the trip overview page or the item detail page. This always
//     checks regardless of the window or per-flight cadence, and returns
//     the updated row directly so the caller doesn't need a second round
//     trip.
//
// Either way, the result lands in the flight_status table — the single
// source of truth both screens read from, so a manual refresh on one
// screen is reflected on the other without querying AeroDataBox twice.
//
// verify_jwt: false, matching send-reminders — pg_cron/pg_net has no user
// session to attach a JWT from. The manual path is unauthenticated the same
// way; the only thing a caller can do is force a status check for a known
// item_id (a UUID) and possibly trigger one push notification to that
// item's trip owner, which isn't worth gating behind auth for a personal-
// use app already relying on UUID unguessability elsewhere.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { DateTime } from "npm:luxon@3";

const RAPIDAPI_HOST = "aerodatabox.p.rapidapi.com";
const API_KEY = Deno.env.get("AERODATABOX_KEY");

// AeroDataBox's free RapidAPI tier is 2,400 requests/month (600 "units") at
// 1 req/sec — see design notes. Checking every 10 min for the 4h before
// departure (24 checks) then every 30 min until landing (say ~3h for a
// typical flight, 6 more checks) is ~30 checks/flight — comfortably inside
// that even for a busy month of travel, while staying responsive to gate/
// delay changes pre-departure and backing off once there's nothing to do
// but wait for it to land.
const TRACKING_WINDOW_HOURS = 4;
const PRE_DEPARTURE_INTERVAL_MIN = 10;
const POST_DEPARTURE_INTERVAL_MIN = 30;
// Keep polling up to this long after scheduled departure even if no
// terminal status was ever seen (a missed/odd API response shouldn't poll
// forever) — comfortably longer than any real flight plus taxi/baggage time.
const SAFETY_CUTOFF_HOURS = 20;
const TERMINAL_STATUSES = new Set(["Arrived", "Landed", "Canceled", "Cancelled", "Diverted"]);
// Any status AeroDataBox has returned that means the aircraft has actually
// left the ground — not just "on schedule" — is what flips a flight from
// the pre- to the post-departure cadence. Until the first successful check
// comes back, there's no status to go on yet, so hasLikelyDeparted() falls
// back to comparing against the flight's own scheduled departure time.
const DEPARTED_LIKE_STATUSES = new Set(["EnRoute", "Departed", "Approaching", ...TERMINAL_STATUSES]);
// Stay under AeroDataBox's 1 req/sec rate limit when a sweep checks several
// flights in one run.
const THROTTLE_MS = 1100;

type Json = Record<string, any>;

interface FlightStatusTime { utc: string | null; local: string | null; }
interface FlightStatus {
  flightNumber: string;
  status: string | null;
  departure: { airport: string | null; scheduled: FlightStatusTime; revised: FlightStatusTime | null; terminal: string | null; gate: string | null };
  arrival: { airport: string | null; scheduled: FlightStatusTime; revised: FlightStatusTime | null; terminal: string | null; gate: string | null };
}

function parseTime(t: any): FlightStatusTime {
  return { utc: t?.utc ?? null, local: t?.local ?? null };
}

// See lib/flightStatus.ts's identical comment — AeroDataBox names the
// "revised" time differently (actualTime/revisedTime/predictedTime)
// depending on how confirmed it is. Kept in sync with that file's logic
// since this Deno function can't import it directly.
function parseBestTime(leg: any): FlightStatusTime | null {
  const t = leg?.actualTime ?? leg?.revisedTime ?? leg?.predictedTime;
  return t ? parseTime(t) : null;
}

async function lookupFlight(flightNumber: string, dateIso: string): Promise<FlightStatus> {
  if (!API_KEY) throw new Error("No AeroDataBox API key configured (AERODATABOX_KEY).");
  const cleaned = flightNumber.replace(/\s+/g, "");
  const url = `https://${RAPIDAPI_HOST}/flights/number/${encodeURIComponent(cleaned)}/${dateIso}`;
  const res = await fetch(url, { headers: { "X-RapidAPI-Key": API_KEY, "X-RapidAPI-Host": RAPIDAPI_HOST } });

  if (res.status === 204) throw new Error(`No flight found for ${cleaned} on ${dateIso}.`);
  if (!res.ok) throw new Error(`Flight status lookup failed (${res.status}).`);

  const data = await res.json();
  const flights = Array.isArray(data) ? data : [];
  if (flights.length === 0) throw new Error(`No flight found for ${cleaned} on ${dateIso}.`);
  const f = flights[0];

  return {
    flightNumber: cleaned,
    status: f.status ?? null,
    departure: {
      airport: f.departure?.airport?.iata ?? f.departure?.airport?.name ?? null,
      scheduled: parseTime(f.departure?.scheduledTime),
      revised: parseBestTime(f.departure),
      terminal: f.departure?.terminal ?? null,
      gate: f.departure?.gate ?? null,
    },
    arrival: {
      airport: f.arrival?.airport?.iata ?? f.arrival?.airport?.name ?? null,
      scheduled: parseTime(f.arrival?.scheduledTime),
      revised: parseBestTime(f.arrival),
      terminal: f.arrival?.terminal ?? null,
      gate: f.arrival?.gate ?? null,
    },
  };
}

function hasLikelyDeparted(existingStatus: string | null, departureUtc: DateTime, now: DateTime): boolean {
  if (existingStatus && DEPARTED_LIKE_STATUSES.has(existingStatus)) return true;
  return now >= departureUtc;
}

async function notifyStatusChange(supabase: Json, userId: string, itemId: string, itemTitle: string, flightNumber: string, status: string | null) {
  const { data: tokens } = await supabase.from("push_tokens").select("expo_push_token").eq("user_id", userId);
  if (!tokens?.length) return;
  const messages = tokens.map((t: Json) => ({
    to: t.expo_push_token,
    title: `Flight ${flightNumber} update`,
    body: `${status ?? "Status changed"} — ${itemTitle}`,
    sound: "default",
    data: { route: `/item/${itemId}/flight-log` },
  }));
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
  } catch (e) {
    console.error("push send failed", e);
  }
}

Deno.serve(async (req) => {
  let forcedItemId: string | undefined;
  try {
    const body = await req.json();
    forcedItemId = body?.item_id;
  } catch { /* cron calls with no body */ }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (!API_KEY) {
    return new Response(JSON.stringify({ error: "AERODATABOX_KEY is not set on this project." }), { status: 500 });
  }

  let query = supabase
    .from("items")
    .select("id, trip_id, title, start_date, time_start, timezone_start, custom_fields, trips(user_id, default_timezone)")
    .eq("type", "flight").eq("is_stay_span", false).is("deleted_at", null)
    .not("start_date", "is", null).not("time_start", "is", null);
  if (forcedItemId) query = query.eq("id", forcedItemId);

  const { data: items, error } = await query;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const now = DateTime.utc();
  let checked = 0, updated = 0, notified = 0;
  let forcedRow: Json | null = null;
  let firstError: string | null = null;

  for (const item of items ?? []) {
    const flightNumber = (item.custom_fields as Json)?.flight_number as string | undefined;
    if (!flightNumber) continue;
    const trip = (item as Json).trips as { user_id: string; default_timezone: string } | null;
    if (!trip?.user_id) continue;

    const zone = item.timezone_start || trip.default_timezone || "UTC";
    const departure = DateTime.fromISO(`${item.start_date}T${item.time_start}`, { zone });
    if (!departure.isValid) continue;
    const departureUtc = departure.toUTC();

    const { data: existing } = await supabase.from("flight_status").select("*").eq("item_id", item.id).maybeSingle();

    const withinWindow = now >= departureUtc.minus({ hours: TRACKING_WINDOW_HOURS }) && now <= departureUtc.plus({ hours: SAFETY_CUTOFF_HOURS });
    const alreadyTerminal = !!(existing?.status && TERMINAL_STATUSES.has(existing.status));
    const isForced = forcedItemId === item.id;

    const departed = hasLikelyDeparted(existing?.status ?? null, departureUtc, now);
    const requiredIntervalMin = departed ? POST_DEPARTURE_INTERVAL_MIN : PRE_DEPARTURE_INTERVAL_MIN;
    const dueForCheck = !existing?.checked_at
      || now.diff(DateTime.fromISO(existing.checked_at), "minutes").minutes >= requiredIntervalMin;

    if (!isForced && (!withinWindow || alreadyTerminal || existing?.tracking_active === false || !dueForCheck)) continue;

    if (checked > 0) await new Promise((r) => setTimeout(r, THROTTLE_MS));
    checked++;

    try {
      const status = await lookupFlight(flightNumber, item.start_date);
      const isTerminal = status.status ? TERMINAL_STATUSES.has(status.status) : false;
      const prevStatus: string | null = existing?.status ?? null;
      const changed = prevStatus !== null && status.status !== prevStatus;

      const upsertRow = {
        item_id: item.id,
        trip_id: item.trip_id,
        flight_number: flightNumber,
        status: status.status,
        previous_status: prevStatus,
        data: status,
        tracking_active: !isTerminal && now <= departureUtc.plus({ hours: SAFETY_CUTOFF_HOURS }),
        last_error: null,
        checked_at: new Date().toISOString(),
      };
      const { data: saved } = await supabase.from("flight_status").upsert(upsertRow).select().single();
      updated++;
      if (isForced) forcedRow = saved ?? upsertRow;

      if (changed) {
        // One log row per real change — deliberately the same condition
        // that fires the push notification below, not one per poll. This
        // is the permanent history the dedicated log page reads, separate
        // from flight_status which only ever holds the latest snapshot.
        await supabase.from("flight_status_log").insert({
          item_id: item.id,
          trip_id: item.trip_id,
          flight_number: flightNumber,
          status: status.status,
          previous_status: prevStatus,
          data: status,
        });
        await notifyStatusChange(supabase, trip.user_id, item.id, item.title, flightNumber, status.status);
        notified++;
      }
    } catch (e) {
      const message = String(e instanceof Error ? e.message : e).slice(0, 300);
      firstError = firstError ?? message;
      // Only the error/checked_at columns are touched here, so a transient
      // lookup failure never wipes out the last good status/data this
      // flight already had.
      await supabase.from("flight_status").upsert({
        item_id: item.id, trip_id: item.trip_id, flight_number: flightNumber,
        last_error: message, checked_at: new Date().toISOString(),
      });
      if (isForced) firstError = message;
    }
  }

  if (forcedItemId && !forcedRow) {
    return new Response(JSON.stringify({ error: firstError ?? "This item isn't a trackable flight (missing flight number, date, or time)." }), { status: 400 });
  }

  return new Response(JSON.stringify({ checked, updated, notified, row: forcedRow }), { headers: { "content-type": "application/json" } });
});
