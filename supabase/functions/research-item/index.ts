// Manifest — research-item Edge Function
//
// Phase 2 of the item-research agent: given an item and the place confirmed
// in phase 1 (identify-item), research its address, phone, website, opening
// hours and reservation lead time, then propose them for review. It never
// writes to `items` — a proposal becomes a real change only when a human
// accepts it in the app.
//
// Responds 202 immediately and finishes the work in the background via
// EdgeRuntime.waitUntil, the same reason Cellar's research-bottle function
// does: research takes real time, and the caller is a phone that may
// navigate away or be backgrounded the moment it queues the job.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";
// Both cost levers are read from the environment so they can be tuned from
// Supabase secrets without redeploying. A light, well-known venue uses two
// or three searches; an obscure one can run to the cap.
const MAX_SEARCHES = Number(Deno.env.get("RESEARCH_MAX_SEARCHES") ?? 8);
const MAX_TURNS = 6;

// Published Claude Sonnet 5 rates — a job's reported cost is computed from
// these, not guessed at.
const USD_PER_INPUT_TOKEN = 2 / 1_000_000;
const USD_PER_CACHE_READ_TOKEN = 0.2 / 1_000_000;
const USD_PER_CACHE_WRITE_TOKEN = 2.5 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 10 / 1_000_000;
const USD_PER_SEARCH = 10 / 1000;

// Hard ceiling per item. Enforced against measured spend, not estimated in
// advance: once a job crosses this, it gets one final turn with no search
// tool and a forced propose_item_details call, answering with whatever it
// already has.
const BUDGET_USD = Number(Deno.env.get("RESEARCH_BUDGET_USD") ?? 0.25);

const SYSTEM = `You research a specific real-world place for a trip-planning item and return a structured record for a human to review.

You are filling in a proposal a human will review before anything is saved. Your job is to be *correct and honest*, not complete. A blank field costs the user nothing. A confident wrong field — a phone number for the wrong branch, an address for a place that closed two years ago — costs them a plan built on bad information they may not notice until they're standing outside it.

RULES

1. You are told which place this is (a name, and usually an area/city). Confirm it's real and find: its address, phone number, official website, opening hours, and — if it's the kind of place you book ahead for — how far in advance a reservation is typically needed.

2. Never invent. If you cannot find something, return value null with confidence "none" and say why in basis. Many small or very local places genuinely have limited or no online presence — "no listing found" is the correct answer, not a plausible-sounding guess.

3. Every researched field must carry a source URL when you have one. If you cannot give a URL, the confidence is at best "low" and basis must say the value is inferred, not confirmed.

4. Confidence means: high = confirmed on the place's own official page or a current, named listing (its official site, or a major platform like Google/TripAdvisor/OpenTable showing current info). medium = a reliable secondary source (a review site, a press mention) that isn't the place's own listing. low = inferred — a typical pattern for this kind of venue, or an old source that might be stale. none = not found.

5. An assumption is never "high", whatever it's about. If a source is more than a year or two old, say so in basis and cap confidence at "medium".

TRAPS THAT HAVE CAUGHT PREVIOUS RUNS — check each before answering:

- Chains and multi-location businesses. Match the exact branch in the given city/area, not just the brand — a phone number or address for the wrong city's location is worse than no answer.
- Permanently closed. Check the source is current. A restaurant's own three-year-old menu page proves nothing about whether it's still open; a recent review or its live booking page does.
- Similarly-named places. A specific address is the tiebreaker when two venues share a name.
- Reservation lead time is an opinion, not a fact — say whose: the venue's own stated policy, a well-known rule of thumb for that kind of place ("popular tasting menus book out weeks ahead"), or your own inference. Leave it null for places that don't take reservations (most shops, most casual spots) rather than forcing an answer.
- Price range only applies to dining and bars. Leave it null with confidence "none" for anything else — do not guess a price range for a museum or a shop.

PRICE RANGE

Only for dining/bar-type places. Report as one of "€", "€€", "€€€", "€€€€" (roughly: cheap eats, mid-range, upscale, splurge) based on what you find, never a specific number — a specific number goes stale immediately and a range doesn't.

Finish by calling the propose_item_details tool exactly once. Do not write a prose summary.`;

