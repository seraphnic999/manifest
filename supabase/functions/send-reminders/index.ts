// Manifest — send-reminders Edge Function
//
// Invoked on a schedule by pg_cron (job "send-reminders-every-10-min",
// */10 * * * * — registered directly via cron.job, not a migration file),
// not by the client. Checks every item/trip with an unsent, due reminder
// and sends a real push notification via Expo's push API — cloud-based,
// not an on-device scheduled alarm, so it survives an OEM battery
// optimizer or the app being force-quit. Deployed with verify_jwt: false
// since pg_cron/pg_net has no user session to attach a JWT from; this
// function uses its own injected service-role key rather than trusting
// anything from the caller, and does nothing destructive, so an
// unauthenticated trigger is harmless.
//
// Unlike the rest of this app's date math (which safely treats a device's
// own clock as "local enough" — see lib/dateFormat.ts's localIsoDate
// comment), this runs on a server with no meaningful local timezone, so it
// has to actually resolve each item's wall-clock time against its own
// timezone_start (falling back to the trip's default_timezone) to get a
// real UTC instant to compare against "now".

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { DateTime } from "npm:luxon@3";

async function sendPush(supabase: any, userId: string, title: string, body: string, route?: string): Promise<boolean> {
  const { data: tokens } = await supabase
    .from("push_tokens").select("expo_push_token").eq("user_id", userId);
  if (!tokens || tokens.length === 0) return false; // no registered device — nowhere to deliver it

  const messages = tokens.map((t: any) => ({
    to: t.expo_push_token,
    title,
    body,
    sound: "default",
    ...(route ? { data: { route } } : {}),
  }));

  const pushRes = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages),
  });
  const pushJson = await pushRes.json().catch(() => null);
  // Expo's response is a per-message ticket array — "ok" only means Expo
  // accepted it for delivery to FCM, not that it was actually delivered.
  // Logged (not surfaced anywhere) so a real delivery problem is at least
  // visible in this function's logs, not just silently swallowed.
  if (!pushRes.ok || pushJson?.data?.some?.((t: any) => t.status !== "ok")) {
    console.error("push send returned an error ticket", JSON.stringify(pushJson));
  }
  return true;
}

// Day-city resolution — a day's own city override, falling back to the
// trip's primary (first) city. Reimplemented here (a third time — see
// identify-item's resolveCity and research-item's resolveDayCity) since
// this Deno function has no access to the app's own TS modules.
function resolveDayCityLabel(day: any, tripCities: any[]): string | null {
  if (day?.city_id) {
    const row = tripCities.find((r) => r.city_id === day.city_id);
    if (row?.city?.name) return row.city.name;
  }
  if (day?.custom_city_name) return day.custom_city_name;
  return null;
}
function tripPrimaryCityLabel(tripCities: any[]): string | null {
  const primary = tripCities[0];
  if (primary?.city?.name) return primary.city.name;
  if (primary?.custom_name) return primary.custom_name;
  return null;
}

// Best-effort, keyless Open-Meteo lookup for one specific calendar date —
// mirrors lib/weather.ts's client-side fetch, reimplemented here since a
// pre-trip briefing always fires within a day or so of departure, so the
// date it needs is always inside Open-Meteo's ~4-day forecast horizon.
// Never throws: a weather failure just means the briefing goes out
// without a weather line, not that it fails to send at all.
async function fetchDayForecast(cityLabel: string, dateIso: string): Promise<{ tempMax: number; tempMin: number; precipProb: number | null } | null> {
  try {
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityLabel)}&count=1`);
    if (!geoRes.ok) return null;
    const geoData = await geoRes.json();
    const coords = geoData?.results?.[0];
    if (!coords) return null;

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}` +
      `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=4`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const idx = data?.daily?.time?.indexOf(dateIso);
    if (idx == null || idx < 0) return null;

    return {
      tempMax: data.daily.temperature_2m_max[idx],
      tempMin: data.daily.temperature_2m_min[idx],
      precipProb: data.daily.precipitation_probability_max?.[idx] ?? null,
    };
  } catch {
    return null;
  }
}

