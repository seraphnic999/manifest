// Manifest — quick-add-parse Edge Function
//
// Turns whatever a user pasted or attached into Quick Add — a Google Maps
// link, a natural-language sentence, any other URL, or a photo — into a
// first-draft item: a title, a best-guess item type, and a date/time if one
// was given. Nothing is written to the database here — the client creates
// the real `items` row from this, then runs the normal identify-item/
// research-item pipeline against it exactly as if the user had typed the
// title in by hand.
//
// Four modes, picked by the client via lightweight auto-detection of what
// was pasted (Quick Add itself has no mode tabs any more):
//   maps_link — pure URL parsing, no LLM. Google's own non-shortened place
//     links already embed the place name and coordinates.
//   natural_language — a tiny Claude call, since "30/10" only resolves to a
//     real date with the trip's own date range as context.
//   url — any other link. Fetches the page, pulls a title from its own
//     <title>/og:title (no LLM here either), and returns the page's text
//     too — identify-item folds that in as extra context so a page that
//     names the actual place a few paragraphs into its own body (a blog
//     post, say) still resolves correctly, not just whatever the page's own
//     title happens to say.
//   image — a photo (a booking confirmation, a ticket, a flyer). One Claude
//     vision call extracts the same title/type/date/time shape as the
//     natural-language path. Sent as base64 directly in the request rather
//     than uploaded to storage first — nothing here needs to persist past
//     this one call.

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

const MAX_FETCH_BYTES = 2_000_000; // 2MB is plenty for an HTML page's markup; stops a huge/misbehaving response from tying up the function
const MAX_PAGE_TEXT_CHARS = 4000;

const PRIVATE_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
function isPrivateHost(hostname: string): boolean {
  if (PRIVATE_HOSTS.has(hostname)) return true;
  // Raw IP literals in the private/link-local ranges — a hostname-only
  // check (not a DNS-rebinding-proof one), but this is a low-stakes
  // authenticated-user tool, not a public endpoint, so this is a
  // reasonable v1 guard against an obviously-wrong paste rather than a
  // hardened SSRF defense.
  const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&rsquo;/g, "’").replace(/&mdash;/g, "—");
}

function stripHtml(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const text = withoutScripts.replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
}

function extractTitle(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (og?.[1]) return decodeHtmlEntities(og[1]).trim();
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleTag?.[1]) return decodeHtmlEntities(titleTag[1]).trim();
  return null;
}

const MAX_REDIRECTS = 5;

// `redirect: "follow"` only checked the typed URL's own host against
// isPrivateHost — a page that 302s to an internal host would be followed
// there without ever being vetted. Each hop gets the same check now,
// walked by hand with redirect: "manual" rather than trusted blind.
async function fetchFollowingVettedRedirects(startUrl: URL): Promise<Response> {
  let url = startUrl;
  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const res = await fetch(url.toString(), {
      redirect: "manual",
      headers: { "user-agent": "Mozilla/5.0 (compatible; ManifestQuickAdd/1.0)" },
    });
    if (res.status < 300 || res.status >= 400 || !res.headers.get("location")) return res;
    const next = new URL(res.headers.get("location")!, url);
    if (next.protocol !== "http:" && next.protocol !== "https:") throw new Error("Redirected to an unsupported protocol.");
    if (isPrivateHost(next.hostname)) throw new Error("Redirected to an unreachable host.");
    url = next;
  }
  throw new Error("Too many redirects.");
}

async function parseUrl(rawUrl: string): Promise<{ title: string; page_text: string } | { error: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { error: "That doesn't look like a valid link." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: "That doesn't look like a valid link." };
  }
  if (isPrivateHost(url.hostname)) {
    return { error: "That link isn't reachable." };
  }

  let html: string;
  try {
    const res = await fetchFollowingVettedRedirects(url);
    if (!res.ok) return { error: `Couldn't open that link (${res.status}).` };
    const buf = await res.arrayBuffer();
    html = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, MAX_FETCH_BYTES));
  } catch {
    return { error: "Couldn't open that link." };
  }

  const title = extractTitle(html);
  if (!title) return { error: "Couldn't find a name on that page — try pasting the place name directly instead." };

  const pageText = stripHtml(html).slice(0, MAX_PAGE_TEXT_CHARS);
  return { title, page_text: pageText };
}

async function parseImage(
  base64: string, mediaType: string
): Promise<{ title: string; item_type: string; date: string | null; time: string | null; cost_usd: number } | { error: string }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { error: "ANTHROPIC_API_KEY is not set on this project." };

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      system: `Extract a trip item from a photo the user attached to a "quick add" box — a screenshot of a booking confirmation, a ticket, a menu, a flyer, anything that names a specific place, event, or reservation.

Return a clean title (the place/venue/event name — not the whole confirmation text), a best-guess item type, and a date/time if the photo shows one.

item_type must be exactly one of: ${ITEM_TYPES.join(", ")}. Guess from context; use "other" only if nothing fits.

Dates: return YYYY-MM-DD, or null if none is shown. Times: 24-hour HH:MM, or null.

If the photo doesn't clearly show a specific place, event, or reservation, call the tool with title set to an empty string instead of guessing.

Call extract_quick_add exactly once. No prose.`,
      messages: [{
        role: "user",
        content: [{ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }],
      }],
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
  if (!call.input?.title) return { error: "Couldn't make out a place or booking in that photo." };
  const usage = json.usage ?? {};
  const cost_usd = Number((
    (usage.input_tokens ?? 0) * USD_PER_INPUT_TOKEN + (usage.output_tokens ?? 0) * USD_PER_OUTPUT_TOKEN
  ).toFixed(5));
  return { ...call.input, cost_usd };
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

    if (body?.mode === "url") {
      if (!body.url || typeof body.url !== "string") {
        return new Response(JSON.stringify({ error: "url is required" }), { status: 400 });
      }
      const result = await parseUrl(body.url);
      if ("error" in result) return new Response(JSON.stringify(result), { status: 422 });
      return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
    }

    if (body?.mode === "image") {
      if (!body.base64 || typeof body.base64 !== "string") {
        return new Response(JSON.stringify({ error: "base64 is required" }), { status: 400 });
      }
      // ~5.6MB of base64 text (~4MB of actual image bytes) — large enough
      // for a real photo even without client-side resizing, small enough to
      // fail fast on an oversized upload instead of tying up the function.
      if (body.base64.length > 5_600_000) {
        return new Response(JSON.stringify({ error: "That photo is too large — try a smaller one." }), { status: 413 });
      }
      const result = await parseImage(body.base64, body.media_type || "image/jpeg");
      if ("error" in result) return new Response(JSON.stringify(result), { status: 422 });
      return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "mode must be 'maps_link', 'natural_language', 'url', or 'image'" }), { status: 400 });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e instanceof Error ? e.message : e).slice(0, 300) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});
