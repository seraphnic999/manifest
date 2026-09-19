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

BOOKING LINK

For a dining, attraction, or ticketed-activity place, look for ONE real, confirmed link where a human could actually book or buy a ticket: the place's own booking/reservation page first, then a major reservation platform showing this exact venue (OpenTable, Resy, TheFork, Google's "Reserve a table"), then an attraction's official ticket page. Never a generic homepage with no booking function, never a directory listing, never a guessed search-results URL — if you cannot confirm a page that actually lets someone book or buy a ticket, leave it null with confidence "none". A wrong or dead booking link is worse than none.

Alongside the existing free-text reservation_lead_time, also give the same lead time as a plain number of days (reservation_lead_days_min/max) so the app can compute an actual date from it — e.g. "2-3 weeks ahead" becomes min 14, max 21; "book same day" becomes min 0, max 0; "book 6-8 weeks ahead" becomes min 42, max 56. Leave both null wherever reservation_lead_time itself is null.

PRICE RANGE

Only for dining/bar-type places. Report as one of "€", "€€", "€€€", "€€€€" (roughly: cheap eats, mid-range, upscale, splurge) based on what you find, never a specific number — a specific number goes stale immediately and a range doesn't.

RATINGS & REVIEWS

A second, separate axis from the logistics fields above: what this place IS and how well-regarded it is, not how to reach or book it.

- short_description: 2-3 plain sentences describing what the place is and what it's known for — the kind of thing you'd say to someone who's never heard of it. Not marketing copy, not a restatement of the name. Skip it (null) if you can't find enough to say something specific and true.
- google_rating / google_rating_count: the place's rating and review count from Google Maps/Search if you can find it (a review aggregator or the venue's own site quoting it is also fine, at lower confidence). A rating without knowing roughly how many reviews it's based on is close to meaningless — leave both null together if you only have one.
- review_highlights: 2-3 short sentences synthesizing what reviewers commonly say — the same shape as Google Maps' own "Know before you go" summaries (e.g. "Reviewers mention the tasting menu is worth the splurge" or "Visitors note it gets loud on weekend nights"). Synthesize from what multiple reviews actually say, not a single one-off review or your own opinion of the place. Omit entirely (empty array) rather than padding to 2-3 with something generic.
- award_badges: ONLY real, specific, checkable recognitions — a Michelin star or Bib Gourmand, a World's 50 Best Restaurants/Bars placement (with rank if you have it, e.g. "World's 50 Best Bars #23"), "50 Best Discovery", a similarly well-known regional or national award. Never invent one and never count generic praise ("locals' favorite", "hidden gem") as a badge — that belongs in review_highlights instead, not here. Applies mainly to dining/bar-type places; leave empty for most other item types unless a specific award genuinely applies (e.g. a hotel with a real, named industry award).

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
      reservation_lead_days_min: { type: ["integer", "null"], description: "reservation_lead_time as a number of days, lower bound. Null if reservation_lead_time is null." },
      reservation_lead_days_max: { type: ["integer", "null"], description: "reservation_lead_time as a number of days, upper bound. Null if reservation_lead_time is null." },

      booking_link: { type: ["string", "null"], description: "A confirmed page where this exact place can actually be booked/reserved/ticketed. Null if you cannot confirm one." },
      booking_link_confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
      booking_link_basis: { type: "string" },
      booking_link_source: { type: ["string", "null"] },

      price_range: { type: ["string", "null"], enum: ["€", "€€", "€€€", "€€€€", null], description: "Dining/bar only." },
      price_range_confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
      price_range_basis: { type: "string" },

      short_description: { type: ["string", "null"], description: "2-3 plain sentences on what the place is and is known for." },
      short_description_confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
      short_description_basis: { type: "string" },
      short_description_source: { type: ["string", "null"] },

      google_rating: { type: ["number", "null"], description: "E.g. 4.4. Null if you don't also have a review count." },
      google_rating_count: { type: ["integer", "null"], description: "E.g. 2992. Null if you don't also have a rating." },
      google_rating_confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
      google_rating_basis: { type: "string" },
      google_rating_source: { type: ["string", "null"] },

      review_highlights: { type: "array", items: { type: "string" }, description: "0-3 short sentences synthesizing common review themes, Google Maps 'Know before you go' style. Empty array if reviews don't converge on anything specific." },
      review_highlights_confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
      review_highlights_basis: { type: "string" },

      award_badges: { type: "array", items: { type: "string" }, description: "0-3 real, specific, checkable awards only (Michelin, World's 50 Best, etc.) — never generic praise. Empty array for most places." },
      award_badges_confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
      award_badges_basis: { type: "string" },
      award_badges_source: { type: ["string", "null"] },

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

