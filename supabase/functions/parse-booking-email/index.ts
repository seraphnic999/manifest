// Manifest — parse-booking-email Edge Function
//
// Public webhook: SendGrid's Inbound Parse (see design/email-intake-setup.md)
// POSTs a forwarded booking-confirmation email here as multipart/form-data.
// One email can contain more than one booking — a round-trip has an
// outbound and a return flight, a bundled Expedia-style itinerary can carry
// a flight, a hotel, and a car rental in one message — so this extracts a
// list of proposed items, one per distinct booking, and drops each into its
// own email_proposals row for review. Nothing ever gets written to `items`
// directly from this function. The user gets one push notification covering
// the whole email and applies (or rejects) each row individually from the
// Review Queue, same "propose, never write" shape as the item-research
// agent.
//
// Public means unauthenticated by Supabase's own verify_jwt (an inbound
// mail provider can't send a Supabase user JWT) — a shared secret in the
// URL query string stands in for that instead. Treat that secret like a
// password: it's the only thing stopping a stranger from posting fake
// "bookings" into the queue.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";
const USD_PER_INPUT_TOKEN = 2 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 10 / 1_000_000;

const ITEM_TYPES = [
  "flight", "transfer", "transport", "lodging", "activity",
  "meal", "bar", "cafe", "bakery", "ice_cream", "sightseeing", "attraction", "shopping", "work", "other",
];

const SYSTEM = `You extract trip-planning items from a forwarded booking-confirmation email (flight, hotel, car rental, restaurant reservation, activity/tour, etc.).

Be honest about what the email actually says — a blank field costs the user nothing, a confident wrong one costs them a plan built on bad information.

An email can contain more than one distinct booking — a round-trip has an outbound AND a return flight; a bundled itinerary (e.g. an Expedia/travel-agent confirmation) can include a flight, a hotel, and a car rental all in one message. Find every distinct booking in the email and return one entry per booking, in the order they appear. Do NOT merge separate bookings into one entry. Do NOT split a single booking into multiple entries either — one flight number's one leg (even with a layover) is one entry; a multi-night hotel stay is one entry with check-in/check-out dates, not one entry per night.

RULES (apply to each entry)

1. type must be exactly one of: ${ITEM_TYPES.join(", ")}.
2. title: a short, clear name for the item — the venue/airline/property name, not the whole email subject.
3. Dates/times: use the LOCAL date and time as stated for that leg/stay/reservation (departure date+time for a flight, check-in/check-out for lodging, reservation date+time for a restaurant/activity). ISO date (YYYY-MM-DD) and 24-hour time (HH:MM). Null if genuinely not stated.
4. is_update_or_cancellation: true if the email's own language signals this changes or cancels a PRIOR booking (e.g. "itinerary change", "your flight has been changed", "cancellation confirmed", "updated confirmation") rather than a fresh new booking. If true, say what changed in "change_summary".
5. confidence per field: "high" only if the email states it plainly and unambiguously; "medium" if inferred/implied; "none" if not found — never invent a value to fill a field.
6. basis: a short quote or paraphrase of where in the email each non-null field came from.

Call propose_booking_items exactly once, with one entry per distinct booking. No prose.`;

const PROPOSE_TOOL = {
  name: "propose_booking_items",
  description: "Return the extracted booking items — one entry per distinct booking found in the email.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ITEM_TYPES },
            title: { type: "string" },
            title_confidence: { type: "string", enum: ["high", "medium", "none"] },
            start_date: { type: ["string", "null"] },
            end_date: { type: ["string", "null"] },
            time_start: { type: ["string", "null"] },
            time_end: { type: ["string", "null"] },
            date_confidence: { type: "string", enum: ["high", "medium", "none"] },
            address: { type: ["string", "null"] },
            phone: { type: ["string", "null"] },
            vendor: { type: ["string", "null"] },
            booking_source: { type: ["string", "null"] },
            confirmation_code: { type: ["string", "null"] },
            link: { type: ["string", "null"] },
            notes: { type: ["string", "null"], description: "Anything else worth keeping that doesn't fit another field." },
            is_update_or_cancellation: { type: "boolean" },
            change_summary: { type: ["string", "null"] },
            basis: { type: "string", description: "Overall short note on where the key facts came from." },
          },
          required: ["type", "title", "title_confidence", "start_date", "end_date", "date_confidence", "is_update_or_cancellation", "basis"],
        },
      },
    },
    required: ["items"],
  },
};

type Json = Record<string, any>;

const field = (value: unknown, confidence: unknown, basis?: unknown) => ({
  value: value ?? null,
  confidence: (confidence as string) || (value == null ? "none" : "medium"),
  basis: (basis as string) || null,
});

