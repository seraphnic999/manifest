// Cities reference dataset + a trip's picked cities. Mirrors the shape of
// lib/destinationPhotos.ts's bundled-photo lookup (id-keyed list, simple
// client-side substring search) but backed by Supabase since this dataset
// is meant to grow over time without a client rebuild.
import { supabase } from "./supabase";
import { City, TripCity, Day } from "./types";

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

/** The trip's primary destination (lowest sort_order) — null if none picked
 * yet. `rows` must come from fetchTripCities, which already orders by
 * sort_order. */
export function primaryTripCity(rows: TripCityRow[]): TripCityRow | null {
  return rows.length > 0 ? rows[0] : null;
}

/** A day's effective city — its own override if set, otherwise the trip's
 * primary city, otherwise nothing picked at all yet. Returns the underlying
 * (cityId, customName) pair as well as the display label, since some
 * callers (Keepers) need to persist the resolved city, not just show it. */
export function resolveDayCityPick(
  day: Pick<Day, "city_id" | "custom_city_name">,
  tripCities: TripCityRow[]
): { cityId: string | null; customName: string | null; label: string | null } {
  if (day.city_id) {
    // Falls back to the module-level cities cache (populated by any earlier
    // fetchAllCities() call, e.g. opening a city picker) for the case where
    // the day's city was since removed from the trip's own destination
    // list — city_id references cities(id) directly, not trip_cities, so
    // the override itself is still valid even though it's no longer among
    // this trip's picked destinations.
    const label = tripCities.find((r) => r.city_id === day.city_id)?.city?.name
      ?? citiesCache?.find((c) => c.id === day.city_id)?.name
      ?? null;
    return { cityId: day.city_id, customName: null, label };
  }
  if (day.custom_city_name) return { cityId: null, customName: day.custom_city_name, label: day.custom_city_name };
  const primary = primaryTripCity(tripCities);
  if (!primary) return { cityId: null, customName: null, label: null };
  return {
    cityId: primary.city_id, customName: primary.custom_name,
    label: primary.city?.name ?? primary.custom_name ?? null,
  };
}

/** A day's effective city name for display only — see resolveDayCityPick
 * for the underlying (cityId, customName) pair. */
export function dayCityLabel(
  day: Pick<Day, "city_id" | "custom_city_name">,
  tripCities: TripCityRow[]
): string | null {
  return resolveDayCityPick(day, tripCities).label;
}

/** Sets (or clears, if both fields are null) a single day's city override.
 * If the picked city/custom name isn't already one of the trip's
 * destinations, adds it (appended after the current list — never as
 * primary, since primary is always whichever destination is first). */
export async function setDayCity(
  dayId: string,
  tripId: string,
  pick: { cityId: string | null; customName: string | null }
): Promise<void> {
  if (pick.cityId || pick.customName) {
    const existing = await fetchTripCities(tripId);
    const alreadyPresent = pick.cityId
      ? existing.some((r) => r.city_id === pick.cityId)
      : existing.some((r) => r.custom_name === pick.customName);
    if (!alreadyPresent) {
      await supabase.from("trip_cities").insert({
        trip_id: tripId, city_id: pick.cityId, custom_name: pick.customName, sort_order: existing.length,
      });
    }
  }
  await supabase.from("days").update({ city_id: pick.cityId, custom_city_name: pick.customName }).eq("id", dayId);
}
