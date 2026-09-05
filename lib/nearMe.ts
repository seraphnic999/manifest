import * as Location from "expo-location";
import { supabase } from "./supabase";
import { Item } from "./types";

export interface NearbyItem {
  item: Item;
  distance_m: number;
}

/** Requests foreground location permission (if needed) and returns the current position, or null if denied. */
export async function fetchCurrentPosition(): Promise<{ lat: number; lon: number } | null> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return null;
  const pos = await Location.getCurrentPositionAsync({});
  return { lat: pos.coords.latitude, lon: pos.coords.longitude };
}

/** Every item on the trip with coordinates, nearest first — see migration_013's nearby_items(). */
export async function fetchNearbyItems(tripId: string, lat: number, lon: number, limit = 20): Promise<NearbyItem[]> {
  const { data, error } = await supabase.rpc("nearby_items", { p_trip_id: tripId, p_lat: lat, p_lon: lon, p_limit: limit });
  if (error) throw error;
  return (data ?? []) as NearbyItem[];
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
