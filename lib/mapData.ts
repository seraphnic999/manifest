import { supabase } from "./supabase";
import { Item, Day, MapRoute } from "./types";
import { autoColorForDayIndex } from "./dayColors";
import { colors } from "./theme";

export type MapItem = Item & { latitude: number; longitude: number };

// day_id IS NULL items (e.g. a lodging stay span itself, if it ever gets
// coordinates) — neutral, not tied to any single day.
export const NEUTRAL_DAY_COLOR = "#8C8577";

// Fallback for a Proposals day with no persisted color yet (trips created
// before per-day colors existed) — new trips get this written directly
// onto the row by the generate_trip_days() trigger instead.
export const PROPOSALS_COLOR = colors.lightBlue;

/** trip_id -> day.id -> hex colour. Each day's own `color` wins if set
 * (either assigned automatically at trip creation, or picked by the user
 * on the Day screen); otherwise falls back to the old index-based/
 * Proposals default, for trips/days that predate per-day colors. */
export function buildDayColorMap(days: Day[]): Map<string, string> {
  const dated = days.filter((d) => d.date !== null).sort((a, b) => a.sort_order - b.sort_order);
  const map = new Map<string, string>();
  dated.forEach((d, i) => map.set(d.id, d.color ?? autoColorForDayIndex(i)));
  for (const d of days) {
    if (d.date === null) map.set(d.id, d.color ?? PROPOSALS_COLOR);
  }
  return map;
}

/** date (yyyy-mm-dd) -> day.id, for the trip's real (dated) days only —
 * used to color a day_id-less item (a lodging stay span, which spans a
 * date range rather than belonging to one day row) by its check-in date. */
export function buildDateToDayId(days: Day[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const d of days) if (d.date) map.set(d.date, d.id);
  return map;
}

/** A map item's effective marker color: its own day's color if it has
 * one; otherwise (a stay-span lodging item, day_id null) the color of the
 * day its start_date falls on; otherwise the neutral fallback. */
export function colorForMapItem(
  item: { day_id: string | null; start_date: string | null },
  dayColors: Map<string, string>,
  dateToDayId: Map<string, string>,
  neutralColor: string
): string {
  if (item.day_id) return dayColors.get(item.day_id) ?? neutralColor;
  if (item.start_date) {
    const dayId = dateToDayId.get(item.start_date);
    if (dayId) return dayColors.get(dayId) ?? neutralColor;
  }
  return neutralColor;
}

export async function fetchTripDays(tripId: string): Promise<Day[]> {
  const { data } = await supabase
    .from("days").select("*").eq("trip_id", tripId).order("sort_order");
  return (data ?? []) as Day[];
}

export async function fetchTripMapItems(tripId: string): Promise<MapItem[]> {
  const { data } = await supabase
    .from("items").select("*")
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .not("latitude", "is", null)
    .not("longitude", "is", null);
  return (data ?? []) as MapItem[];
}

export async function fetchTripRoutes(tripId: string): Promise<MapRoute[]> {
  const { data } = await supabase
    .from("map_routes").select("*")
    .eq("trip_id", tripId).is("deleted_at", null)
    .order("sort_order");
  return (data ?? []) as MapRoute[];
}