const PROPOSE_TOOL = {
  name: "propose_item_details",
  description: "Return the researched place record. Call this exactly once, at the end, after any searching.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The place's confirmed real name (correct it if the given name was off)." },
      name_confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
      name_basis: { type: "string" },

      address: { type: ["string", "null"], description: "A clean mailing/street address only — no parentheticals or extra notes (e.g. which entrance to use, floor, landmark). That kind of detail belongs in address_basis instead, since this value is also used verbatim to build the geocoding query and the Google Maps link." },
      address_confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
      address_basis: { type: "string" },
      address_source: { type: ["string", "null"] },

      phone: { type: ["string", "null"], description: "In a dialable international format, e.g. +33 1 42 66 15 15." },
      phone_confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
      phone_basis: { type: "string" },
      phone_source: { type: ["string", "null"] },

      website: { type: ["string", "null"], description: "The place's own official site, not a directory listing." },
      website_confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
      website_basis: { type: "string" },
      website_source: { type: ["string", "null"] },

      opening_hours: { type: ["string", "null"], description: "Short form, e.g. 'Mon-Sat 12:00-15:00, 19:00-23:00; closed Sun'." },
      opening_hours_confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
      opening_hours_basis: { type: "string" },
      opening_hours_source: { type: ["string", "null"] },

      reservation_lead_time: { type: ["string", "null"], description: "E.g. '2-3 weeks ahead', 'Same day usually fine', null if not applicable." },
      reservation_lead_time_confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
      reservation_lead_time_basis: { type: "string" },

      price_range: { type: ["string", "null"], enum: ["€", "€€", "€€€", "€€€€", null], description: "Dining/bar only." },
      price_range_confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
      price_range_basis: { type: "string" },

      unresolved: { type: ["string", "null"], description: "What you could not establish and why. Shown at the top of the review screen." },
    },
    required: ["name", "name_confidence", "unresolved"],
  },
};

type Json = Record<string, any>;

interface Spend { input: number; cacheRead: number; cacheWrite: number; output: number; searches: number; turns: number; }
const emptySpend = (): Spend => ({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0, searches: 0, turns: 0 });
function addUsage(spend: Spend, usage: Json | undefined) {
  if (!usage) return;
  spend.turns += 1;
  spend.input += usage.input_tokens ?? 0;
  spend.cacheRead += usage.cache_read_input_tokens ?? 0;
  spend.cacheWrite += usage.cache_creation_input_tokens ?? 0;
  spend.output += usage.output_tokens ?? 0;
  spend.searches += usage.server_tool_use?.web_search_requests ?? 0;
}
function costOf(spend: Spend) {
  return (
    spend.input * USD_PER_INPUT_TOKEN +
    spend.cacheRead * USD_PER_CACHE_READ_TOKEN +
    spend.cacheWrite * USD_PER_CACHE_WRITE_TOKEN +
    spend.output * USD_PER_OUTPUT_TOKEN +
    spend.searches * USD_PER_SEARCH
  );
}

const field = (value: unknown, confidence: unknown, basis?: unknown, source?: unknown) => ({
  value: value ?? null,
  confidence: (confidence as string) || (value == null ? "none" : "medium"),
  basis: (basis as string) || null,
  source: (source as string) || null,
});

function resolveCity(day: Json | null, tripCities: Json[]): { label: string | null; country: string | null } {
  if (day?.city_id) {
    const row = tripCities.find((r) => r.city_id === day.city_id);
    if (row?.city) return { label: row.city.name, country: row.city.country };
  }
  if (day?.custom_city_name) return { label: day.custom_city_name, country: null };
  const primary = tripCities[0];
  if (primary?.city) return { label: primary.city.name, country: primary.city.country };
  if (primary?.custom_name) return { label: primary.custom_name, country: null };
  return { label: null, country: null };
}

