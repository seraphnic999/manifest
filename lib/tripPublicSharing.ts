// Read-only public trip sharing: a per-trip link (token in trip_share_links)
// anyone can open without an account at /share/<token>, backed by the
// share-trip-data Edge Function. Deliberately separate from lib/tripSharing.ts
// (invite-a-collaborator-by-email — an unrelated concept).
import { supabase } from "./supabase";

export interface TripShareLink {
  id: string;
  trip_id: string;
  token: string;
  enabled: boolean;
  pin_hash: string | null;
}

const SHARE_BASE_URL = "https://manifest-teal-ten.vercel.app/share";

export function shareLinkUrl(token: string): string {
  return `${SHARE_BASE_URL}/${token}`;
}

export async function fetchShareLink(tripId: string): Promise<TripShareLink | null> {
  const { data, error } = await supabase
    .from("trip_share_links").select("id, trip_id, token, enabled, pin_hash").eq("trip_id", tripId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Creates the trip's share link if it doesn't exist yet, or re-enables it
 * if it was turned off — either way returns the (possibly pre-existing)
 * link with its token, so turning sharing back on never breaks a URL
 * someone already has. */
export async function getOrCreateShareLink(tripId: string): Promise<TripShareLink> {
  const { data, error } = await supabase.rpc("get_or_create_trip_share_link", { p_trip_id: tripId });
  if (error) throw error;
  return data as TripShareLink;
}

export async function setShareLinkEnabled(tripId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.from("trip_share_links").update({ enabled }).eq("trip_id", tripId);
  if (error) throw error;
}

/** Mints a fresh token, invalidating any previously distributed link. */
export async function regenerateShareLink(tripId: string): Promise<TripShareLink> {
  const { data, error } = await supabase.rpc("regenerate_trip_share_token", { p_trip_id: tripId });
  if (error) throw error;
  return data as TripShareLink;
}

/** pin: digits only, length >= 4; pass null to clear an existing PIN. */
export async function setSharePin(tripId: string, pin: string | null): Promise<void> {
  const { error } = await supabase.rpc("set_trip_share_pin", { p_trip_id: tripId, p_pin: pin });
  if (error) throw error;
}
