import { supabase } from "./supabase";
import { normalizeTimeHHMM } from "./timeFormat";

/** The trip's actual "go" moment — the earliest item's date+time, not just
 * the trip's own start_date, per the request that this track the first
 * scheduled thing (a flight, usually) rather than midnight of day one. */
export async function fetchTripCountdownTarget(tripId: string, fallbackDateIso: string): Promise<Date> {
  const { data } = await supabase
    .from("items").select("start_date, time_start")
    .eq("trip_id", tripId).is("deleted_at", null)
    .not("start_date", "is", null)
    .order("start_date", { ascending: true })
    .order("time_start", { ascending: true, nullsFirst: false })
    .limit(1);
  const first = data?.[0];
  if (first?.start_date) {
    const time = first.time_start ? normalizeTimeHHMM(first.time_start) : "00:00";
    return new Date(`${first.start_date}T${time}:00`);
  }
  return new Date(`${fallbackDateIso}T00:00:00`);
}