// SendGrid Inbound Parse's default (parsed) POST fields are `from`,
// `subject`, `text` (plain body), `html`, `to`, `envelope`, `headers` — a
// couple of other field-name fallbacks are kept defensively in case the
// provider ever changes. See design/email-intake-setup.md for the exact
// contract.
function extractEmailFields(body: Json): { from: string; subject: string; plainBody: string } {
  const from = body.from ?? body.envelope?.from ?? body.headers?.from ?? "";
  const subject = body.subject ?? body.headers?.subject ?? "";
  const plainBody = body.text ?? body.plain ?? body.body_plain ?? "";
  return { from: String(from), subject: String(subject), plainBody: String(plainBody).slice(0, 20_000) };
}

// SendGrid Inbound Parse posts multipart/form-data by default (not JSON) —
// parse whichever content-type actually arrives rather than assuming one,
// so a future provider change (or a manual JSON curl test) still works.
async function parseRequestBody(req: Request): Promise<Json> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    const obj: Json = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") obj[key] = value;
    }
    return obj;
  }
  return await req.json();
}

async function notify(supabase: Json, userId: string, title: string, body: string) {
  const { data: tokens } = await supabase.from("push_tokens").select("expo_push_token").eq("user_id", userId);
  if (!tokens?.length) return;
  const messages = tokens.map((t: Json) => ({
    to: t.expo_push_token, title, body, sound: "default", data: { route: "/reviewQueue" },
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

// Best-effort trip match for one extracted item: does its start_date fall
// within (or near) any of this user's trips? A couple of days' slack on
// each side covers a flight the day before a trip "officially" starts, etc.
// Runs once per extracted item, independently — a round-trip's outbound and
// return legs, or a flight+hotel bundle, can each land on (or update) a
// different existing item even though they came from the same email.
async function matchTrip(supabase: Json, ownerId: string, p: Json): Promise<{ tripId: string | null; suggestedItemId: string | null; matchReasoning: string | null }> {
  if (!p.start_date) return { tripId: null, suggestedItemId: null, matchReasoning: null };

  const { data: trips } = await supabase
    .from("trips").select("id, name, start_date, end_date")
    .eq("user_id", ownerId).is("deleted_at", null)
    .lte("start_date", p.start_date)
    .gte("end_date", p.start_date);
  const candidates = trips && trips.length > 0 ? trips : (
    await supabase.from("trips").select("id, name, start_date, end_date")
      .eq("user_id", ownerId).is("deleted_at", null)
  ).data?.filter((t: Json) => {
    const d = new Date(p.start_date).getTime();
    return d >= new Date(t.start_date).getTime() - 3 * 86400000 && d <= new Date(t.end_date).getTime() + 3 * 86400000;
  }) ?? [];

  if (candidates.length > 1) {
    return { tripId: null, suggestedItemId: null, matchReasoning: `${candidates.length} trips overlap this date — pick one on the review screen.` };
  }
  if (candidates.length !== 1) return { tripId: null, suggestedItemId: null, matchReasoning: null };

  const tripId = candidates[0].id;

  // Cheap deterministic candidate-item match — no extra AI call. Scored,
  // not applied: the review screen always shows this as a suggestion the
  // user can accept or swap for "create new instead".
  const { data: items } = await supabase
    .from("items").select("id, title, type, start_date, vendor, confirmation_code")
    .eq("trip_id", tripId).eq("type", p.type).is("deleted_at", null);
  let best: Json | null = null;
  let bestScore = 0;
  for (const it of items ?? []) {
    let score = 0;
    if (p.confirmation_code && it.confirmation_code && it.confirmation_code.toLowerCase() === String(p.confirmation_code).toLowerCase()) score += 10;
    if (p.vendor && it.vendor && it.vendor.toLowerCase() === String(p.vendor).toLowerCase()) score += 3;
    const titleWords = String(p.title).toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
    const itTitleLower = String(it.title).toLowerCase();
    score += titleWords.filter((w: string) => itTitleLower.includes(w)).length;
    if (it.start_date && p.start_date) {
      const days = Math.abs(new Date(it.start_date).getTime() - new Date(p.start_date).getTime()) / 86400000;
      if (days <= 1) score += 2;
    }
    if (score > bestScore) { bestScore = score; best = it; }
  }
  if (best && bestScore >= 3) {
    return { tripId, suggestedItemId: best.id, matchReasoning: `Matched against existing item "${best.title}" (score ${bestScore}).` };
  }
  return { tripId, suggestedItemId: null, matchReasoning: null };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const secret = Deno.env.get("EMAIL_WEBHOOK_SECRET");
  if (!secret || url.searchParams.get("token") !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const ownerId = Deno.env.get("MANIFEST_OWNER_USER_ID");
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ownerId) return new Response(JSON.stringify({ error: "MANIFEST_OWNER_USER_ID is not set." }), { status: 500 });
  if (!apiKey) return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY is not set." }), { status: 500 });

  let body: Json;
  try {
    body = await parseRequestBody(req);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), { status: 400 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { from, subject, plainBody } = extractEmailFields(body);

  const insertFailed = async (error: string) => {
    await supabase.from("email_proposals").insert({
      user_id: ownerId, raw_from: from, raw_subject: subject, raw_body: plainBody.slice(0, 5000),
      status: "failed", error,
    });
  };

  if (!plainBody.trim()) {
    await insertFailed("No plain-text body found in the forwarded email.");
    return new Response(JSON.stringify({ accepted: true }), { status: 200 });
  }

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2500,
        system: SYSTEM,
        messages: [{ role: "user", content: [{ type: "text", text: `Subject: ${subject}\nFrom: ${from}\n\n${plainBody}` }] }],
        tools: [PROPOSE_TOOL],
        tool_choice: { type: "tool", name: "propose_booking_items" },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      await insertFailed(`Claude API ${res.status}: ${errBody.slice(0, 300)}`);
      return new Response(JSON.stringify({ accepted: true }), { status: 200 });
    }
    const json = await res.json();
    const call = (json.content ?? []).find((c: Json) => c.type === "tool_use" && c.name === "propose_booking_items");
    const items: Json[] = call?.input?.items ?? [];
    if (!call || items.length === 0) {
      await insertFailed("The model didn't find a usable booking in this email.");
      return new Response(JSON.stringify({ accepted: true }), { status: 200 });
    }
    const usage = json.usage ?? {};
    // One Claude call covers every item in the email — split its cost
    // evenly across the rows it produced rather than recording the whole
    // call's cost on each one.
    const totalCost = (usage.input_tokens ?? 0) * USD_PER_INPUT_TOKEN + (usage.output_tokens ?? 0) * USD_PER_OUTPUT_TOKEN;
    const cost_usd = Number((totalCost / items.length).toFixed(4));

    let insertedCount = 0;
    const insertedTitles: string[] = [];
    let anyUpdateOrCancellation = false;

    for (const p of items) {
      const { tripId, suggestedItemId, matchReasoning } = await matchTrip(supabase, ownerId, p);

      const proposal = {
        type: field(p.type, "high"),
        title: field(p.title, p.title_confidence),
        start_date: field(p.start_date, p.date_confidence),
        end_date: field(p.end_date, p.date_confidence),
        time_start: field(p.time_start, p.date_confidence),
        time_end: field(p.time_end, p.date_confidence),
        address: field(p.address, p.address ? "medium" : "none"),
        phone: field(p.phone, p.phone ? "medium" : "none"),
        vendor: field(p.vendor, p.vendor ? "medium" : "none"),
        booking_source: field(p.booking_source, p.booking_source ? "medium" : "none"),
        confirmation_code: field(p.confirmation_code, p.confirmation_code ? "high" : "none"),
        link: field(p.link, p.link ? "medium" : "none"),
        notes: field(p.notes, p.notes ? "medium" : "none"),
        is_update_or_cancellation: !!p.is_update_or_cancellation,
        change_summary: p.change_summary ?? null,
        basis: p.basis ?? null,
      };

      const { data: inserted } = await supabase.from("email_proposals").insert({
        user_id: ownerId, raw_from: from, raw_subject: subject, raw_body: plainBody.slice(0, 5000),
        trip_id: tripId, suggested_item_id: suggestedItemId, match_reasoning: matchReasoning,
        proposal, status: "pending", cost_usd,
      }).select().single();

      if (inserted) {
        insertedCount++;
        insertedTitles.push(String(p.title || subject));
        if (p.is_update_or_cancellation) anyUpdateOrCancellation = true;
      }
    }

    if (insertedCount > 0) {
      const title = insertedCount === 1
        ? (anyUpdateOrCancellation ? "Booking update ready to review" : "New booking ready to review")
        : `${insertedCount} bookings ready to review`;
      const notifBody = insertedCount === 1
        ? `${insertedTitles[0]} — tap to review and apply.`
        : `${insertedTitles.join(", ")} — tap to review and apply.`;
      await notify(supabase, ownerId, title, notifBody);
    }

    return new Response(JSON.stringify({ accepted: true, items: insertedCount }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    await insertFailed(String(e instanceof Error ? e.message : e).slice(0, 500));
    return new Response(JSON.stringify({ accepted: true }), { status: 200 });
  }
});
