// Item research: a two-phase agent flow. Phase 1 (identify) is a quick
// synchronous call the user waits on — which real place does this item
// refer to? Phase 2 (research) runs in the background once confirmed, and
// only ever proposes changes for review; nothing touches `items` until the
// user taps Apply on the review screen.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { Item, ItemResearchJob, ItemResearchProposal, ItemResearchStatus, ItemType, IdentifyCandidate } from "./types";

// Only item types that mean "a specific real-world place" are worth
// researching — a flight, transfer, transport leg, or personal work block
// has no address to look up.
const ELIGIBLE_TYPES: ItemType[] = [
  "lodging", "activity", "meal", "bar", "cafe", "bakery", "sightseeing", "attraction", "shopping", "other",
];

export function itemResearchEligible(type: ItemType): boolean {
  return ELIGIBLE_TYPES.includes(type);
}

export async function identifyItem(itemId: string): Promise<{
  candidates: IdentifyCandidate[] | null;
  error: string | null;
}> {
  const { data, error } = await supabase.functions.invoke("identify-item", { body: { item_id: itemId } });
  if (error) return { candidates: null, error: error.message ?? "Couldn't identify this item." };
  if (data?.error) return { candidates: null, error: data.error };
  return { candidates: (data?.candidates ?? []) as IdentifyCandidate[], error: null };
}

export async function createResearchJob(
  item: Pick<Item, "id" | "trip_id">,
  identifiedName: string | null,
  identifiedContext: Record<string, unknown> | null
): Promise<{ id: string | null; error: string | null }> {
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id;
  if (!userId) return { id: null, error: "Not signed in." };

  const { data: job, error } = await supabase
    .from("item_research_jobs")
    .insert({
      item_id: item.id,
      trip_id: item.trip_id,
      created_by: userId,
      status: "queued",
      identified_name: identifiedName,
      identified_context: identifiedContext,
    })
    .select()
    .single();
  if (error || !job) return { id: null, error: error?.message ?? "Could not queue research." };

  // Kick the worker. A failure here isn't fatal — the job stays queued and
  // can be retried; the row is what matters, not this particular call.
  supabase.functions.invoke("research-item", { body: { job_id: job.id } }).catch(() => {});

  return { id: job.id, error: null };
}

export async function retryResearchJob(id: string): Promise<string | null> {
  const { error } = await supabase
    .from("item_research_jobs")
    .update({ status: "queued", error: null, started_at: null })
    .eq("id", id);
  if (error) return error.message;
  supabase.functions.invoke("research-item", { body: { job_id: id } }).catch(() => {});
  return null;
}

export async function rejectResearchJob(id: string): Promise<string | null> {
  const { error } = await supabase
    .from("item_research_jobs")
    .update({ status: "rejected", reviewed_at: new Date().toISOString() })
    .eq("id", id);
  return error?.message ?? null;
}

export async function deleteResearchJob(id: string): Promise<string | null> {
  const { error } = await supabase.from("item_research_jobs").delete().eq("id", id);
  return error?.message ?? null;
}

const num = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export interface ResearchDraft {
  address: string;
  phone: string;
  website: string;
  google_maps_link: string;
  opening_hours: string;
  reservation_lead_time: string;
  price_range: string;
  latitude: string;
  longitude: string;
}

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

export function draftFromProposal(p: ItemResearchProposal | null): ResearchDraft {
  return {
    address: str(p?.address?.value),
    phone: str(p?.phone?.value),
    website: str(p?.website?.value),
    google_maps_link: str(p?.google_maps_link?.value),
    opening_hours: str(p?.opening_hours?.value),
    reservation_lead_time: str(p?.reservation_lead_time?.value),
    price_range: str(p?.price_range?.value),
    latitude: str(p?.latitude?.value),
    longitude: str(p?.longitude?.value),
  };
}

