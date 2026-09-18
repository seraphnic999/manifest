// Entry Requirements Checker: kicks off (and reads back) the
// check-entry-requirements Edge Function's research for a trip, and
// reads/dismisses the entry_requirement_warnings it produces — the
// companion documents this Edge Function found missing or invalid against
// a country's requirements. Mirrors lib/itemResearch.ts's job-trigger shape
// and lib/documentExpiry.ts's dismiss-tracking shape.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { DocumentType } from "./types";
import { companionFullName } from "./companions";

export type EntryCheckStatus = "queued" | "researching" | "ready" | "failed";

export interface EntryRequirementDoc {
  description: string;
  matches_doc_type: DocumentType | null;
  min_validity_months_beyond_travel: number | null;
  source_url: string | null;
}

export interface EntryRequirementCountry {
  country: string;
  requirement_summary: string;
  no_special_requirements: boolean;
  documents_required: EntryRequirementDoc[];
}

export interface EntryRequirementCheck {
  id: string;
  trip_id: string;
  status: EntryCheckStatus;
  countries: EntryRequirementCountry[] | null;
  error: string | null;
  cost_usd: number | null;
}

export interface EntryRequirementWarning {
  id: string;
  trip_id: string;
  trip_name: string;
  companion_id: string;
  companion_name: string;
  country: string;
  requirement_description: string;
  matches_doc_type: DocumentType | null;
  dismissed_at: string | null;
  created_at: string;
}

/** Inserts (or, if one already exists for this trip, replaces) the check
 * row and kicks the Edge Function — used right after a trip is created.
 * Fire-and-forget on the research itself, same as createResearchJob: the
 * row existing is what matters, not this particular invoke call landing. */
export async function startEntryRequirementCheck(tripId: string): Promise<{ id: string | null; error: string | null }> {
  const { data: check, error } = await supabase
    .from("entry_requirement_checks")
    .upsert({ trip_id: tripId, status: "queued", error: null, started_at: null, completed_at: null }, { onConflict: "trip_id" })
    .select()
    .single();
  if (error || !check) return { id: null, error: error?.message ?? "Could not queue entry requirements check." };

  supabase.functions.invoke("check-entry-requirements", { body: { check_id: check.id, reset_dismissed: false } }).catch(() => {});
  return { id: check.id, error: null };
}

/** Re-runs the check for a trip the user already has one for (the "Entry
 * Validation" menu item) — re-researches from scratch and re-validates
 * every companion's documents, and any warning the user had dismissed
 * becomes undismissed again since it's asking the app to re-decide, not
 * just re-display, whether each finding still applies. */
export async function rerunEntryRequirementCheck(tripId: string): Promise<string | null> {
  const { data: check, error } = await supabase
    .from("entry_requirement_checks")
    .upsert({ trip_id: tripId, status: "queued", error: null, started_at: null, completed_at: null }, { onConflict: "trip_id" })
    .select()
    .single();
  if (error || !check) return error?.message ?? "Could not start entry requirements check.";

  supabase.functions.invoke("check-entry-requirements", { body: { check_id: check.id, reset_dismissed: true } }).catch(() => {});
  return null;
}

export function useEntryRequirementCheck(tripId: string | undefined) {
  const [check, setCheck] = useState<EntryRequirementCheck | null>(null);

  const load = useCallback(async () => {
    if (!tripId) return;
    const { data } = await supabase.from("entry_requirement_checks").select("*").eq("trip_id", tripId).maybeSingle();
    setCheck((data as EntryRequirementCheck) ?? null);
  }, [tripId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!tripId) return;
    const channel = supabase
      .channel(`entry-requirement-check:${tripId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "entry_requirement_checks", filter: `trip_id=eq.${tripId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tripId, load]);

  return { check, reload: load };
}

async function fetchWarnings(tripId?: string, includeDismissed = false): Promise<EntryRequirementWarning[]> {
  let query = supabase
    .from("entry_requirement_warnings")
    .select("id, trip_id, companion_id, country, requirement_description, matches_doc_type, dismissed_at, created_at, trips(name), companions(first_name, last_name)")
    // id as a tiebreaker: a batch insert gives every row from one run the
    // same created_at, and dismissing one (an UPDATE, which writes a new
    // row version) can otherwise shuffle its position in an unindexed sort
    // on the tied column — a dismissed row jumping elsewhere in the list
    // instead of staying put, greyed, right where it was.
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (tripId) query = query.eq("trip_id", tripId);
  if (!includeDismissed) query = query.is("dismissed_at", null);
  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((w: any) => ({
    id: w.id,
    trip_id: w.trip_id,
    trip_name: w.trips?.name ?? "Trip",
    companion_id: w.companion_id,
    companion_name: w.companions ? companionFullName(w.companions) : "Someone",
    country: w.country,
    requirement_description: w.requirement_description,
    matches_doc_type: w.matches_doc_type,
    dismissed_at: w.dismissed_at,
    created_at: w.created_at,
  }));
}

function useWarningsQuery(tripId: string | undefined, includeDismissed: boolean) {
  const [warnings, setWarnings] = useState<EntryRequirementWarning[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setWarnings(await fetchWarnings(tripId, includeDismissed));
    } catch (e) {
      console.error("useEntryRequirementWarnings load failed", e);
    } finally {
      setLoading(false);
    }
  }, [tripId, includeDismissed]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`entry-requirement-warnings:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "entry_requirement_warnings" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { warnings, loading, reload: load };
}

/** Active (non-dismissed) entry-requirement warnings for one trip — backs
 * the bubble on that trip's Overview page. */
export function useTripEntryWarnings(tripId: string | undefined) {
  return useWarningsQuery(tripId, false);
}

/** Every entry-requirement warning across every trip, dismissed or not —
 * backs the Entry Requirements section of the Document Analysis screen. */
export function useAllEntryRequirementWarnings() {
  return useWarningsQuery(undefined, true);
}

export async function dismissEntryRequirementWarning(id: string): Promise<string | null> {
  const { error } = await supabase.from("entry_requirement_warnings").update({ dismissed_at: new Date().toISOString() }).eq("id", id);
  return error?.message ?? null;
}
