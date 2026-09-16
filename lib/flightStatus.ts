// Live flight status, tracked server-side. A scheduled Edge Function
// (supabase/functions/poll-flight-status) starts polling AeroDataBox 4
// hours before each flight's departure and keeps checking every ~20
// minutes until it lands — this file just reads the resulting flight_status
// row, plus a "refresh now" call that invokes the same function for one
// flight on demand. The trip overview page and the item detail page both
// read/write this one row, so a manual refresh from either screen updates
// both without a second AeroDataBox call.

import { supabase } from "./supabase";

export interface FlightStatusTime {
  utc: string | null;
  local: string | null;
}

export interface FlightStatus {
  flightNumber: string;
  status: string | null; // e.g. "Scheduled", "EnRoute", "Landed", "Cancelled"
  departure: {
    airport: string | null;
    scheduled: FlightStatusTime;
    revised: FlightStatusTime | null;
    terminal: string | null;
    gate: string | null;
  };
  arrival: {
    airport: string | null;
    scheduled: FlightStatusTime;
    revised: FlightStatusTime | null;
    terminal: string | null;
    gate: string | null;
  };
}

export interface FlightStatusRow {
  item_id: string;
  trip_id: string;
  flight_number: string;
  status: string | null;
  previous_status: string | null;
  data: FlightStatus;
  tracking_active: boolean;
  last_error: string | null;
  checked_at: string | null;
}

export async function fetchFlightStatusForItem(itemId: string): Promise<FlightStatusRow | null> {
  const { data, error } = await supabase.from("flight_status").select("*").eq("item_id", itemId).maybeSingle();
  if (error) throw error;
  return (data as FlightStatusRow | null) ?? null;
}

export async function fetchFlightStatusForTrip(tripId: string): Promise<FlightStatusRow[]> {
  const { data, error } = await supabase.from("flight_status").select("*").eq("trip_id", tripId);
  if (error) throw error;
  return (data ?? []) as FlightStatusRow[];
}

/** Forces an immediate check for one flight item, regardless of its normal
 * 4-hours-before tracking window — used by both screens' manual refresh
 * button. Returns the updated row directly, so the caller can update its UI
 * without a second read. */
export async function refreshFlightStatus(itemId: string): Promise<{ row: FlightStatusRow | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("poll-flight-status", { body: { item_id: itemId } });
  if (error) return { row: null, error: error.message ?? "Couldn't refresh flight status." };
  if (data?.error) return { row: null, error: data.error };
  return { row: (data?.row as FlightStatusRow) ?? null, error: null };
}
