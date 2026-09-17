// Live flight status, tracked server-side. A scheduled Edge Function
// (supabase/functions/poll-flight-status) starts polling AeroDataBox 4
// hours before each flight's departure and keeps checking every ~20
// minutes until it lands — this file just reads the resulting flight_status
// row, plus a "refresh now" call that invokes the same function for one
// flight on demand. The trip overview page and the item detail page both
// read/write this one row, so a manual refresh from either screen updates
// both without a second AeroDataBox call.
//
// flight_status_log (migration_041) is the append-only sibling: one row
// per real status change (the same moment a push notification fires), read
// by the dedicated flight-log page — see useFlightStatusLog below.

import { useCallback, useEffect, useState } from "react";
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

export interface FlightStatusLogEntry {
  id: string;
  item_id: string;
  trip_id: string;
  flight_number: string;
  status: string | null;
  previous_status: string | null;
  data: FlightStatus;
  created_at: string;
}

/** The permanent per-flight history, newest first — one row per real status
 * change (see poll-flight-status), never edited or deleted from the app.
 * Auto-updates while the log page is open via a realtime subscription, the
 * same pattern as useLatestItemResearchJob in lib/itemResearch.ts. */
export function useFlightStatusLog(itemId: string | undefined) {
  const [entries, setEntries] = useState<FlightStatusLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!itemId) { setEntries([]); setLoading(false); return; }
    const { data, error } = await supabase
      .from("flight_status_log").select("*")
      .eq("item_id", itemId)
      .order("created_at", { ascending: false });
    if (!error) setEntries((data ?? []) as FlightStatusLogEntry[]);
    setLoading(false);
  }, [itemId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!itemId) return;
    // Random suffix — same reason as item-research's channels: a screen
    // can remain mounted in the background stack and re-run this effect
    // for the same itemId before the previous channel's cleanup finishes.
    const channel = supabase
      .channel(`flight-status-log:${itemId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "flight_status_log", filter: `item_id=eq.${itemId}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [itemId, load]);

  return { entries, loading };
}
