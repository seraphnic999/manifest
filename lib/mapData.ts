import { supabase } from "./supabase";
import { Item, Day, MapRoute, TripPlace } from "./types";

export type MapItem = Item & { latitude: number; longitude: number };

// Cycles per day (by sort_order position), independent of trip length.
// Includes the four colours from the original Google My Maps layers
// (dark red, green, amber, purple) so this trip's map looks the same as
// before, extended with a few more distinct hues for longer trips.
const DAY_COLOR_PALETTE = [
  "#A52714", "#0F9D58", "#F9A825", "#9C27B0",
  "#1565C0", "#00838F", "#AD1457", "#5D4037",
];

// day_id IS NULL items (e.g. a lodging stay span itself, if it ever gets
// coordinates) — neutral, not tied to any single day.
export const NEUTRAL_DAY_COLOR = "#8C8577";

// Fixed colour for trip_places ("spares & fallbacks" — the old map's blue layer).
export const PLACE_COLOR = "#0288D1";

export function dayColorForIndex(index: number): string {
  return DAY_COLOR_PALETTE[index % DAY_COLOR_PALETTE.length];
}

/** trip_id -> day.id -> hex colour, keyed by each day's position in sort_order. */
export function buildDayColorMap(days: Day[]): Map<string, string> {
  const sorted = [...days].sort((a, b) => a.sort_order - b.sort_order);
  const map = new Map<string, string>();
  sorted.forEach((d, i) => map.set(d.id, dayColorForIndex(i)));
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

export async function fetchTripPlaces(tripId: string): Promise<TripPlace[]> {
  const { data } = await supabase
    .from("trip_places").select("*")
    .eq("trip_id", tripId).is("deleted_at", null)
    .order("sort_order");
  return (data ?? []) as TripPlace[];
}

export async function addTripPlace(place: {
  trip_id: string; name: string; category: string | null;
  latitude: number; longitude: number;
  address?: string | null; link?: string | null; notes?: string | null;
}): Promise<TripPlace | null> {
  const { data } = await supabase.from("trip_places").insert(place).select().single();
  return data as TripPlace | null;
}

export async function updateTripPlace(id: string, patch: Partial<TripPlace>): Promise<void> {
  await supabase.from("trip_places").update(patch).eq("id", id);
}

export async function deleteTripPlace(id: string): Promise<void> {
  await supabase.from("trip_places").update({ deleted_at: new Date().toISOString() }).eq("id", id);
}
