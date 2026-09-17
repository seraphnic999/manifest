// Manifest — check-document-expiry Edge Function
//
// Invoked once a day by pg_cron (see the cron.schedule job registered
// alongside this function's deploy — not in a migration file, same as
// send-reminders/poll-flight-status). Sweeps every travel_documents row
// with an expiry_date, maintains one document_expiry_alerts row per
// document that's currently within a year of expiring (or already
// expired), and sends exactly one combined push notification per user for
// whatever's newly true this run — never a daily repeat for something
// already known about (see migration_043's own comment for the full
// first-time/renewal logic this mirrors).
//
// Deployed with verify_jwt: false — pg_cron/pg_net has no user session to
// attach a JWT from; this function uses its own injected service-role key
// rather than trusting anything from the caller, and does nothing
// destructive to any one user's data beyond their own documents' alert
// rows, so an unauthenticated trigger is harmless.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { DateTime } from "npm:luxon@3";

const WINDOW_YEARS = 1;

// Mirrors DOCUMENT_TYPE_OPTIONS in lib/travelDocuments.ts — reimplemented
// here rather than imported, since this Deno function has no access to the
// app's own TS modules.
const TYPE_LABEL: Record<string, string> = {
  passport: "Passport",
  national_id: "National ID",
  visa: "Visa",
  drivers_license: "Driver's License",
  other: "Document",
};

type Json = Record<string, any>;

function companionName(c: Json | null): string {
  if (!c) return "Someone";
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ");
  return full || "Someone";
}

async function notify(supabase: Json, userId: string, count: number, firstLabel: string) {
  const { data: tokens } = await supabase.from("push_tokens").select("expo_push_token").eq("user_id", userId);
  if (!tokens?.length) return;

  const title = count === 1 ? "Document expiring soon" : `${count} documents expiring soon`;
  const body = count === 1 ? firstLabel : `${firstLabel} and ${count - 1} more — check Doc Tracker.`;

  const messages = tokens.map((t: Json) => ({
    to: t.expo_push_token,
    title,
    body,
    sound: "default",
    data: { route: "/doctracker/expiry-warnings" },
  }));

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.data?.some?.((t: Json) => t.status !== "ok")) {
    console.error("push send returned an error ticket", userId, JSON.stringify(json));
  }
}

interface NotifyItem { document_id: string; expiry_date: string; label: string }

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const now = DateTime.utc();
  const horizon = now.plus({ years: WINDOW_YEARS }).toISODate();

  const [{ data: docs, error: docsError }, { data: alerts, error: alertsError }] = await Promise.all([
    supabase
      .from("travel_documents")
      .select("id, type, expiry_date, companion_id, companions(user_id, first_name, last_name)"),
    supabase.from("document_expiry_alerts").select("*"),
  ]);
  if (docsError) return new Response(JSON.stringify({ error: docsError.message }), { status: 500 });
  if (alertsError) return new Response(JSON.stringify({ error: alertsError.message }), { status: 500 });

  const alertByDoc = new Map<string, Json>((alerts ?? []).map((a: Json) => [a.document_id, a]));

  // One entry per user who has at least one freshly-qualifying alert this
  // run — "freshly" meaning newly inserted or reset (a renewal), never one
  // that was already tracked and just hasn't been dismissed yet.
  const toNotify = new Map<string, NotifyItem[]>();
  let checked = 0, tracked = 0, cleared = 0, freshlyQualified = 0;

  for (const doc of (docs ?? []) as Json[]) {
    checked++;
    const companion = doc.companions as Json | null;
    const userId = companion?.user_id as string | undefined;
    const existing = alertByDoc.get(doc.id);

    const withinWindow = !!doc.expiry_date && doc.expiry_date <= horizon;

    if (!withinWindow) {
      if (existing) {
        await supabase.from("document_expiry_alerts").delete().eq("document_id", doc.id);
        cleared++;
      }
      continue;
    }

    const isFresh = !existing || existing.expiry_date !== doc.expiry_date;
    if (isFresh) {
      await supabase.from("document_expiry_alerts").upsert({
        document_id: doc.id,
        expiry_date: doc.expiry_date,
        first_detected_at: new Date().toISOString(),
        notified_at: null,
        dismissed_at: null,
      });
      freshlyQualified++;

      if (userId) {
        const label = `${companionName(companion)}'s ${TYPE_LABEL[doc.type] ?? "document"} expires ${doc.expiry_date}`;
        const list = toNotify.get(userId) ?? [];
        list.push({ document_id: doc.id, expiry_date: doc.expiry_date, label });
        toNotify.set(userId, list);
      }
    }
    tracked++;
  }

  let notified = 0;
  for (const [userId, list] of toNotify) {
    list.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
    try {
      await notify(supabase, userId, list.length, list[0].label);
      notified++;
      const notifiedAt = new Date().toISOString();
      for (const item of list) {
        await supabase.from("document_expiry_alerts").update({ notified_at: notifiedAt }).eq("document_id", item.document_id);
      }
    } catch (e) {
      console.error("notify failed", userId, e);
    }
  }

  return new Response(
    JSON.stringify({ checked, tracked, cleared, freshlyQualified, notified }),
    { headers: { "content-type": "application/json" } }
  );
});
