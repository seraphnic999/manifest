// Keepers: a personal log of trip items worth remembering, grouped by city.
import { supabase } from "./supabase";
import { Item, Keeper } from "./types";

export type NewKeeperFields = Pick<Keeper,
  | "city_id" | "custom_city_name" | "city_label" | "item_type" | "title"
  | "start_date" | "end_date" | "time_start" | "time_end" | "timezone_start" | "timezone_end"
  | "notes" | "confirmation_code" | "booking_source" | "address" | "phone" | "vendor"
  | "link" | "google_maps_link" | "latitude" | "longitude" | "map_icon" | "source_trip_name" | "source_item_id"
> & { rating: number | null; personal_notes: string | null };

/** Builds the keeper snapshot from a live item — expenses, shopping list,
 * quick notes, and attachments are deliberately never part of this, only
 * the item's own descriptive fields. */
export function keeperFieldsFromItem(
  item: Item,
  city: { cityId: string | null; customName: string | null; label: string | null },
  sourceTripName: string | null,
  rating: number | null,
  personalNotes: string | null
): NewKeeperFields {
  return {
    city_id: city.cityId,
    custom_city_name: city.customName,
    city_label: city.label ?? "Unknown city",
    item_type: item.type,
    title: item.title,
    start_date: item.start_date,
    end_date: item.end_date,
    time_start: item.time_start,
    time_end: item.time_end,
    timezone_start: item.timezone_start,
    timezone_end: item.timezone_end,
    notes: item.notes,
    confirmation_code: item.confirmation_code,
    booking_source: item.booking_source,
    address: item.address,
    phone: item.phone,
    vendor: item.vendor,
    link: item.link,
    google_maps_link: item.google_maps_link,
    latitude: item.latitude,
    longitude: item.longitude,
    map_icon: item.map_icon,
    source_trip_name: sourceTripName,
    source_item_id: item.id,
    rating,
    personal_notes: personalNotes,
  };
}

/** Is this item already a keeper? Used to swap "Add to Keepers" for a
 * "Keeper" badge on the item detail screen. Deliberately not a live
 * reference elsewhere in the app — see migration_031 — so this is the one
 * place that reads the link. */
export async function fetchKeeperForItem(itemId: string): Promise<Keeper | null> {
  const { data, error } = await supabase.from("keepers").select("*").eq("source_item_id", itemId).maybeSingle();
  if (error) throw error;
  return (data as Keeper) ?? null;
}

export async function addKeeper(fields: NewKeeperFields): Promise<void> {
  const { error } = await supabase.from("keepers").insert(fields);
  if (error) throw error;
}

export async function fetchKeepers(): Promise<Keeper[]> {
  const { data, error } = await supabase
    .from("keepers").select("*")
    .order("city_label").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Keeper[];
}

export interface KeeperCityGroup {
  cityLabel: string;
  keepers: Keeper[];
}

export function groupKeepersByCity(keepers: Keeper[]): KeeperCityGroup[] {
  const map = new Map<string, Keeper[]>();
  for (const k of keepers) {
    const list = map.get(k.city_label) ?? [];
    list.push(k);
    map.set(k.city_label, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([cityLabel, list]) => ({ cityLabel, keepers: list }));
}

export async function updateKeeper(id: string, fields: Partial<Pick<Keeper, "rating" | "personal_notes">>): Promise<void> {
  const { error } = await supabase.from("keepers").update(fields).eq("id", id);
  if (error) throw error;
}

export async function deleteKeeper(id: string): Promise<void> {
  const { error } = await supabase.from("keepers").delete().eq("id", id);
  if (error) throw error;
}
