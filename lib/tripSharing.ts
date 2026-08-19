import { supabase } from "./supabase";

export interface TripShare {
  invited_email: string;
  shared_with_user_id: string | null;
}

export async function fetchTripShares(tripId: string): Promise<TripShare[]> {
  const { data, error } = await supabase
    .from("trip_shares").select("invited_email, shared_with_user_id").eq("trip_id", tripId);
  if (error) throw error;
  return data ?? [];
}

export async function shareTripWithEmail(tripId: string, email: string): Promise<void> {
  const { error } = await supabase.rpc("share_trip_with_email", { p_trip_id: tripId, p_email: email.trim() });
  if (error) throw error;
}

export async function unshareTrip(tripId: string, email: string): Promise<void> {
  const { error } = await supabase.rpc("unshare_trip", { p_trip_id: tripId, p_email: email });
  if (error) throw error;
}

/** Attaches any pending share invited by this account's own email — call once after login. */
export async function claimPendingTripShares(): Promise<void> {
  await supabase.rpc("claim_pending_trip_shares");
}
