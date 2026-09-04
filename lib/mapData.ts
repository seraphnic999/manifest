import { supabase } from "./supabase";
import { Item, Day, MapRoute } from "./types";

export type MapItem = Item & { latitude: number; longitude: number };

// Cycles per real (dated) day, by sort_order position, independent of trip
// length. Includes the four colours from the original Google My Maps layers
// (dark red, green, amber, purple) so this trip's map looks the same as
// before, extended with a few more distinct hues for longer trips.
const DAY_COLOR_PALETTE = [
  "#A52714", "#0F9D58", "#F9A825", "#9C27B0",
  "#1565C0", "#00838F", "#AD1457", "#5D4037",
];

// day_id IS NULL items (e.g. a lodging stay span itself, if it ever gets
// coordinates) — neutral, not tied to any single day.
export const NEUTRAL_DAY_COLOR = "#8C8577";

// Fixed colour for the "Proposals" day (the old map's blue "spares" layer) —
// deliberately not part of the cycling palette so it can never collide with
// a real day's colour on longer trips.
export const PROPOSALS_COLOR = "#0288D1";

export function dayColorForIndex(index: number): string {
  return DAY_COLOR_PALETTE[index % DAY_COLOR_PALETTE.length];
}

/** trip_id -> day.id -> hex colour, keyed by each real day's position in sort_order. */
export function buildDayColorMap(days: Day[]): Map<string, string> {
  const dated = days.filter((d) => d.date !== null).sort((a, b) => a.sort_order - b.sort_order);
  const map = new Map<string, string>();
  dated.forEach((d, i) => map.set(d.id, dayColorForIndex(i)));
  for (const d of days) {
    if (d.date === null) map.set(d.id, PROPOSALS_COLOR);
  }
  return map;
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
