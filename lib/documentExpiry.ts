// Document expiry reminders: reads/dismisses document_expiry_alerts
// (migration_043), maintained by the daily check-document-expiry Edge
// Function — this file never creates or renews an alert itself, only
// reads the active ones and lets the user dismiss.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { DocumentType } from "./types";
import { companionFullName } from "./companions";

export interface DocumentExpiryWarning {
  document_id: string;
  companion_id: string;
  companion_name: string;
  document_type: DocumentType;
  expiry_date: string;
  first_detected_at: string;
}

// Deliberately two flat queries rather than one two-level-deep nested
// embed (alerts -> travel_documents -> companions) — this codebase has no
// existing precedent for embedding that deep, and joining client-side here
// is simple enough not to be worth the risk.
async function fetchActiveWarnings(): Promise<DocumentExpiryWarning[]> {
  const { data: alerts, error: alertsError } = await supabase
    .from("document_expiry_alerts")
    .select("document_id, expiry_date, first_detected_at")
    .is("dismissed_at", null)
    .order("expiry_date", { ascending: true });
  if (alertsError) throw alertsError;
  if (!alerts || alerts.length === 0) return [];

  const { data: docs, error: docsError } = await supabase
    .from("travel_documents")
    .select("id, type, companion_id, companions(first_name, last_name)")
    .in("id", alerts.map((a) => a.document_id));
  if (docsError) throw docsError;

  const docById = new Map((docs ?? []).map((d: any) => [d.id, d]));

  return alerts
    .map((a) => {
      const doc = docById.get(a.document_id);
      if (!doc) return null;
      return {
        document_id: a.document_id,
        companion_id: doc.companion_id,
        companion_name: doc.companions ? companionFullName(doc.companions) : "Someone",
        document_type: doc.type as DocumentType,
        expiry_date: a.expiry_date,
        first_detected_at: a.first_detected_at,
      };
    })
    .filter((w): w is DocumentExpiryWarning => !!w);
}

/** Active (non-dismissed) expiry warnings, soonest first — the same query
 * backs the Home bubble, the dedicated expiry-warnings screen, and the
 * per-document banner on a companion's page. Realtime-subscribed so a
 * dismissal (from this device or another) and the daily sweep both update
 * every screen reading this without a manual refresh. */
export function useDocumentExpiryWarnings() {
  const [warnings, setWarnings] = useState<DocumentExpiryWarning[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setWarnings(await fetchActiveWarnings());
    } catch (e) {
      console.error("useDocumentExpiryWarnings load failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Random suffix — same reason as lib/itemResearch.ts's channels: a
    // screen can remain mounted in the background stack and re-run this
    // effect before the previous channel's cleanup finishes.
    const channel = supabase
      .channel(`document-expiry-alerts:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "document_expiry_alerts" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { warnings, loading, reload: load };
}

export async function dismissExpiryWarning(documentId: string): Promise<string | null> {
  const { error } = await supabase
    .from("document_expiry_alerts")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("document_id", documentId);
  return error?.message ?? null;
}
