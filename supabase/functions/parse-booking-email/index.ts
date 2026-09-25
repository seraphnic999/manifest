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
import { encodeBase64 } from "jsr:@std/encoding/base64";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";
const USD_PER_INPUT_TOKEN = 2 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 10 / 1_000_000;

// A bundled travel-agent confirmation can genuinely carry this many
// distinct real documents — confirmed live: one real email had flight
// e-tickets, two hotel vouchers, and a transfer receipt, 6 real PDFs
// after filtering out HTML vouchers and one inline signature logo.
const MAX_ATTACHMENTS = 8;
const MAX_ATTACHMENT_BYTES = 15_000_000; // a real booking PDF/photo is a few MB at most

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
7. flight_number: for a flight only, the airline code immediately followed by the flight number with no space (e.g. "LY2371", not "LY 2371" or "EL AL 2371"). Null for every other type.
8. If one or more documents are attached, they are the authoritative source — extract the booking(s) from the attached document(s), not from any email text also given to you. A forwarded thread's own body is very often earlier back-and-forth discussion of OPTIONS that were later superseded by the final booking in the attachment (comparing hotels, asking about prices) — never mistake that discussion for a confirmed booking.

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
            flight_number: { type: ["string", "null"], description: "Flight-only: airline code + number with no space, e.g. 'LY2371'. Null otherwise." },
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

interface RawAttachment { key: string; file: File }

// SendGrid Inbound Parse posts multipart/form-data by default (not JSON) —
// parse whichever content-type actually arrives rather than assuming one,
// so a future provider change (or a manual JSON curl test) still works.
// Attachments (SendGrid's attachment1, attachment2, ... file parts) arrive
// as non-string form values — previously silently dropped by the
// string-only filter, which is why a real booking that only existed as a
// PDF attachment was never read at all.
async function parseRequestBody(req: Request): Promise<{ fields: Json; attachments: RawAttachment[] }> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    const fields: Json = {};
    const attachments: RawAttachment[] = [];
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") fields[key] = value;
      else attachments.push({ key, file: value });
    }
    return { fields, attachments };
  }
  return { fields: await req.json(), attachments: [] };
}

const SUPPORTED_ATTACHMENT_TYPES = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp",
]);

const EXTENSION_TO_TYPE: Json = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
};

// A signature logo or tracking pixel embedded in the HTML body always
// lands well under this — confirmed live against a real 3KB Outlook
// signature image alongside 26KB-171KB real booking PDFs in the same
// email; a real ticket/voucher/receipt is never this small.
const MIN_ATTACHMENT_BYTES = 5_000;

interface PreparedAttachment { mediaType: string; base64: string }

// Filters SendGrid's raw attachment parts down to the ones actually worth
// sending to the model. Two real gotchas confirmed live against an actual
// travel-agent email, both real attachments getting wrongly excluded:
//
// 1. SendGrid's `attachment-info` JSON gives a "content-id" to EVERY
//    attachment, not just inline/embedded ones — treating its mere
//    presence as "this is an inline logo, skip it" excluded every single
//    attachment in the email, including genuine booking PDFs. A
//    content-id only means something for an image (the only thing an
//    HTML body's <img src="cid:..."> can reference) — a PDF is never
//    referenced that way, so the check only applies there, and even for
//    images the size floor below is the real filter.
// 2. A mail client can mislabel a real PDF as generic
//    "application/octet-stream" — two of the real attachments in that
//    same email were exactly this. Fall back to the file's own extension
//    rather than trusting a declared type that doesn't match a `.pdf`
//    sitting right there in the filename.
async function prepareAttachments(fields: Json, raw: RawAttachment[]): Promise<PreparedAttachment[]> {
  let info: Json = {};
  try { info = JSON.parse(fields["attachment-info"] ?? "{}"); } catch { /* missing/malformed — treat as no metadata */ }

  const prepared: PreparedAttachment[] = [];
  for (const { key, file } of raw) {
    if (prepared.length >= MAX_ATTACHMENTS) break;
    if (!/^attachment\d+$/.test(key)) continue;

    const filename = String(info[key]?.filename || info[key]?.name || file.name || "");
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const declaredType = String(info[key]?.type || file.type || "").split(";")[0].trim().toLowerCase();
    const mediaType = SUPPORTED_ATTACHMENT_TYPES.has(declaredType) ? declaredType : EXTENSION_TO_TYPE[ext];
    if (!mediaType) continue;

    if (mediaType.startsWith("image/") && info[key]?.["content-id"]) continue;
    if (file.size < MIN_ATTACHMENT_BYTES || file.size > MAX_ATTACHMENT_BYTES) continue;

    const bytes = new Uint8Array(await file.arrayBuffer());
    prepared.push({ mediaType, base64: encodeBase64(bytes) });
  }
  return prepared;
}