// The trip's first tracked flight — the shared anchor for both the
// check-in and pre-trip-briefing notifications below. Null if the trip
// has no flight item (e.g. a road trip, or flights not tracked here).
async function fetchFirstFlight(supabase: any, tripId: string) {
  const { data } = await supabase
    .from("items")
    .select("id, title, start_date, time_start, timezone_start")
    .eq("trip_id", tripId)
    .eq("type", "flight")
    .eq("is_stay_span", false)
    .is("deleted_at", null)
    .not("start_date", "is", null)
    .not("time_start", "is", null)
    .order("start_date", { ascending: true })
    .order("time_start", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data;
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: items, error } = await supabase
    .from("items")
    .select("id, title, start_date, time_start, timezone_start, reminder_minutes_before, trips(user_id, default_timezone)")
    .not("reminder_minutes_before", "is", null)
    .is("reminder_sent_at", null)
    .not("start_date", "is", null)
    .not("time_start", "is", null)
    .is("deleted_at", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const now = DateTime.utc();
  let sent = 0;
  let checked = 0;

  for (const item of items ?? []) {
    checked++;
    const trip = (item as any).trips as { user_id: string; default_timezone: string } | null;
    if (!trip?.user_id) continue;

    const zone = item.timezone_start || trip.default_timezone || "UTC";
    const triggerAt = DateTime.fromISO(`${item.start_date}T${item.time_start}`, { zone })
      .minus({ minutes: item.reminder_minutes_before });
    if (!triggerAt.isValid || triggerAt > now) continue;

    await sendPush(supabase, trip.user_id, "Coming up", item.title);
    await supabase.from("items").update({ reminder_sent_at: new Date().toISOString() }).eq("id", item.id);
    sent++;
  }

  // Booking reminders — a separate "go make this reservation" nudge (see
  // migration_048), an absolute instant rather than the day-of item's own
  // start-time-relative offset above, so no per-item timezone math needed
  // here: booking_reminder_at is already the real trigger instant.
  const { data: bookingItems, error: bookingError } = await supabase
    .from("items")
    .select("id, title, booking_reminder_at, trips(user_id)")
    .not("booking_reminder_at", "is", null)
    .is("booking_reminder_sent_at", null)
    .is("deleted_at", null);

  let bookingSent = 0;
  let bookingChecked = 0;

  if (!bookingError) {
    for (const item of bookingItems ?? []) {
      bookingChecked++;
      const trip = (item as any).trips as { user_id: string } | null;
      if (!trip?.user_id) continue;

      const triggerAt = DateTime.fromISO(item.booking_reminder_at);
      if (!triggerAt.isValid || triggerAt > now) continue;

      await sendPush(supabase, trip.user_id, "Time to book", item.title);
      await supabase.from("items").update({ booking_reminder_sent_at: new Date().toISOString() }).eq("id", item.id);
      bookingSent++;
    }
  }

  // Flight check-in reminder — 24h before the trip's first flight departs
  // (see migration_049). Trips with no flight item simply never match
  // (checkin_reminder_sent_at stays null forever, which is harmless — the
  // query re-checks a small, personal-app-sized trip list every 10 min).
  const { data: checkinTrips, error: checkinError } = await supabase
    .from("trips")
    .select("id, name, user_id, default_timezone")
    .is("deleted_at", null)
    .is("checkin_reminder_sent_at", null)
    .not("start_date", "is", null);

  let checkinChecked = 0;
  let checkinSent = 0;

  if (!checkinError) {
    for (const trip of checkinTrips ?? []) {
      checkinChecked++;
      const flight = await fetchFirstFlight(supabase, trip.id);
      if (!flight) continue;

      const zone = flight.timezone_start || trip.default_timezone || "UTC";
      const departure = DateTime.fromISO(`${flight.start_date}T${flight.time_start}`, { zone });
      if (!departure.isValid) continue;
      const triggerAt = departure.minus({ hours: 24 });
      // Not due yet, or the flight has already left — a stale "check in
      // now" push for a flight that's already departed would just be
      // confusing, so this is a one-shot window, not "at least 24h before".
      if (triggerAt > now || departure < now) continue;

      await sendPush(
        supabase, trip.user_id, "Check-in open",
        `${flight.title} departs in 24h — check in now.`,
        `/trip/${trip.id}`
      );
      await supabase.from("trips").update({ checkin_reminder_sent_at: new Date().toISOString() }).eq("id", trip.id);
      checkinSent++;
    }
  }

  // Pre-trip briefing — 12h before the same anchor as the check-in
  // reminder above (the first flight's departure), falling back to the
  // first day's earliest timed item, then a synthetic 09:00 local on the
  // start date, for a trip with no flight item at all.
  const { data: briefingTrips, error: briefingError } = await supabase
    .from("trips")
    .select("id, name, user_id, default_timezone, start_date")
    .is("deleted_at", null)
    .is("pretrip_briefing_sent_at", null)
    .not("start_date", "is", null);

  let briefingChecked = 0;
  let briefingSent = 0;

  if (!briefingError) {
    for (const trip of briefingTrips ?? []) {
      briefingChecked++;

      let anchor: DateTime | null = null;
      const flight = await fetchFirstFlight(supabase, trip.id);
      if (flight) {
        const zone = flight.timezone_start || trip.default_timezone || "UTC";
        anchor = DateTime.fromISO(`${flight.start_date}T${flight.time_start}`, { zone });
      } else {
        const { data: startDay } = await supabase
          .from("days").select("id, city_id, custom_city_name")
          .eq("trip_id", trip.id).eq("date", trip.start_date).maybeSingle();
        let firstItem: any = null;
        if (startDay) {
          const { data } = await supabase
            .from("items").select("time_start, timezone_start")
            .eq("day_id", startDay.id).is("deleted_at", null).not("time_start", "is", null)
            .order("time_start", { ascending: true }).limit(1).maybeSingle();
          firstItem = data;
        }
        const zone = (firstItem?.timezone_start || trip.default_timezone || "UTC");
        anchor = firstItem
          ? DateTime.fromISO(`${trip.start_date}T${firstItem.time_start}`, { zone })
          : DateTime.fromISO(`${trip.start_date}T09:00`, { zone });
      }
      if (!anchor?.isValid) continue;
      const triggerAt = anchor.minus({ hours: 12 });
      if (triggerAt > now || anchor < now) continue;

      const [{ data: startDay }, { data: tripCities }, { data: packingItems }] = await Promise.all([
        supabase.from("days").select("id, city_id, custom_city_name").eq("trip_id", trip.id).eq("date", trip.start_date).maybeSingle(),
        supabase.from("trip_cities").select("city_id, custom_name, sort_order, city:cities(name, country)").eq("trip_id", trip.id).order("sort_order"),
        supabase.from("packing_items").select("packed").eq("trip_id", trip.id),
      ]);

      const cityLabel = resolveDayCityLabel(startDay, tripCities ?? []) || tripPrimaryCityLabel(tripCities ?? []);
      let weatherClause = "";
      if (cityLabel) {
        const forecast = await fetchDayForecast(cityLabel, trip.start_date);
        if (forecast) {
          const rainPart = forecast.precipProb && forecast.precipProb > 0 ? `, ${Math.round(forecast.precipProb)}% chance of rain` : "";
          weatherClause = `${Math.round(forecast.tempMin)}°C–${Math.round(forecast.tempMax)}°C${rainPart}.`;
        }
      }

      let packingClause = "";
      if (packingItems && packingItems.length > 0) {
        const packedCount = packingItems.filter((i: any) => i.packed).length;
        packingClause = `${packedCount} of ${packingItems.length} packed.`;
      }

      const nowInZone = now.setZone(anchor.zone);
      const dayLabel = anchor.hasSame(nowInZone, "day")
        ? "today"
        : anchor.hasSame(nowInZone.plus({ days: 1 }), "day")
        ? "tomorrow"
        : anchor.toFormat("EEE d/M");
      const body = [`Departs ${dayLabel} at ${anchor.toFormat("HH:mm")}.`, weatherClause, packingClause]
        .filter(Boolean).join(" ");

      await sendPush(supabase, trip.user_id, `Get ready for ${trip.name}`, body, `/trip/${trip.id}`);
      await supabase.from("trips").update({ pretrip_briefing_sent_at: new Date().toISOString() }).eq("id", trip.id);
      briefingSent++;
    }
  }

  return new Response(
    JSON.stringify({ checked, sent, bookingChecked, bookingSent, checkinChecked, checkinSent, briefingChecked, briefingSent }),
    { headers: { "Content-Type": "application/json" } }
  );
});
