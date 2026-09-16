// Manifest — quick-add-parse Edge Function
//
// Turns a pasted Google Maps link or a natural-language sentence ("dinner at
// Shabour restaurant on 30/10 20:00") into a first-draft item: a title, a
// best-guess item type, and a date/time if one was given. Nothing is written
// to the database here — the client creates the real `items` row from this,
// then runs the normal identify-item/research-item pipeline against it
// exactly as if the user had typed the title in by hand.
//
// Maps-link mode is pure URL parsing, no LLM involved — Google's own
// non-shortened place links already embed the place name and coordinates.
// Natural-language mode needs a tiny Claude call, since "30/10" only
// resolves to a real date with the trip's own date range as context.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001"; // cheap on purpose — this is a short extraction, not research
const USD_PER_INPUT_TOKEN = 1 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 5 / 1_000_000;

const ITEM_TYPES = [
  "flight", "transfer", "transport", "lodging", "activity",
  "meal", "bar", "cafe", "bakery", "ice_cream", "sightseeing", "attraction", "shopping", "work", "other",
];

const SHORT_LINK_HOSTS = ["maps.app.goo.gl", "goo.gl"];

function decodeMapsSegment(s: string): string {
  return decodeURIComponent(s.replace(/\+/g, " ")).trim();
}

async function resolveShortLink(url: string): Promise<string> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    // Draining the body isn't needed for the redirect target, but avoids
    // leaving the response's stream unconsumed.
    await res.arrayBuffer().catch(() => {});
    return res.url || url;
  } catch {
    return url;
  }
}

async function parseMapsLink(
  rawUrl: string
): Promise<{ title: string; latitude: number | null; longitude: number | null } | { error: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { error: "That doesn't look like a valid link." };
  }

  const isShort = SHORT_LINK_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
  const finalUrl = isShort ? await resolveShortLink(url.toString()) : url.toString();

  let lat: number | null = null;
  let lon: number | null = null;
  const coordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (coordMatch) { lat = Number(coordMatch[1]); lon = Number(coordMatch[2]); }

  const placeMatch = finalUrl.match(/\/maps\/place\/([^/?]+)/);
  if (placeMatch) {
    return { title: decodeMapsSegment(placeMatch[1]), latitude: lat, longitude: lon };
  }
  const queryMatch = finalUrl.match(/[?&]q(?:uery)?=([^&]+)/);
  if (queryMatch) {
    return { title: decodeMapsSegment(queryMatch[1]), latitude: lat, longitude: lon };
  }
  return { error: "Couldn't read a place name from that link — try a full (non-shortened) Google Maps link, or paste the place name directly instead." };
}

const NL_SYSTEM = `Extract a trip item from one short natural-language sentence a user typed into a "quick add" box.

Return: a clean title (just the place/activity name — strip filler words like "add", "book", "dinner at" unless the venue name alone would be ambiguous), a best-guess item type, and a date/time if the sentence gives one.

item_type must be exactly one of: ${ITEM_TYPES.join(", ")}. Guess from context (e.g. "dinner"/"lunch" -> meal, "hotel"/"check in at" -> lodging, "flight to" -> flight); use "other" only if nothing fits.

Dates: the trip runs from {TRIP_START} to {TRIP_END}; today is {TODAY}. A partial date like "30/10" or "Oct 30" means day/month in that order (this app is not US-format) — resolve it to a full YYYY-MM-DD using whichever year keeps it inside the trip's range if at all plausible, otherwise the nearest sensible occurrence. Relative terms ("tomorrow", "next Friday") resolve against today. If no date is mentioned at all, return null — don't guess one.

Times: return 24-hour HH:MM, or null if none was given.

Call extract_quick_add exactly once. No prose.`;

const NL_TOOL = {
  name: "extract_quick_add",
  description: "Return the extracted title, item type, date, and time.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      item_type: { type: "string", enum: ITEM_TYPES },
      date: { type: ["string", "null"], description: "YYYY-MM-DD or null" },
      time: { type: ["string", "null"], description: "HH:MM 24-hour or null" },
    },
    required: ["title", "item_type", "date", "time"],
  },
};

async function parseNaturalLanguage(text: string, tripStart: string, tripEnd: string) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { error: "ANTHROPIC_API_KEY is not set on this project." };

  const today = new Date().toISOString().slice(0, 10);
  const system = NL_SYSTEM
    .replace("{TRIP_START}", tripStart || "unknown")
    .replace("{TRIP_END}", tripEnd || "unknown")
    .replace("{TODAY}", today);

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      system,
      messages: [{ role: "user", content: [{ type: "text", text }] }],
      tools: [NL_TOOL],
      tool_choice: { type: "tool", name: "extract_quick_add" },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { error: `Claude API ${res.status}: ${body.slice(0, 300)}` };
  }
  const json = await res.json();
  const call = (json.content ?? []).find((c: any) => c.type === "tool_use" && c.name === "extract_quick_add");
  if (!call) return { error: "The model didn't return a usable result." };
  const usage = json.usage ?? {};
  const cost_usd = Number((
    (usage.input_tokens ?? 0) * USD_PER_INPUT_TOKEN + (usage.output_tokens ?? 0) * USD_PER_OUTPUT_TOKEN
  ).toFixed(5));
  return { ...call.input, cost_usd };
}

Deno.serve(async (req) => {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), { status: 400 });
  }

  try {
    if (body?.mode === "maps_link") {
      if (!body.url || typeof body.url !== "string") {
        return new Response(JSON.stringify({ error: "url is required" }), { status: 400 });
      }
      const result = await parseMapsLink(body.url);
      if ("error" in result) return new Response(JSON.stringify(result), { status: 422 });
      return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
    }

    if (body?.mode === "natural_language") {
      if (!body.text || typeof body.text !== "string") {
        return new Response(JSON.stringify({ error: "text is required" }), { status: 400 });
      }
      const result = await parseNaturalLanguage(body.text, body.trip_start ?? "", body.trip_end ?? "");
      if ("error" in result) return new Response(JSON.stringify(result), { status: 502 });
      return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "mode must be 'maps_link' or 'natural_language'" }), { status: 400 });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e instanceof Error ? e.message : e).slice(0, 300) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});
