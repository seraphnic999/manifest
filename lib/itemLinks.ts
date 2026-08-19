import { supabase } from "./supabase";

export interface LinkedItemSummary {
  id: string;
  title: string;
  type: string;
  day_date: string | null;
  time_start: string | null;
}

// item_links stores one row per pair, ordered so item_id_a is always the
// lexically-smaller uuid — this keeps "are these two linked" a single
// unique check instead of needing to look both directions in the table.
function orderedPair(itemIdA: string, itemIdB: string): [string, string] {
  return itemIdA < itemIdB ? [itemIdA, itemIdB] : [itemIdB, itemIdA];
}

export async function linkItems(itemIdA: string, itemIdB: string): Promise<void> {
  if (itemIdA === itemIdB) return;
  const [a, b] = orderedPair(itemIdA, itemIdB);
  const { error } = await supabase.from("item_links").insert({ item_id_a: a, item_id_b: b });
  // 23505 = unique_violation: already linked, nothing to do.
  if (error && error.code !== "23505") throw error;
}

export async function unlinkItems(itemIdA: string, itemIdB: string): Promise<void> {
  const [a, b] = orderedPair(itemIdA, itemIdB);
  const { error } = await supabase.from("item_links").delete().eq("item_id_a", a).eq("item_id_b", b);
  if (error) throw error;
}

/** All items linked to `itemId`, with enough info to render a nav row (title/type/date/time). */
export async function fetchLinkedItems(itemId: string): Promise<LinkedItemSummary[]> {
  const { data: links } = await supabase
    .from("item_links").select("item_id_a, item_id_b")
    .or(`item_id_a.eq.${itemId},item_id_b.eq.${itemId}`);
  if (!links || links.length === 0) return [];

  const otherIds = links.map((l) => (l.item_id_a === itemId ? l.item_id_b : l.item_id_a));
  const { data: items } = await supabase
    .from("items").select("id, title, type, time_start, day_id, days(date)").in("id", otherIds).is("deleted_at", null);
  if (!items) return [];

  return (items as any[]).map((i) => ({
    id: i.id, title: i.title, type: i.type,
    time_start: i.time_start, day_date: i.days?.date ?? null,
  }));
}
