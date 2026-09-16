// Quick add: turns a pasted Google Maps link or a short natural-language
// sentence into a real item, then hands it straight into the existing
// identify-item/research-item pipeline (via IdentifyCandidatesModal) exactly
// as if the user had typed the title into the normal new-item form.
import { supabase } from "./supabase";
import { computeInsertSortOrder } from "./reorder";
import { ItemType } from "./types";

export interface QuickAddMapsResult {
  title: string;
  latitude: number | null;
  longitude: number | null;
}

export interface QuickAddNLResult {
  title: string;
  item_type: ItemType;
  date: string | null;
  time: string | null;
}

export async function parseMapsLink(url: string): Promise<{ result: QuickAddMapsResult | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("quick-add-parse", { body: { mode: "maps_link", url } });
  if (error) return { result: null, error: error.message ?? "Couldn't read that link." };
  if (data?.error) return { result: null, error: data.error };
  return { result: data as QuickAddMapsResult, error: null };
}

export async function parseNaturalLanguage(
  text: string, tripStart: string, tripEnd: string
): Promise<{ result: QuickAddNLResult | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("quick-add-parse", {
    body: { mode: "natural_language", text, trip_start: tripStart, trip_end: tripEnd },
  });
  if (error) return { result: null, error: error.message ?? "Couldn't parse that." };
  if (data?.error) return { result: null, error: data.error };
  return { result: data as QuickAddNLResult, error: null };
}

// Creates a minimal item row for a quick-add result. If a parsed date
// matches one of the trip's real days, the item lands there; otherwise it
// falls back to whichever day the user had open when they tapped Quick add
// (Proposals, from the trip overview FAB) — same default the plain add-item
// form uses, and just as reassignable afterward via its day picker.
export async function createQuickAddItem(params: {
  tripId: string;
  fallbackDayId: string;
  title: string;
  itemType: ItemType;
  date: string | null;
  time: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<{ id: string | null; error: string | null }> {
  let targetDayId = params.fallbackDayId;
  let startDate: string | null = null;

  if (params.date) {
    const { data: matchedDay } = await supabase
      .from("days").select("id, date").eq("trip_id", params.tripId).eq("date", params.date).maybeSingle();
    if (matchedDay) { targetDayId = matchedDay.id; startDate = matchedDay.date; }
  }
  if (startDate === null) {
    const { data: fallbackDay } = await supabase.from("days").select("date").eq("id", targetDayId).maybeSingle();
    startDate = fallbackDay?.date ?? null;
  }

  const { data: siblings } = await supabase
    .from("items").select("id, sort_order, time_start").eq("day_id", targetDayId).is("deleted_at", null);
  const sortOrder = computeInsertSortOrder(siblings ?? [], params.time || null);

  const { data: item, error } = await supabase.from("items").insert({
    trip_id: params.tripId,
    day_id: targetDayId,
    type: params.itemType,
    title: params.title,
    status: "planned",
    start_date: startDate,
    time_start: params.time || null,
    latitude: params.latitude ?? null,
    longitude: params.longitude ?? null,
    sort_order: sortOrder,
  }).select().single();
  if (error || !item) return { id: null, error: error?.message ?? "Couldn't create the item." };
  return { id: item.id, error: null };
}
