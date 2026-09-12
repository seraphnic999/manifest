// Manifest — identify-item Edge Function
//
// Phase 1 of the item-research agent: given a trip item's title and where/
// when the trip actually is, propose which specific real-world place it
// most likely refers to. Synchronous and fast — the caller is a phone
// screen with a spinner on it, not a background queue. Returns candidates
// directly; nothing is written to the database here.
//
// Phase 2 (the slow, background research once the user confirms a
// candidate) is the separate research-item function.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";
const MAX_SEARCHES = Number(Deno.env.get("IDENTIFY_MAX_SEARCHES") ?? 2);
const MAX_TURNS = 3;

// Same published Claude Sonnet 5 rates the research-item function uses —
// kept in both files rather than shared, since Deno edge functions here
// are each self-contained (no shared module bundling set up).
const USD_PER_INPUT_TOKEN = 2 / 1_000_000;
const USD_PER_CACHE_READ_TOKEN = 0.2 / 1_000_000;
const USD_PER_CACHE_WRITE_TOKEN = 2.5 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 10 / 1_000_000;
const USD_PER_SEARCH = 10 / 1000;

// This step exists to be quick and cheap — it only has to narrow down
// *which* place, not research it. A tiny budget keeps it that way even if
// something goes wrong with a turn.
const BUDGET_USD = Number(Deno.env.get("IDENTIFY_BUDGET_USD") ?? 0.05);

const SYSTEM = `You identify which specific real-world place a trip-planning item most likely refers to, given its title and where/when the trip actually is.

You are step one of two. A human will look at your candidates and quickly confirm which one they meant, before any real research happens — so give them real options to choose from, not one guess dressed up as certain.

RULES

1. Ground candidates in the given city/country and dates if that helps — a chain with one location in that city, a seasonal event, a neighborhood that fits the trip's other days.
2. If the title is already a specific, unambiguous business name for that destination, return exactly one candidate at "high" confidence. Don't invent alternatives that don't exist just to fill the list.
3. If the title is generic ("Dinner", "Museum visit", "Airport transfer") or which exact venue is meant is genuinely unclear, return up to 4 real, named candidates, most likely first.
4. Use at most one web search, and only if you are genuinely unsure. Most items should resolve from your own knowledge of the destination without searching at all — this step is meant to be fast.
5. Never invent a place that does not exist. If nothing plausible comes to mind, return an empty candidates array rather than guessing.

Call propose_candidates exactly once, at the end. No prose.`;

const PROPOSE_TOOL = {
  name: "propose_candidates",
  description: "Return the candidate real-world places this item might refer to. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      candidates: {
        type: "array",
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "The place's real name." },
            area_hint: { type: ["string", "null"], description: "Neighborhood/street/landmark, if it helps tell candidates apart." },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            reasoning: { type: "string", description: "One short sentence: why this candidate." },
          },
          required: ["name", "confidence", "reasoning"],
        },
      },
    },
    required: ["candidates"],
  },
};

type Json = Record<string, any>;

interface Spend { input: number; cacheRead: number; cacheWrite: number; output: number; searches: number; }
const emptySpend = (): Spend => ({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0, searches: 0 });
function addUsage(spend: Spend, usage: Json | undefined) {
  if (!usage) return;
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

// Mirrors lib/cities.ts's resolveDayCityPick() — reimplemented here rather
// than imported, since this Deno function has no access to the app's own
// TS modules. Same three-tier fallback: day override, then trip primary.
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

async function callClaude(apiKey: string, messages: Json[]) {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: MAX_SEARCHES }, PROPOSE_TOOL],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API ${res.status}: ${body.slice(0, 400)}`);
  }
  return await res.json();
}

Deno.serve(async (req) => {
  let itemId: string | undefined;
  try {
    const body = await req.json();
    itemId = body?.item_id;
  } catch { /* fall through */ }
  if (!itemId) {
    return new Response(JSON.stringify({ error: "item_id is required" }), { status: 400 });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY is not set on this project." }), { status: 500 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { data: item, error: itemError } = await supabase.from("items").select("*").eq("id", itemId).single();
    if (itemError || !item) throw new Error("Item not found.");

    const [{ data: day }, { data: trip }, { data: tripCities }] = await Promise.all([
      item.day_id ? supabase.from("days").select("city_id, custom_city_name").eq("id", item.day_id).single() : Promise.resolve({ data: null }),
      supabase.from("trips").select("start_date, end_date").eq("id", item.trip_id).single(),
      supabase.from("trip_cities").select("city_id, custom_name, sort_order, city:cities(name, country)").eq("trip_id", item.trip_id).order("sort_order"),
    ]);

    const { label: cityLabel, country } = resolveCity(day, tripCities ?? []);
    const contextLines = [
      `Item title: "${item.title}"`,
      `Item type: ${item.type}`,
      cityLabel ? `Destination: ${cityLabel}${country ? `, ${country}` : ""}` : null,
      trip ? `Trip dates: ${trip.start_date} to ${trip.end_date}` : null,
    ].filter(Boolean).join("\n");

    const messages: Json[] = [
      {
        role: "user",
        content: [{ type: "text", text: `${contextLines}\n\nIdentify which specific real-world place this item most likely refers to, then call propose_candidates.` }],
      },
    ];

    const spend = emptySpend();
    let candidates: Json[] | null = null;

    for (let turn = 0; turn < MAX_TURNS && !candidates; turn++) {
      if (costOf(spend) >= BUDGET_USD) break;
      const resp = await callClaude(apiKey, messages);
      addUsage(spend, resp.usage);

      const content: Json[] = resp.content ?? [];
      const call = content.find((c) => c.type === "tool_use" && c.name === "propose_candidates");
      if (call) { candidates = call.input?.candidates ?? []; break; }

      if (resp.stop_reason === "pause_turn" || resp.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content });
        if (resp.stop_reason === "tool_use") {
          messages.push({ role: "user", content: [{ type: "text", text: "Call propose_candidates now with what you have." }] });
        }
        continue;
      }
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: [{ type: "text", text: "Call propose_candidates now with what you have." }] });
    }

    return new Response(
      JSON.stringify({ candidates: candidates ?? [], cost_usd: Number(costOf(spend).toFixed(4)) }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    console.error("identify-item failed", itemId, e);
    return new Response(
      JSON.stringify({ error: String(e instanceof Error ? e.message : e).slice(0, 300) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});