// Applying is the only path from a proposal to a real change — it writes
// only the fields the user didn't blank out, leaves everything else on the
// item untouched, and folds opening_hours/reservation_lead_time/price_range
// into custom_fields (the same jsonb bucket a flight's flight_number
// already lives in) rather than adding narrow columns for each.
export async function acceptResearchJob(
  job: ItemResearchJob,
  draft: ResearchDraft
): Promise<{ error: string | null }> {
  const { data: current } = await supabase.from("items").select("custom_fields").eq("id", job.item_id).single();
  const customFields = { ...((current?.custom_fields as Record<string, unknown>) ?? {}) };

  if (draft.opening_hours.trim()) customFields.opening_hours = draft.opening_hours.trim();
  if (draft.reservation_lead_time.trim()) customFields.reservation_lead_time = draft.reservation_lead_time.trim();
  if (draft.price_range.trim()) customFields.price_range = draft.price_range.trim();

  const updates: Record<string, unknown> = { custom_fields: customFields };
  if (draft.address.trim()) updates.address = draft.address.trim();
  if (draft.phone.trim()) updates.phone = draft.phone.trim();
  if (draft.website.trim()) updates.link = draft.website.trim();
  if (draft.google_maps_link.trim()) updates.google_maps_link = draft.google_maps_link.trim();
  const lat = num(draft.latitude);
  const lon = num(draft.longitude);
  if (lat !== null) updates.latitude = lat;
  if (lon !== null) updates.longitude = lon;

  const { error } = await supabase.from("items").update(updates).eq("id", job.item_id);
  if (error) return { error: error.message };

  await supabase
    .from("item_research_jobs")
    .update({
      status: "accepted",
      accepted: draft as unknown as Record<string, unknown>,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  return { error: null };
}

// Statuses that still need attention, in the order the queue screen shows
// them — ready to review first, then still running, then history.
const ORDER: Record<ItemResearchStatus, number> = {
  ready: 0, researching: 1, queued: 2, failed: 3, accepted: 4, rejected: 5,
};

export interface ItemResearchJobResolved extends ItemResearchJob {
  itemTitle: string | null;
  tripName: string | null;
}

// The global Research Queue — every job across every trip the user can
// access. No trip_id filter needed: RLS on item_research_jobs already scopes
// this to accessible trips, the same way every other cross-trip list in this
// app (Home's trip list, Doc Tracker) relies on RLS rather than a client-side
// filter.
export function useResearchJobs() {
  const [jobs, setJobs] = useState<ItemResearchJobResolved[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("item_research_jobs")
      .select("*, items(title), trips(name)")
      .order("created_at", { ascending: false });
    const resolved: ItemResearchJobResolved[] = ((data ?? []) as any[]).map((r) => ({
      ...r,
      itemTitle: r.items?.title ?? null,
      tripName: r.trips?.name ?? null,
    }));
    resolved.sort((a, b) =>
      ORDER[a.status] !== ORDER[b.status] ? ORDER[a.status] - ORDER[b.status] : b.created_at.localeCompare(a.created_at)
    );
    setJobs(resolved);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("item-research-jobs-all")
      .on("postgres_changes", { event: "*", schema: "public", table: "item_research_jobs" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { jobs, loading, reload: load };
}

export function useItemResearchJob(id: string | undefined) {
  const [job, setJob] = useState<ItemResearchJob | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    const { data } = await supabase.from("item_research_jobs").select("*").eq("id", id).single();
    setJob((data as ItemResearchJob) ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return { job, loading, reload: load };
}

// The small pending-review badge on an item (day view row + detail page):
// is there a job for this item sitting in 'ready'? Cheap, indexed lookup.
export function useItemReadyResearchJob(itemId: string | undefined) {
  const [job, setJob] = useState<ItemResearchJob | null>(null);

  const load = useCallback(async () => {
    if (!itemId) { setJob(null); return; }
    const { data } = await supabase
      .from("item_research_jobs").select("*")
      .eq("item_id", itemId).eq("status", "ready")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    setJob((data as ItemResearchJob) ?? null);
  }, [itemId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!itemId) return;
    const channel = supabase
      .channel(`item-research:${itemId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "item_research_jobs", filter: `item_id=eq.${itemId}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [itemId, load]);

  return { job, reload: load };
}

// Bulk version for the day view, which needs "does any item on this day have
// a ready job" for many items at once rather than one subscription per row.
export async function fetchReadyResearchItemIds(itemIds: string[]): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();
  const { data } = await supabase
    .from("item_research_jobs").select("item_id")
    .in("item_id", itemIds).eq("status", "ready");
  return new Set((data ?? []).map((r) => r.item_id));
}