// Only the item's OWN day, deliberately with no trip-primary fallback baked
// in here — see resolveLocator below for why. Mirrors identify-item's
// resolveCity/resolveDayCity split (reimplemented rather than imported;
// this Deno function has no access to the app's own TS modules).
function resolveDayCity(day: Json | null, tripCities: Json[]): { label: string; country: string | null } | null {
  if (day?.city_id) {
    const row = tripCities.find((r) => r.city_id === day.city_id);
    if (row?.city) return { label: row.city.name, country: row.city.country };
  }
  if (day?.custom_city_name) return { label: day.custom_city_name, country: null };
  return null;
}

function tripPrimaryCity(tripCities: Json[]): { label: string; country: string | null } | null {
  const primary = tripCities[0];
  if (primary?.city) return { label: primary.city.name, country: primary.city.country };
  if (primary?.custom_name) return { label: primary.custom_name, country: null };
  return null;
}

function distinctCityLabels(days: Json[], tripCities: Json[]): string[] {
  const labels = new Set<string>();
  for (const d of days) {
    const c = resolveDayCity(d, tripCities);
    if (c) labels.add(c.label);
  }
  return [...labels];
}

// An item sitting in Proposals (no day assigned yet) has no day-level city
// at all — resolveDayCity returns null and there's nothing here to build a
// locator from. That's exactly the situation identify-item's own
// trip-wide-context mode exists for, and by the time research-item runs,
// phase 1 has usually already worked out (via its own web search) which of
// the trip's cities the confirmed place is actually in — stored in
// job.identified_context.area_hint. Silently falling back to the trip's
// primary/first city instead of using that, on a multi-city trip, is how a
// correctly-identified Berlin restaurant ended up being researched as if it
// were in Paris purely because Paris happened to be trip_cities[0] — phase 2
// re-derived its own (wrong) location instead of trusting phase 1's already-
// correct one. Only once neither signal exists does this fall back to the
// trip's primary city, and even then — if the trip genuinely visits more
// than one place — it hands Claude the full set rather than asserting a
// single possibly-wrong city as fact.
async function resolveLocator(
  supabase: Json, item: Json, day: Json | null, tripCities: Json[], identifiedContext: Json | null
): Promise<{ locator: string | null; multiCityNote: string | null }> {
  const dayCity = resolveDayCity(day, tripCities);
  if (dayCity) return { locator: [dayCity.label, dayCity.country].filter(Boolean).join(", "), multiCityNote: null };

  const areaHint = identifiedContext?.area_hint as string | undefined | null;
  if (areaHint) return { locator: areaHint, multiCityNote: null };

  const { data: allDays } = await supabase.from("days").select("city_id, custom_city_name").eq("trip_id", item.trip_id);
  const distinct = distinctCityLabels((allDays ?? []) as Json[], tripCities);
  if (distinct.length > 1) {
    return {
      locator: null,
      multiCityNote: `This trip visits multiple destinations and no single one is pinned to this item: ${distinct.join(", ")}. Use the place's confirmed name/area and your own judgment (a web search if needed) to find which of these it's actually in — do not assume it's the first one listed.`,
    };
  }

  const primary = tripPrimaryCity(tripCities);
  return { locator: primary ? [primary.label, primary.country].filter(Boolean).join(", ") : null, multiCityNote: null };
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

async function notify(supabase: Json, userId: string, title: string, body: string, jobId: string) {
  const { data: tokens } = await supabase.from("push_tokens").select("expo_push_token").eq("user_id", userId);
  if (!tokens?.length) return;

  const messages = tokens.map((t: Json) => ({
    to: t.expo_push_token,
    title,
    body,
    sound: "default",
    data: { route: "/reviewQueue", jobId },
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

  const fail = async (msg: string, spend?: Spend, notifyCtx?: { userId: string; itemTitle: string }) => {
    await supabase.from("item_research_jobs").update({
      status: "failed",
      error: msg,
      completed_at: new Date().toISOString(),
      ...(spend && spend.turns > 0 ? { cost_usd: Number(costOf(spend).toFixed(4)), usage: { ...spend } } : {}),
    }).eq("id", jobId);

    if (notifyCtx) {
      try {
        await notify(supabase, notifyCtx.userId, "Research failed", `Couldn't finish researching ${notifyCtx.itemTitle}.`, jobId);
      } catch (e) {
        console.error("notify failed", e);
      }
    }
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

    const identifiedContext = (job.identified_context ?? null) as Json | null;
    const { locator, multiCityNote } = await resolveLocator(supabase, item, day, tripCities ?? [], identifiedContext);
    const anchorName = job.identified_name || item.title;

    const contextLines = [
      `Place to research: "${anchorName}"`,
      locator ? `Location: ${locator}` : null,
      multiCityNote,
      // Whatever phase 1 already worked out (often from its own web search)
      // about why this is the right place — trust it as a starting point
      // rather than re-deriving location from scratch and second-guessing a
      // correct answer.
      identifiedContext?.reasoning ? `Note from initial identification: ${identifiedContext.reasoning}` : null,
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

    // A lone rating with no review count (or vice versa) is close to
    // meaningless and shouldn't reach the review screen even if the model
    // didn't follow the "leave both null together" instruction exactly.
    const hasRatingPair = proposed.google_rating != null && proposed.google_rating_count != null;

    const proposal = {
      name: field(proposed.name, proposed.name_confidence, proposed.name_basis),
      address: field(proposed.address, proposed.address_confidence, proposed.address_basis, proposed.address_source),
      phone: field(proposed.phone, proposed.phone_confidence, proposed.phone_basis, proposed.phone_source),
      website: field(proposed.website, proposed.website_confidence, proposed.website_basis, proposed.website_source),
      google_maps_link: field(mapsLink, proposed.address_confidence ?? "medium", "Built from the confirmed name and location.", null),
      opening_hours: field(proposed.opening_hours, proposed.opening_hours_confidence, proposed.opening_hours_basis, proposed.opening_hours_source),
      reservation_lead_time: field(proposed.reservation_lead_time, proposed.reservation_lead_time_confidence, proposed.reservation_lead_time_basis, null),
      reservation_lead_days_min: field(proposed.reservation_lead_days_min, proposed.reservation_lead_time_confidence, proposed.reservation_lead_time_basis, null),
      reservation_lead_days_max: field(proposed.reservation_lead_days_max, proposed.reservation_lead_time_confidence, proposed.reservation_lead_time_basis, null),
      booking_link: field(proposed.booking_link, proposed.booking_link_confidence, proposed.booking_link_basis, proposed.booking_link_source),
      price_range: field(proposed.price_range, proposed.price_range_confidence, proposed.price_range_basis, null),
      latitude: field(lat, lat != null ? "medium" : "none", lat != null ? "Geocoded from the confirmed address." : "Could not geocode the address."),
      longitude: field(lon, lon != null ? "medium" : "none", lon != null ? "Geocoded from the confirmed address." : "Could not geocode the address."),
      short_description: field(proposed.short_description, proposed.short_description_confidence, proposed.short_description_basis, proposed.short_description_source),
      google_rating: field(hasRatingPair ? proposed.google_rating : null, hasRatingPair ? proposed.google_rating_confidence : "none", proposed.google_rating_basis, proposed.google_rating_source),
      google_rating_count: field(hasRatingPair ? proposed.google_rating_count : null, hasRatingPair ? proposed.google_rating_confidence : "none", proposed.google_rating_basis, proposed.google_rating_source),
      review_highlights: field(proposed.review_highlights?.length ? proposed.review_highlights : null, proposed.review_highlights_confidence, proposed.review_highlights_basis),
      award_badges: field(proposed.award_badges?.length ? proposed.award_badges : null, proposed.award_badges_confidence, proposed.award_badges_basis, proposed.award_badges_source),
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
      await notify(supabase, job.created_by, "Research ready", `${item.title} is ready for review.`, jobId);
    } catch (e) {
      console.error("notify failed", e);
    }
  } catch (e) {
    console.error("research failed", jobId, e);
    await fail(
      String(e instanceof Error ? e.message : e).slice(0, 500),
      spend,
      { userId: job.created_by, itemTitle: job.identified_name || "your item" }
    );
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
