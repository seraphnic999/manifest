import { supabase } from "./supabase";

export type SearchKind = "trip" | "item" | "shopping" | "expense";

export interface SearchResult {
  kind: SearchKind;
  id: string;
  trip_id: string;
  trip_name: string;
  title: string;
  subtitle: string;
}

export async function searchEverything(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const { data, error } = await supabase.rpc("search_everything", { query: trimmed });
  if (error) throw error;
  return (data ?? []) as SearchResult[];
}

export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  trip: "Trip",
  item: "Item",
  shopping: "Shopping list",
  expense: "Expense",
};