// Deliberately a search-style link, not a coordinate pin — matches every
// Google Maps link already hand-entered in this app's own trip data
// (`maps/search/?api=1&query=<name, address or city>`), which resolves to
// the actual place listing when Maps opens it, not a bare lat/lon marker.
function buildMapsLink(name: string, locator: string | null): string {
  const query = locator ? `${name}, ${locator}` : name;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// Best-effort geocoding of the confirmed address, via Nominatim (OpenStreetMap)
// — free and keyless, the same "prefer a free API over a paid key" choice
// this app already made for weather (lib/weather.ts uses Open-Meteo's
// geocoder for city-level lookups; this is the address-level equivalent).
// Coordinates are a nice-to-have for the map view — the Maps link above
// works with or without them, so a failure here is silent, never fatal.
async function geocode(query: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
      { headers: { "User-Agent": "ManifestTravelApp/1.0 (personal itinerary app)" } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const row = rows?.[0];
    if (!row) return null;
    const lat = Number(row.lat);
    const lon = Number(row.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  } catch {
    return null;
  }
}

async function callClaude(apiKey: string, messages: Json[], finish = false) {
  const tools = finish
    ? [PROPOSE_TOOL]
    : [{ type: "web_search_20250305", name: "web_search", max_uses: MAX_SEARCHES }, PROPOSE_TOOL];
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages,
      tools,
      ...(finish ? { tool_choice: { type: "tool", name: "propose_item_details" } } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API ${res.status}: ${body.slice(0, 400)}`);
  }
  return await res.json();
}

async function notify(supabase: Json, userId: string, itemTitle: string, jobId: string) {
  const { data: tokens } = await supabase.from("push_tokens").select("expo_push_token").eq("user_id", userId);
  if (!tokens?.length) return;

  const messages = tokens.map((t: Json) => ({
    to: t.expo_push_token,
    title: "Research ready",
    body: `${itemTitle} is ready for review.`,
    sound: "default",
    data: { jobId },
  }));

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.data?.some?.((t: Json) => t.status !== "ok")) {
    console.error("push send returned an error ticket", jobId, JSON.stringify(json));
  }
}

async function research(jobId: string) {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

  const fail = async (msg: string, spend?: Spend) => {
    await supabase.from("item_research_jobs").update({
      status: "failed",
      error: msg,
      completed_at: new Date().toISOString(),
      ...(spend && spend.turns > 0 ? { cost_usd: Number(costOf(spend).toFixed(4)), usage: { ...spend } } : {}),
    }).eq("id", jobId);
  };

  if (!apiKey) return fail("ANTHROPIC_API_KEY is not set on this project.");

  const { data: job } = await supabase.from("item_research_jobs").select("*").eq("id", jobId).single();
  if (!job) return;

  await supabase.from("item_research_jobs").update({ status: "researching", started_at: new Date().toISOString() }).eq("id", jobId);

  const spend = emptySpend();
  let stoppedOnBudget = false;

  try {
    const { data: item, error: itemError } = await supabase.from("items").select("*").eq("id", job.item_id).single();
    if (itemError || !item) throw new Error("Item not found.");

    const [{ data: day }, { data: trip }, { data: tripCities }] = await Promise.all([
      item.day_id ? supabase.from("days").select("city_id, custom_city_name").eq("id", item.day_id).single() : Promise.resolve({ data: null }),
      supabase.from("trips").select("start_date, end_date").eq("id", item.trip_id).single(),
      supabase.from("trip_cities").select("city_id, custom_name, sort_order, city:cities(name, country)").eq("trip_id", item.trip_id).order("sort_order"),
    ]);

    const { label: cityLabel, country } = resolveCity(day, tripCities ?? []);
    const locator = [cityLabel, country].filter(Boolean).join(", ") || null;
    const anchorName = job.identified_name || item.title;

    const contextLines = [
      `Place to research: "${anchorName}"`,
      locator ? `Location: ${locator}` : null,
      `Item type: ${item.type}`,
      trip ? `Trip dates: ${trip.start_date} to ${trip.end_date}` : null,
      item.address ? `Already on file: ${item.address}` : null,
    ].filter(Boolean).join("\n");

    const messages: Json[] = [
      {
        role: "user",
        content: [{
          type: "text",
          text: `${contextLines}\n\nResearch this place and call propose_item_details with what you find. Leave anything you can't verify blank rather than guessing.`,
        }],
      },
    ];

    let proposed: Json | null = null;

    for (let turn = 0; turn < MAX_TURNS && !proposed; turn++) {
      const overBudget = costOf(spend) >= BUDGET_USD;
      if (overBudget) stoppedOnBudget = true;

      const resp = await callClaude(apiKey, messages, overBudget);
      addUsage(spend, resp.usage);

      const content: Json[] = resp.content ?? [];
      const call = content.find((c) => c.type === "tool_use" && c.name === "propose_item_details");
      if (call) { proposed = call.input; break; }
      if (overBudget) break;

      if (resp.stop_reason === "pause_turn" || resp.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content });
        if (resp.stop_reason === "tool_use") {
          messages.push({ role: "user", content: [{ type: "text", text: "Call propose_item_details now with what you have." }] });
        }
        continue;
      }
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: [{ type: "text", text: "Call propose_item_details now with what you have." }] });
    }

    if (!proposed) throw new Error("The research did not return a usable record.");

    const resolvedName = proposed.name || anchorName;
    const mapsLink = buildMapsLink(resolvedName, proposed.address || locator);

    let lat: number | null = null;
    let lon: number | null = null;
    if (proposed.address) {
      const coords = await geocode(`${resolvedName}, ${proposed.address}`);
      if (coords) { lat = coords.lat; lon = coords.lon; }
    }

    const proposal = {
      name: field(proposed.name, proposed.name_confidence, proposed.name_basis),
      address: field(proposed.address, proposed.address_confidence, proposed.address_basis, proposed.address_source),
      phone: field(proposed.phone, proposed.phone_confidence, proposed.phone_basis, proposed.phone_source),
      website: field(proposed.website, proposed.website_confidence, proposed.website_basis, proposed.website_source),
      google_maps_link: field(mapsLink, proposed.address_confidence ?? "medium", "Built from the confirmed name and location.", null),
      opening_hours: field(proposed.opening_hours, proposed.opening_hours_confidence, proposed.opening_hours_basis, proposed.opening_hours_source),
      reservation_lead_time: field(proposed.reservation_lead_time, proposed.reservation_lead_time_confidence, proposed.reservation_lead_time_basis, null),
      price_range: field(proposed.price_range, proposed.price_range_confidence, proposed.price_range_basis, null),
      latitude: field(lat, lat != null ? "medium" : "none", lat != null ? "Geocoded from the confirmed address." : "Could not geocode the address."),
      longitude: field(lon, lon != null ? "medium" : "none", lon != null ? "Geocoded from the confirmed address." : "Could not geocode the address."),
      unresolved: [
        proposed.unresolved ?? null,
        stoppedOnBudget ? `Research stopped at the $${BUDGET_USD.toFixed(2)} per-item limit, so some fields may be thinner than usual.` : null,
      ].filter(Boolean).join(" ") || null,
    };

    await supabase.from("item_research_jobs").update({
      status: "ready",
      proposal,
      completed_at: new Date().toISOString(),
      error: null,
      cost_usd: Number(costOf(spend).toFixed(4)),
      usage: { ...spend, budget_usd: BUDGET_USD, stopped_on_budget: stoppedOnBudget },
    }).eq("id", jobId);

    try {
      await notify(supabase, job.created_by, item.title, jobId);
    } catch (e) {
      console.error("notify failed", e);
    }
  } catch (e) {
    console.error("research failed", jobId, e);
    await fail(String(e instanceof Error ? e.message : e).slice(0, 500), spend);
  }
}

Deno.serve(async (req) => {
  let jobId: string | undefined;
  try {
    const body = await req.json();
    jobId = body?.job_id;
  } catch { /* fall through */ }
  if (!jobId) {
    return new Response(JSON.stringify({ error: "job_id is required" }), { status: 400 });
  }

  EdgeRuntime.waitUntil(research(jobId));

  return new Response(JSON.stringify({ accepted: true, job_id: jobId }), {
    status: 202,
    headers: { "content-type": "application/json" },
  });
});
