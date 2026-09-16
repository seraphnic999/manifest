// Booking-confirmation email proposals: a forwarded email gets parsed by the
// parse-booking-email edge function into an email_proposals row, which this
// module lets the app list, review, and apply — same "propose, never write
// until a human applies it" shape as lib/itemResearch.ts.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { computeInsertSortOrder } from "./reorder";
import { EmailProposal, EmailProposalFields, EmailProposalStatus, ItemType, Trip } from "./types";

export interface EmailProposalResolved extends EmailProposal {
  tripName: string | null;
}

const ORDER: Record<EmailProposalStatus, number> = { pending: 0, failed: 1, applied: 2, rejected: 3 };

export function useEmailProposals() {
  const [proposals, setProposals] = useState<EmailProposalResolved[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("email_proposals")
      .select("*, trips(name)")
      .order("created_at", { ascending: false });
    const resolved: EmailProposalResolved[] = ((data ?? []) as any[]).map((r) => ({ ...r, tripName: r.trips?.name ?? null }));
    resolved.sort((a, b) =>
      ORDER[a.status] !== ORDER[b.status] ? ORDER[a.status] - ORDER[b.status] : b.created_at.localeCompare(a.created_at)
    );
    setProposals(resolved);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`email-proposals:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "email_proposals" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { proposals, loading, reload: load };
}

// Any non-deleted trip, most recent first by start date — deliberately not
// filtered to "future" like the Keeper picker (an email might update a
// booking on a trip that's already under way).
export async function fetchAllTrips(): Promise<Trip[]> {
  const { data, error } = await supabase.from("trips").select("*").is("deleted_at", null).order("start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Trip[];
}

export async function rejectEmailProposal(id: string): Promise<string | null> {
  const { error } = await supabase
    .from("email_proposals")
    .update({ status: "rejected", reviewed_at: new Date().toISOString() })
    .eq("id", id);
  return error?.message ?? null;
}

export async function deleteEmailProposal(id: string): Promise<string | null> {
  const { error } = await supabase.from("email_proposals").delete().eq("id", id);
  return error?.message ?? null;
}

// The review screen's editable draft — plain strings per field, same shape
// convention as lib/itemResearch.ts's ResearchDraft.
export interface EmailProposalDraft {
  type: ItemType;
  title: string;
  start_date: string;
  end_date: string;
  time_start: string;
  time_end: string;
  address: string;
  phone: string;
  vendor: string;
  booking_source: string;
  confirmation_code: string;
  link: string;
  notes: string;
}

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

export function draftFromEmailProposal(p: EmailProposalFields | null): EmailProposalDraft {
  return {
    type: (p?.type?.value as ItemType) ?? "other",
    title: str(p?.title?.value),
    start_date: str(p?.start_date?.value),
    end_date: str(p?.end_date?.value),
    time_start: str(p?.time_start?.value),
    time_end: str(p?.time_end?.value),
    address: str(p?.address?.value),
    phone: str(p?.phone?.value),
    vendor: str(p?.vendor?.value),
    booking_source: str(p?.booking_source?.value),
    confirmation_code: str(p?.confirmation_code?.value),
    link: str(p?.link?.value),
    notes: str(p?.notes?.value),
  };
}

// Applies a reviewed draft — create a new item on the given trip (landing
// on the day matching its date, or Proposals if there's no date/no
// matching day), or update an existing one. Only ever runs once the user
// has looked at the draft and pressed Apply — never from the edge function.
export async function applyEmailProposal(
  emailProposal: Pick<EmailProposal, "id">,
  draft: EmailProposalDraft,
  action: { kind: "create"; tripId: string } | { kind: "update"; itemId: string }
): Promise<{ error: string | null }> {
  if (!draft.title.trim()) return { error: "Title is required." };

  if (action.kind === "update") {
    const { data: current } = await supabase
      .from("items").select("day_id, trip_id, start_date").eq("id", action.itemId).single();
    if (!current) return { error: "That item no longer exists." };

    let dayId = current.day_id;
    if (draft.start_date && draft.start_date !== current.start_date) {
      const { data: targetDay } = await supabase
        .from("days").select("id").eq("trip_id", current.trip_id).eq("date", draft.start_date).maybeSingle();
      if (targetDay) dayId = targetDay.id;
    }
    const { error } = await supabase.from("items").update({
      type: draft.type, title: draft.title,
      start_date: draft.start_date || null, end_date: draft.end_date || null,
      time_start: draft.time_start || null, time_end: draft.time_end || null,
      address: draft.address || null, phone: draft.phone || null, vendor: draft.vendor || null,
      booking_source: draft.booking_source || null, confirmation_code: draft.confirmation_code || null,
      link: draft.link || null,
      day_id: dayId,
    }).eq("id", action.itemId);
    if (error) return { error: error.message };

    await supabase.from("email_proposals").update({
      status: "applied", applied_item_id: action.itemId, applied_action: "updated", reviewed_at: new Date().toISOString(),
    }).eq("id", emailProposal.id);
    return { error: null };
  }

  let dayId: string | null = null;
  if (draft.start_date) {
    const { data: targetDay } = await supabase
      .from("days").select("id").eq("trip_id", action.tripId).eq("date", draft.start_date).maybeSingle();
    if (targetDay) dayId = targetDay.id;
  }
  if (!dayId) {
    const { data: proposalsDay } = await supabase
      .from("days").select("id").eq("trip_id", action.tripId).is("date", null).maybeSingle();
    dayId = proposalsDay?.id ?? null;
  }
  if (!dayId) return { error: "Couldn't find a day to put this on." };

  const { data: siblings } = await supabase
    .from("items").select("id, sort_order, time_start").eq("day_id", dayId).is("deleted_at", null);
  const sortOrder = computeInsertSortOrder(siblings ?? [], draft.time_start || null);

  const { data: newItem, error } = await supabase.from("items").insert({
    trip_id: action.tripId, day_id: dayId,
    type: draft.type, title: draft.title, status: "planned",
    start_date: draft.start_date || null, end_date: draft.end_date || null,
    time_start: draft.time_start || null, time_end: draft.time_end || null,
    address: draft.address || null, phone: draft.phone || null, vendor: draft.vendor || null,
    booking_source: draft.booking_source || null, confirmation_code: draft.confirmation_code || null,
    link: draft.link || null,
    sort_order: sortOrder,
  }).select().single();
  if (error || !newItem) return { error: error?.message ?? "Couldn't create the item." };

  await supabase.from("email_proposals").update({
    status: "applied", applied_item_id: newItem.id, applied_action: "created", reviewed_at: new Date().toISOString(),
  }).eq("id", emailProposal.id);
  return { error: null };
}
