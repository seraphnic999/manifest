// Manifest — check-entry-requirements Edge Function
//
// Runs once per trip (automatically right after the trip is created, or on
// demand via the trip's "Entry Validation" menu item): researches, for each
// distinct country the trip visits, what documents (beyond a passport) an
// Israeli citizen needs to enter — a visa, an ETA/permit, anything else
// checkable — then validates every companion attached to the trip actually
// holds a matching document valid at least MIN_VALIDITY_MONTHS beyond the
// trip's last day. Passport validity itself is checked the same way but
// unconditionally, not researched per country (see the standalone check in
// run() below). A shortfall becomes a row in entry_requirement_warnings; a
// since-resolved one is deleted.
//
// Responds 202 immediately and finishes in the background via
// EdgeRuntime.waitUntil — same reason research-item does: this can run
// several web searches and the caller (a phone finishing trip creation, or
// a menu tap) shouldn't have to wait on it.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";
const MAX_SEARCHES = Number(Deno.env.get("ENTRY_REQ_MAX_SEARCHES") ?? 10);
const MAX_TURNS = 8;

const USD_PER_INPUT_TOKEN = 2 / 1_000_000;
const USD_PER_CACHE_READ_TOKEN = 0.2 / 1_000_000;
const USD_PER_CACHE_WRITE_TOKEN = 2.5 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 10 / 1_000_000;
const USD_PER_SEARCH = 10 / 1000;
const BUDGET_USD = Number(Deno.env.get("ENTRY_REQ_BUDGET_USD") ?? 0.5);

const DOC_TYPES = ["passport", "national_id", "visa", "drivers_license", "other"] as const;

// The app enforces its own fixed 6-month passport/document validity floor
// (see MIN_VALIDITY_MONTHS below) regardless of a given country's actual
// legal minimum — the common airline-industry rule of thumb, and simpler
// and more consistent than trusting a researched number per country. So
// the agent is only asked to find *what* is required, never *how long it
// must remain valid* — that half is no longer part of its job.
const SYSTEM = `You research entry requirements for Israeli passport holders traveling to specific countries, for a trip-planning app. A human never reads your prose — you report structured findings the app uses to check whether the traveler already holds the right documents.

ASSUMPTIONS
- Every traveler is an Israeli citizen traveling on an Israeli passport, taking a normal short tourist or business trip (not immigrating, not working, not studying).

FOR EACH COUNTRY, DETERMINE
1. Whether Israeli passport holders can enter with nothing beyond a standard passport — if so, set no_special_requirements true and leave documents_required empty. Most short-stay destinations for Israelis are visa-free; do not invent a requirement that doesn't exist. The app itself separately checks passport validity, so do not report a passport-validity rule here even if you find one.
2. Any visa, electronic travel authorization (ETA/eTA/ESTA-style), entry permit, or other document that must be arranged before travel — add one documents_required entry per such document. Set matches_doc_type to whichever of these best describes something a traveler could physically hold on file: "visa" for a traditional visa (including an e-visa), or null if it's something else entirely that doesn't correspond to a document type (e.g. a standalone electronic authorization/pre-registration that isn't a stamped visa — those get matches_doc_type null, since there's no way to represent "I already have my ETA" as a held document type here). Never use "passport" here — passport rules are handled separately, not through this field.
3. EXCEPTION — do not report ETIAS (the EU's upcoming Schengen-area pre-travel authorization) as a requirement for any country, even if you find sources describing it. It has not yet come into force; treat Schengen-area countries as needing nothing beyond what rule 1 and 2 above would otherwise find.

RULES
- Never invent a requirement. If you're not sure a country has anything beyond standard visa-free entry, say so with no_special_requirements true rather than guessing at a plausible-sounding rule.
- requirement_summary is one plain sentence a traveler would understand (e.g. "Visa-free for stays up to 90 days; an ETA must be obtained online before travel.").
- description on each documents_required entry names the specific thing needed (e.g. "UK Electronic Travel Authorization (ETA)").
- Always include a source_url when you have one from your search.

Finish by calling propose_entry_requirements exactly once with one entry per country you were given, in the same order. Do not write prose.`;