function attachmentContentBlocks(attachments: PreparedAttachment[]): Json[] {
  return attachments.map((a) => (
    a.mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: a.base64 } }
      : { type: "image", source: { type: "base64", media_type: a.mediaType, data: a.base64 } }
  ));
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
    .from("items").select("id, title, type, start_date, vendor, confirmation_code, custom_fields")
    .eq("trip_id", tripId).eq("type", p.type).is("deleted_at", null);
  let best: Json | null = null;
  let bestScore = 0;
  // Loose enough to survive real-world variance the AI extraction and the
  // app's own hand-entered/researched data won't always agree on verbatim
  // ("EL AL" vs "ELAL", "LY 2371" vs "LY2371") — strip everything but
  // letters/digits before comparing rather than requiring an exact string.
  const norm = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const pFlightNum = norm(p.flight_number);
  for (const it of items ?? []) {
    let score = 0;
    if (p.confirmation_code && it.confirmation_code && it.confirmation_code.toLowerCase() === String(p.confirmation_code).toLowerCase()) score += 10;
    // As decisive as a confirmation code for a flight — same weight.
    // custom_fields.flight_number is how every flight item in this schema
    // already carries its number (see research-item's own convention),
    // whether the item was entered by hand, researched, or itself came from
    // a prior email — so this is usually populated even when confirmation
    // code isn't.
    const itFlightNum = norm(it.custom_fields?.flight_number);
    if (pFlightNum && itFlightNum && pFlightNum === itFlightNum) score += 10;
    if (p.vendor && it.vendor && norm(it.vendor) === norm(p.vendor)) score += 3;
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

async function extractBookingItems(apiKey: string, content: Json[]): Promise<{ items: Json[]; usage: Json } | { error: string }> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2500,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      tools: [PROPOSE_TOOL],
      tool_choice: { type: "tool", name: "propose_booking_items" },
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    return { error: `Claude API ${res.status}: ${errBody.slice(0, 300)}` };
  }
  const json = await res.json();
  const call = (json.content ?? []).find((c: Json) => c.type === "tool_use" && c.name === "propose_booking_items");
  return { items: call?.input?.items ?? [], usage: json.usage ?? {} };
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

  let fields: Json;
  let rawAttachments: RawAttachment[];
  try {
    const parsed = await parseRequestBody(req);
    fields = parsed.fields;
    rawAttachments = parsed.attachments;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), { status: 400 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { from, subject, plainBody } = extractEmailFields(fields);
  const attachments = await prepareAttachments(fields, rawAttachments);

  // Left in permanently, not just for this diagnosis — the only visibility
  // into what SendGrid actually sent vs. what this function chose to use,
  // useful the next time an extraction looks like it should have had an
  // attachment and didn't.
  console.log("parse-booking-email attachments:", JSON.stringify({
    raw_count: rawAttachments.length,
    raw: rawAttachments.map((a) => ({ key: a.key, name: a.file.name, type: a.file.type, size: a.file.size })),
    "attachment-info_present": typeof fields["attachment-info"] === "string",
    prepared_count: attachments.length,
    prepared_types: attachments.map((a) => a.mediaType),
  }));

  const insertFailed = async (error: string) => {
    await supabase.from("email_proposals").insert({
      user_id: ownerId, raw_from: from, raw_subject: subject, raw_body: plainBody.slice(0, 5000),
      status: "failed", error,
    });
  };

  if (attachments.length === 0 && !plainBody.trim()) {
    await insertFailed("No plain-text body or usable attachment found in the forwarded email.");
    return new Response(JSON.stringify({ accepted: true }), { status: 200 });
  }

  try {
    let items: Json[] = [];
    let usage: Json = {};
    let lastError: string | null = null;

    // Attachments first (they're the authoritative source per the system
    // prompt too) — only fall back to the noisier email body if the
    // attachment attempt errors or turns up nothing usable, e.g. a
    // forwarded thread whose final message just says "see attached" over
    // pages of earlier back-and-forth about OPTIONS that were later
    // superseded by the real (attached) booking.
    if (attachments.length > 0) {
      const attempt = await extractBookingItems(apiKey, [
        ...attachmentContentBlocks(attachments),
        { type: "text", text: `Subject: ${subject}\nFrom: ${from}\n\nExtract the booking(s) strictly from the attached document(s) above.` },
      ]);
      if ("error" in attempt) lastError = attempt.error;
      else if (attempt.items.length > 0) { items = attempt.items; usage = attempt.usage; }
    }

    if (items.length === 0 && plainBody.trim()) {
      const attempt = await extractBookingItems(apiKey, [
        { type: "text", text: `Subject: ${subject}\nFrom: ${from}\n\n${plainBody}` },
      ]);
      if ("error" in attempt) lastError = attempt.error;
      else { items = attempt.items; usage = attempt.usage; }
    }

    if (items.length === 0) {
      await insertFailed(lastError ?? "The model didn't find a usable booking in this email.");
      return new Response(JSON.stringify({ accepted: true }), { status: 200 });
    }

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
        flight_number: field(p.flight_number, p.flight_number ? "high" : "none"),
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
