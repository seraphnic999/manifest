// Travel Stats: an app-wide, by-year recap — overall totals for the year,
// then a per-trip breakdown. Cost mirrors lib/budget.ts's NIS-normalized
// expense total; trip length mirrors its daysBetweenInclusive.
import { supabase } from "./supabase";
import { Trip } from "./types";

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
