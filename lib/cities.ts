// Cities reference dataset + a trip's picked cities. Mirrors the shape of
// lib/destinationPhotos.ts's bundled-photo lookup (id-keyed list, simple
// client-side substring search) but backed by Supabase since this dataset
// is meant to grow over time without a client rebuild.
import { supabase } from "./supabase";
import { City, TripCity } from "./types";

let citiesCache: City[] | null = null;

/** Fetches the full cities dataset once per app session (small, static,
 * shared reference data — filtered client-side after, not per-keystroke). */
export async function fetchAllCities(): Promise<City[]> {
  if (citiesCache) return citiesCache;
  const { data, error } = await supabase.from("cities").select("*").order("name");
  if (error || !data) return [];
  citiesCache = data as City[];
  return citiesCache;
}

export function searchCities(cities: City[], query: string): City[] {
  const q = query.trim().toLowerCase();
  if (!q) return cities;
  return cities.filter((c) => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q));
}

export interface TripCityRow extends TripCity {
  city: City | null; // joined; null for a custom_name-only row
}

export async function fetchTripCities(tripId: string): Promise<TripCityRow[]> {
  const { data, error } = await supabase
    .from("trip_cities")
    .select("*, city:cities(*)")
    .eq("trip_id", tripId)
    .order("sort_order");
  if (error || !data) return [];
  return data as unknown as TripCityRow[];
}

/** Replaces a trip's entire trip_cities set in one call. Safe as a full
 * delete-then-reinsert because nothing else in the schema references
 * trip_cities.id, and the picker always operates on the complete ordered
 * list rather than incremental diffs. */
export async function saveTripCities(
  tripId: string,
  picks: { cityId: string | null; customName: string | null }[]
): Promise<void> {
  await supabase.from("trip_cities").delete().eq("trip_id", tripId);
  if (picks.length === 0) return;
  await supabase.from("trip_cities").insert(
    picks.map((p, i) => ({ trip_id: tripId, city_id: p.cityId, custom_name: p.customName, sort_order: i }))
  );
}
