// Travel Stats: an app-wide, by-year recap — overall totals for the year,
// then a per-trip breakdown. Cost mirrors lib/budget.ts's NIS-normalized
// expense total; trip length mirrors its daysBetweenInclusive.
import { supabase } from "./supabase";
import { Trip } from "./types";
import { AUTO_DAY_COLORS } from "./dayColors";

function daysBetweenInclusive(startIso: string, endIso: string): number {
  const [y1, m1, d1] = startIso.split("-").map(Number);
  const [y2, m2, d2] = endIso.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000) + 1;
}

export type TripTimeStatus = "past" | "current" | "future";

/** Compares a trip's date range (YYYY-MM-DD strings) against today, as
 * plain ISO string comparisons — no timezone math needed since both sides
 * are calendar dates, not instants. */
export function tripTimeStatus(trip: { startDate: string; endDate: string }, today: Date = new Date()): TripTimeStatus {
  const todayIso = today.toISOString().slice(0, 10);
  if (todayIso < trip.startDate) return "future";
  if (todayIso > trip.endDate) return "past";
  return "current";
}

export interface TripStatsRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  days: number;
  destinations: string[];
  costNis: number;
}

export interface YearStats {
  year: number;
  tripCount: number;
  totalDays: number;
  destinationCount: number;
  totalCostNis: number;
  trips: TripStatsRow[];
}

export async function fetchTravelStats(): Promise<YearStats[]> {
  const { data: trips, error: tripsError } = await supabase
    .from("trips").select("*").is("deleted_at", null).order("start_date");
  if (tripsError) throw tripsError;

  const { data: currencies, error: currenciesError } = await supabase
    .from("trip_currencies").select("trip_id, code, rate_to_nis");
  if (currenciesError) throw currenciesError;
  const { data: expenses, error: expensesError } = await supabase
    .from("expenses").select("trip_id, amount, currency_code");
  if (expensesError) throw expensesError;

  const ratesByTrip = new Map<string, Map<string, number>>();
  for (const c of currencies ?? []) {
    const m = ratesByTrip.get(c.trip_id) ?? new Map<string, number>();
    m.set(c.code, c.rate_to_nis);
    ratesByTrip.set(c.trip_id, m);
  }
  const costByTrip = new Map<string, number>();
  for (const e of expenses ?? []) {
    const rate = ratesByTrip.get(e.trip_id)?.get(e.currency_code) ?? 1;
    costByTrip.set(e.trip_id, (costByTrip.get(e.trip_id) ?? 0) + e.amount * rate);
  }

  const byYear = new Map<number, TripStatsRow[]>();
  for (const trip of (trips ?? []) as Trip[]) {
    const year = Number(trip.start_date.slice(0, 4));
    const row: TripStatsRow = {
      id: trip.id,
      name: trip.name,
      startDate: trip.start_date,
      endDate: trip.end_date,
      days: daysBetweenInclusive(trip.start_date, trip.end_date),
      destinations: trip.destinations ?? [],
      costNis: costByTrip.get(trip.id) ?? 0,
    };
    const list = byYear.get(year) ?? [];
    list.push(row);
    byYear.set(year, list);
  }

  const years: YearStats[] = [...byYear.entries()].map(([year, tripRows]) => {
    const destinationSet = new Set(tripRows.flatMap((t) => t.destinations.map((d) => d.trim().toLowerCase())));
    return {
      year,
      tripCount: tripRows.length,
      totalDays: tripRows.reduce((sum, t) => sum + t.days, 0),
      destinationCount: destinationSet.size,
      totalCostNis: tripRows.reduce((sum, t) => sum + t.costNis, 0),
      trips: tripRows,
    };
  });

  return years.sort((a, b) => b.year - a.year);
}

export const MAP_YEAR_COLORS = AUTO_DAY_COLORS.slice(0, 5);

export interface CityPin {
  key: string; // city_id, or "custom:<lowercased name>" — dedupes repeat visits to the same place
  label: string;
  latitude: number;
  longitude: number;
  year: number; // the most recent year this place was visited, within the tracked window
  color: string;
}

interface TripCityForMap {
  trip_id: string;
  city_id: string | null;
  custom_name: string | null;
  latitude: number | null;
  longitude: number | null;
  city: { name: string; latitude: number; longitude: number } | null;
}

/** One pin per distinct place visited, colored by the most recent of the up
 * to 5 most recent years the user has traveled — a place last visited
 * outside that window is left off the map entirely (an older trip doesn't
 * dilute the recent-years picture the map is showing). */
export async function fetchWorldMapPins(): Promise<CityPin[]> {
  const { data: trips, error: tripsError } = await supabase
    .from("trips").select("id, start_date").is("deleted_at", null);
  if (tripsError || !trips || trips.length === 0) return [];

  const yearByTrip = new Map<string, number>(trips.map((t) => [t.id, Number(t.start_date.slice(0, 4))]));
  const distinctYears = [...new Set(yearByTrip.values())].sort((a, b) => b - a);
  const trackedYears = distinctYears.slice(0, MAP_YEAR_COLORS.length);
  const colorByYear = new Map(trackedYears.map((y, i) => [y, MAP_YEAR_COLORS[i]]));

  const { data: tripCities, error: citiesError } = await supabase
    .from("trip_cities")
    .select("trip_id, city_id, custom_name, latitude, longitude, city:cities(name, latitude, longitude)")
    .in("trip_id", trips.map((t) => t.id));
  if (citiesError || !tripCities) return [];

  const latestByKey = new Map<string, { label: string; latitude: number; longitude: number; year: number }>();
  for (const row of tripCities as unknown as TripCityForMap[]) {
    const year = yearByTrip.get(row.trip_id);
    if (year == null) continue;

    const lat = row.city?.latitude ?? row.latitude;
    const lon = row.city?.longitude ?? row.longitude;
    if (lat == null || lon == null) continue; // ungeocoded custom name — no pin possible yet

    const key = row.city_id ?? `custom:${row.custom_name!.trim().toLowerCase()}`;
    const label = row.city?.name ?? row.custom_name!;
    const prev = latestByKey.get(key);
    if (!prev || year > prev.year) latestByKey.set(key, { label, latitude: lat, longitude: lon, year });
  }

  const pins: CityPin[] = [];
  for (const [key, place] of latestByKey) {
    const color = colorByYear.get(place.year);
    if (!color) continue; // most recent visit predates the tracked window
    pins.push({ key, label: place.label, latitude: place.latitude, longitude: place.longitude, year: place.year, color });
  }
  return pins;
}