const PROPOSE_TOOL = {
  name: "propose_entry_requirements",
  description: "Return entry-requirement findings, one entry per country given. Call exactly once, at the end.",
  input_schema: {
    type: "object",
    properties: {
      countries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            country: { type: "string" },
            requirement_summary: { type: "string" },
            no_special_requirements: { type: "boolean" },
            documents_required: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  matches_doc_type: { type: ["string", "null"], enum: [...DOC_TYPES, null] },
                  source_url: { type: ["string", "null"] },
                },
                required: ["description", "matches_doc_type", "source_url"],
              },
            },
          },
          required: ["country", "requirement_summary", "no_special_requirements", "documents_required"],
        },
      },
    },
    required: ["countries"],
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

async function callClaude(apiKey: string, messages: Json[], finish = false) {
  const tools = finish
    ? [PROPOSE_TOOL]
    : [{ type: "web_search_20250305", name: "web_search", max_uses: MAX_SEARCHES }, PROPOSE_TOOL];
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages,
      tools,
      ...(finish ? { tool_choice: { type: "tool", name: "propose_entry_requirements" } } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API ${res.status}: ${body.slice(0, 400)}`);
  }
  return await res.json();
}

async function notify(supabase: Json, userId: string, tripId: string, tripName: string, count: number, firstCountry: string) {
  const { data: tokens } = await supabase.from("push_tokens").select("expo_push_token").eq("user_id", userId);
  if (!tokens?.length) return;

  const title = "Entry requirement warning";
  const body = count === 1
    ? `${tripName}: a document needed for ${firstCountry} is missing or invalid.`
    : `${tripName}: ${count} entry-requirement warnings, starting with ${firstCountry}.`;

  const messages = tokens.map((t: Json) => ({
    to: t.expo_push_token, title, body, sound: "default",
    data: { route: `/trip/${tripId}` },
  }));

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.data?.some?.((t: Json) => t.status !== "ok")) {
    console.error("push send returned an error ticket", tripId, JSON.stringify(json));
  }
}

// The app's own fixed floor, applied to every document this feature checks
// (passport and any other required document alike) regardless of what any
// one country actually mandates — the common airline-check-in rule of
// thumb, and a single consistent number is simpler to reason about (and to
// show the user) than a different researched figure per country.
const MIN_VALIDITY_MONTHS = 6;

// A required document is satisfied only by a same-type document the
// companion holds whose expiry clears the trip's own end date by at least
// MIN_VALIDITY_MONTHS. A held document with no expiry_date on file is
// treated as satisfying the requirement — Doc Tracker doesn't force every
// document to carry one, and treating "unknown" as "invalid" would falsely
// warn on every such document. A requirement with matches_doc_type null can
// never be satisfied from Doc Tracker data at all (e.g. a standalone ETA)
// — it always warns until the finding itself no longer applies on a re-run.
function isSatisfied(docs: Json[], matchesDocType: string | null, tripEndDate: string): boolean {
  if (!matchesDocType) return false;
  const candidates = docs.filter((d) => d.type === matchesDocType);
  if (candidates.length === 0) return false;
  const deadline = new Date(`${tripEndDate}T00:00:00Z`);
  deadline.setUTCMonth(deadline.getUTCMonth() + MIN_VALIDITY_MONTHS);
  return candidates.some((d) => {
    if (!d.expiry_date) return true;
    return new Date(`${d.expiry_date}T00:00:00Z`) >= deadline;
  });
}

async function run(checkId: string, resetDismissed: boolean) {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

  const fail = async (msg: string, spend?: Spend) => {
    await supabase.from("entry_requirement_checks").update({
      status: "failed",
      error: msg,
      completed_at: new Date().toISOString(),
      ...(spend && spend.turns > 0 ? { cost_usd: Number(costOf(spend).toFixed(4)) } : {}),
    }).eq("id", checkId);
  };

  if (!apiKey) return fail("ANTHROPIC_API_KEY is not set on this project.");

  const { data: check } = await supabase.from("entry_requirement_checks").select("*").eq("id", checkId).single();
  if (!check) return;

  await supabase.from("entry_requirement_checks").update({ status: "researching", started_at: new Date().toISOString() }).eq("id", checkId);

  const spend = emptySpend();

  try {
    const { data: trip, error: tripError } = await supabase.from("trips").select("id, name, start_date, end_date, user_id").eq("id", check.trip_id).single();
    if (tripError || !trip) throw new Error("Trip not found.");

    const { data: tripCities } = await supabase
      .from("trip_cities").select("sort_order, city:cities(country, country_code)").eq("trip_id", check.trip_id).order("sort_order");

    // country_code "ZZ" is the placeholder for "At Sea" (migration_036) —
    // a cruise day at sea isn't a real jurisdiction with entry requirements
    // of its own, so it's excluded here rather than sent to the research
    // agent as if "International Waters" were a country to look up.
    const countries = [...new Set(
      (tripCities ?? [])
        .filter((r: Json) => r.city?.country && r.city?.country_code !== "ZZ")
        .map((r: Json) => r.city.country)
    )] as string[];

    if (countries.length === 0) {
      await supabase.from("entry_requirement_checks").update({
        status: "ready", countries: [], completed_at: new Date().toISOString(), error: null,
      }).eq("id", checkId);
      return;
    }

    const messages: Json[] = [
      {
        role: "user",
        content: [{
          type: "text",
          text: `Trip dates: ${trip.start_date} to ${trip.end_date}\nCountries visited: ${countries.join(", ")}\n\nResearch entry requirements for an Israeli passport holder for each country and call propose_entry_requirements with one entry per country, in this order.`,
        }],
      },
    ];

    let proposed: Json | null = null;
    let stoppedOnBudget = false;

    for (let turn = 0; turn < MAX_TURNS && !proposed; turn++) {
      const overBudget = costOf(spend) >= BUDGET_USD;
      if (overBudget) stoppedOnBudget = true;

      const resp = await callClaude(apiKey, messages, overBudget);
      addUsage(spend, resp.usage);

      const content: Json[] = resp.content ?? [];
      const call = content.find((c) => c.type === "tool_use" && c.name === "propose_entry_requirements");
      if (call) { proposed = call.input; break; }
      if (overBudget) break;

      messages.push({ role: "assistant", content });
      if (resp.stop_reason === "tool_use" || resp.stop_reason !== "pause_turn") {
        messages.push({ role: "user", content: [{ type: "text", text: "Call propose_entry_requirements now with what you have." }] });
      }
    }

    if (!proposed) throw new Error(stoppedOnBudget ? `Research stopped at the $${BUDGET_USD.toFixed(2)} limit with no result.` : "The research did not return a usable result.");

    const countryResults: Json[] = proposed.countries ?? [];

    await supabase.from("entry_requirement_checks").update({
      status: "ready", countries: countryResults, completed_at: new Date().toISOString(), error: null,
      cost_usd: Number(costOf(spend).toFixed(4)),
    }).eq("id", checkId);

    // Validate every companion on the trip against every country's requirements.
    const { data: tripCompanions } = await supabase.from("trip_companions").select("companion_id").eq("trip_id", check.trip_id);
    const companionIds = (tripCompanions ?? []).map((r: Json) => r.companion_id);

    // Keyed by companion + requirement text only (not country) — the exact
    // same requirement (ETIAS, most often) routinely applies identically to
    // every Schengen country on a trip, and the research agent reports it
    // with identical wording each time, so grouping on that text merges
    // them into one warning listing every country it applies to instead of
    // repeating the same finding three times.
    const wanted = new Map<string, { companion_id: string; countries: Set<string>; requirement_description: string; matches_doc_type: string | null }>();

    if (companionIds.length > 0) {
      const { data: allDocs } = await supabase.from("travel_documents").select("companion_id, type, expiry_date").in("companion_id", companionIds);
      const docsByCompanion = new Map<string, Json[]>();
      for (const d of allDocs ?? []) {
        const list = docsByCompanion.get(d.companion_id) ?? [];
        list.push(d);
        docsByCompanion.set(d.companion_id, list);
      }

      // Passport validity is checked once per companion, independent of
      // any single country's findings — every country needs *some* valid
      // passport, including the many with no_special_requirements at all,
      // so this can't live inside the per-country loop below the way the
      // other document checks do.
      for (const companionId of companionIds) {
        const docs = docsByCompanion.get(companionId) ?? [];
        if (!isSatisfied(docs, "passport", trip.end_date)) {
          wanted.set(`${companionId}|__passport__`, {
            companion_id: companionId, countries: new Set(countries),
            requirement_description: `Passport valid at least ${MIN_VALIDITY_MONTHS} months beyond the trip's last day`,
            matches_doc_type: "passport",
          });
        }
      }

      for (const c of countryResults) {
        if (c.no_special_requirements || !c.documents_required?.length) continue;
        for (const companionId of companionIds) {
          const docs = docsByCompanion.get(companionId) ?? [];
          for (const req of c.documents_required) {
            // ETIAS isn't yet enforced — filtered here too as a backstop in
            // case the model reports it despite the system prompt telling
            // it not to. Passport-type entries are skipped since that's
            // now the standalone check above, not a per-country one.
            if (/etias/i.test(req.description) || req.matches_doc_type === "passport") continue;
            const ok = isSatisfied(docs, req.matches_doc_type, trip.end_date);
            if (!ok) {
              const key = `${companionId}|${req.description}`;
              const existing = wanted.get(key);
              if (existing) existing.countries.add(c.country);
              else wanted.set(key, {
                companion_id: companionId, countries: new Set([c.country]),
                requirement_description: req.description, matches_doc_type: req.matches_doc_type,
              });
            }
          }
        }
      }
    }

    const { data: existingRows } = await supabase
      .from("entry_requirement_warnings").select("id, companion_id, countries, requirement_description").eq("trip_id", check.trip_id);

    const existingByKey = new Map((existingRows ?? []).map((w: Json) => [`${w.companion_id}|${w.requirement_description}`, w]));
    const staleIds = (existingRows ?? [])
      .filter((w: Json) => !wanted.has(`${w.companion_id}|${w.requirement_description}`))
      .map((w: Json) => w.id);

    if (staleIds.length > 0) {
      await supabase.from("entry_requirement_warnings").delete().in("id", staleIds);
    }

    const toInsert: Json[] = [];
    const toUpdate: { id: string; countries: string[] }[] = [];
    for (const [key, w] of wanted) {
      const sortedCountries = [...w.countries].sort();
      const existingRow = existingByKey.get(key);
      if (!existingRow) {
        toInsert.push({
          trip_id: check.trip_id, companion_id: w.companion_id, countries: sortedCountries,
          requirement_description: w.requirement_description, matches_doc_type: w.matches_doc_type,
        });
      } else if (JSON.stringify(existingRow.countries) !== JSON.stringify(sortedCountries)) {
        toUpdate.push({ id: existingRow.id, countries: sortedCountries });
      }
    }

    if (toInsert.length > 0) {
      await supabase.from("entry_requirement_warnings").insert(toInsert);
    }
    for (const u of toUpdate) {
      await supabase.from("entry_requirement_warnings").update({ countries: u.countries }).eq("id", u.id);
    }

    if (resetDismissed) {
      await supabase.from("entry_requirement_warnings").update({ dismissed_at: null }).eq("trip_id", check.trip_id);
    }

    const { data: activeWarnings } = await supabase
      .from("entry_requirement_warnings").select("countries").eq("trip_id", check.trip_id).is("dismissed_at", null)
      .order("countries");

    if (activeWarnings && activeWarnings.length > 0) {
      try {
        await notify(supabase, trip.user_id, trip.id, trip.name, activeWarnings.length, activeWarnings[0].countries?.[0] ?? "your trip");
      } catch (e) {
        console.error("notify failed", e);
      }
    }
  } catch (e) {
    console.error("entry requirements check failed", checkId, e);
    await fail(String(e instanceof Error ? e.message : e).slice(0, 500), spend);
  }
}

Deno.serve(async (req) => {
  let checkId: string | undefined;
  let resetDismissed = false;
  try {
    const body = await req.json();
    checkId = body?.check_id;
    resetDismissed = !!body?.reset_dismissed;
  } catch { /* fall through */ }
  if (!checkId) {
    return new Response(JSON.stringify({ error: "check_id is required" }), { status: 400 });
  }

  EdgeRuntime.waitUntil(run(checkId, resetDismissed));

  return new Response(JSON.stringify({ accepted: true, check_id: checkId }), {
    status: 202,
    headers: { "content-type": "application/json" },
  });
});
