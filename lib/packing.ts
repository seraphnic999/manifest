import { supabase } from "./supabase";

export const PACKING_CATEGORIES = ["Clothing", "Documents", "Electronics", "Toiletries", "Other"];

export interface PackingSourceItem {
  name: string;
  category: string | null;
}

/** Adds any source item whose name isn't already on the trip's packing
 * list (case-insensitive, trimmed) — used for template/copy-from-trip
 * population, both at trip creation and later from the packing screen, so
 * re-running it is always safe: dedup, never duplicates. */
export async function mergePackingItems(tripId: string, sourceItems: PackingSourceItem[]): Promise<void> {
  if (sourceItems.length === 0) return;
  const { data: existing, error } = await supabase.from("packing_items").select("name").eq("trip_id", tripId);
  if (error) throw error;
  const existingNames = new Set((existing ?? []).map((i) => i.name.trim().toLowerCase()));

  const seen = new Set<string>(); // also dedup within the source list itself
  const toInsert = sourceItems.filter((item) => {
    const key = item.name.trim().toLowerCase();
    if (!key || existingNames.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (toInsert.length === 0) return;

  const { data: current } = await supabase
    .from("packing_items").select("sort_order").eq("trip_id", tripId)
    .order("sort_order", { ascending: false }).limit(1);
  let nextOrder = (current?.[0]?.sort_order ?? -1) + 1;

  const { error: insertError } = await supabase.from("packing_items").insert(
    toInsert.map((item) => ({ trip_id: tripId, name: item.name.trim(), category: item.category, sort_order: nextOrder++ }))
  );
  if (insertError) throw insertError;
}

export async function fetchTemplateItems(templateId: string): Promise<PackingSourceItem[]> {
  const { data, error } = await supabase
    .from("packing_template_items").select("name, category").eq("template_id", templateId).order("sort_order");
  if (error) throw error;
  return (data ?? []) as PackingSourceItem[];
}

export async function fetchTripPackingAsSource(tripId: string): Promise<PackingSourceItem[]> {
  const { data, error } = await supabase
    .from("packing_items").select("name, category").eq("trip_id", tripId).order("sort_order");
  if (error) throw error;
  return (data ?? []) as PackingSourceItem[];
}
