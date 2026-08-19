import { supabase } from "./supabase";

export interface QuickNote {
  id: string;
  text: string;
  sort_order: number;
}

export async function fetchQuickNotes(itemId: string): Promise<QuickNote[]> {
  const { data } = await supabase
    .from("item_quick_notes").select("id, text, sort_order").eq("item_id", itemId)
    .order("sort_order").order("created_at");
  return data ?? [];
}

export async function addQuickNote(itemId: string, sortOrder: number): Promise<QuickNote> {
  const { data, error } = await supabase
    .from("item_quick_notes").insert({ item_id: itemId, text: "", sort_order: sortOrder }).select().single();
  if (error || !data) throw error ?? new Error("Unknown error");
  return data as QuickNote;
}

export async function updateQuickNoteText(id: string, text: string): Promise<void> {
  const { error } = await supabase.from("item_quick_notes").update({ text }).eq("id", id);
  if (error) throw error;
}

export async function deleteQuickNote(id: string): Promise<void> {
  const { error } = await supabase.from("item_quick_notes").delete().eq("id", id);
  if (error) throw error;
}
