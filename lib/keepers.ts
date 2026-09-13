// Keepers: a personal log of places worth remembering, grouped by city.
// A keeper is a reusable snapshot of the *place* only — never a trip
// instance's own booking details (dates, confirmation numbers, etc.) — so
// the same keeper can be linked from any number of trip items across any
// number of trips (items.keeper_id), including future ones added via
// "Add to Trip".
import { supabase } from "./supabase";
import { Item, ItemType, Keeper, Trip, tripStatus } from "./types";

export type NewKeeperFields = Pick<Keeper,
  | "city_id" | "custom_city_name" | "city_label" | "item_type" | "title"
  | "address" | "phone" | "vendor"
  | "link" | "google_maps_link" | "latitude" | "longitude" | "map_icon" | "source_trip_name"
> & { rating: number | null; personal_notes: string | null };

/** Builds the keeper snapshot from a live item — expenses, shopping list,
 * quick notes, attachments, and anything about *this particular trip
 * instance* (dates, times, confirmation code, booking source, notes) are
 * deliberately never part of this, only the place's own descriptive
 * fields, since a keeper is meant to be reused across trips. */
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
    address: item.address,
    phone: item.phone,
    vendor: item.vendor,
    link: item.link,
    google_maps_link: item.google_maps_link,
    latitude: item.latitude,
    longitude: item.longitude,
    map_icon: item.map_icon,
    source_trip_name: sourceTripName,
    rating,
    personal_notes: personalNotes,
  };
}

export async function fetchKeeperById(keeperId: string): Promise<Keeper | null> {
  const { data, error } = await supabase.from("keepers").select("*").eq("id", keeperId).maybeSingle();
  if (error) throw error;
  return (data as Keeper) ?? null;
}

/** Creates the keeper, then links the item it came from back to it —
 * the same items.keeper_id every other trip instance of this keeper uses. */
export async function addKeeper(fields: NewKeeperFields, sourceItemId: string): Promise<string> {
  const { data, error } = await supabase.from("keepers").insert(fields).select("id").single();
  if (error) throw error;
  const { error: linkError } = await supabase.from("items").update({ keeper_id: data.id }).eq("id", sourceItemId);
  if (linkError) throw linkError;
  return data.id as string;
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

/** The descriptive, place-level fields a keeper and its linked trip items
 * are kept in sync on — never a trip instance's own booking details. Same
 * field set keeperFieldsFromItem snapshots from a fresh item, just named to
 * the item side (type/title/... instead of item_type/title/...). */
export interface KeeperSyncFields {
  item_type: ItemType;
  title: string;
  address: string | null;
  phone: string | null;
  vendor: string | null;
  link: string | null;
  google_maps_link: string | null;
  latitude: number | null;
  longitude: number | null;
  map_icon: string | null;
}

/** Pushes a keeper's descriptive fields onto every trip item still linked to
 * it. Called after editing the keeper directly, and after editing one of its
 * linked items (which writes the new values onto the keeper first, then
 * fans them back out here) — either way, whichever side was actually
 * touched last ends up as what every instance converges on. */
async function propagateKeeperToItems(keeperId: string, fields: KeeperSyncFields, excludeItemId?: string): Promise<void> {
  let query = supabase.from("items").update({
    type: fields.item_type,
    title: fields.title,
    address: fields.address,
    phone: fields.phone,
    vendor: fields.vendor,
    link: fields.link,
    google_maps_link: fields.google_maps_link,
    latitude: fields.latitude,
    longitude: fields.longitude,
    map_icon: fields.map_icon,
  }).eq("keeper_id", keeperId).is("deleted_at", null);
  if (excludeItemId) query = query.neq("id", excludeItemId);
  const { error } = await query;
  if (error) throw error;
}

/** Full keeper edit — title, type, and every other place-level field, not
 * just rating/notes — immediately fanned out to every trip item still
 * linked to this keeper. This is what "edit items directly on the Keepers
 * screen" actually does: correct the place once here, everywhere it's been
 * added picks it up. */
export async function editKeeper(id: string, fields: KeeperSyncFields): Promise<void> {
  const { error } = await supabase.from("keepers").update(fields).eq("id", id);
  if (error) throw error;
  await propagateKeeperToItems(id, fields);
}

/** Called after saving a trip item that's linked to a keeper, with that
 * item's current place-level fields: writes them onto the keeper (this edit
 * is now the newest thing that's happened to this place) and fans them back
 * out to every other trip instance of the same keeper. The keeper is always
 * the hub — an item never updates a sibling item directly. */
export async function syncItemToKeeper(keeperId: string, itemId: string, fields: KeeperSyncFields): Promise<void> {
  const { error } = await supabase.from("keepers").update({
    item_type: fields.item_type,
    title: fields.title,
    address: fields.address,
    phone: fields.phone,
    vendor: fields.vendor,
    link: fields.link,
    google_maps_link: fields.google_maps_link,
    latitude: fields.latitude,
    longitude: fields.longitude,
    map_icon: fields.map_icon,
  }).eq("id", keeperId);
  if (error) throw error;
  await propagateKeeperToItems(keeperId, fields, itemId);
}

export async function deleteKeeper(id: string): Promise<void> {
  const { error } = await supabase.from("keepers").delete().eq("id", id);
  if (error) throw error;
}

export interface KeeperTripLink {
  itemId: string;
  tripId: string;
  tripName: string;
  startDate: string | null;
}

/** Every trip item currently linked to this keeper — the "recurring
 * instances" list shown on the keeper's detail page. */
export async function fetchTripsForKeeper(keeperId: string): Promise<KeeperTripLink[]> {
  const { data, error } = await supabase
    .from("items")
    .select("id, trip_id, start_date, trips(name)")
    .eq("keeper_id", keeperId)
    .is("deleted_at", null)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as { id: string; trip_id: string; start_date: string | null; trips: { name: string } | null }[])
    .map((r) => ({ itemId: r.id, tripId: r.trip_id, tripName: r.trips?.name ?? "Untitled trip", startDate: r.start_date }));
}

/** Trips this keeper could still be added to — "Add to Trip" only offers
 * ones that haven't started yet. */
export async function fetchFutureTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from("trips").select("*")
    .is("deleted_at", null)
    .order("start_date");
  if (error) throw error;
  return ((data ?? []) as Trip[]).filter((t) => tripStatus(t) === "future");
}

/** Keepers whose city matches a day's resolved city — catalog cities match
 * by id, custom (non-catalog) city names match by the exact custom name. */
export async function fetchKeepersForCity(city: { cityId: string | null; customName: string | null }): Promise<Keeper[]> {
  if (!city.cityId && !city.customName) return [];
  let query = supabase.from("keepers").select("*");
  query = city.cityId ? query.eq("city_id", city.cityId) : query.eq("custom_city_name", city.customName as string);
  const { data, error } = await query.order("title");
  if (error) throw error;
  return (data ?? []) as Keeper[];
}
