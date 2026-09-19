// Manifest — send-reminders Edge Function
//
// Invoked on a schedule by pg_cron (see migration_014's cron.schedule call),
// not by the client. Checks every item with an unsent, due reminder and
// sends a real push notification via Expo's push API — cloud-based, not an
// on-device scheduled alarm, so it survives an OEM battery optimizer or the
// app being force-quit. Deployed with verify_jwt: false since pg_cron/pg_net
// has no user session to attach a JWT from; this function uses its own
// injected service-role key rather than trusting anything from the caller,
// and does nothing destructive, so an unauthenticated trigger is harmless.
//
// Unlike the rest of this app's date math (which safely treats a device's
// own clock as "local enough" — see lib/dateFormat.ts's localIsoDate
// comment), this runs on a server with no meaningful local timezone, so it
// has to actually resolve each item's wall-clock time against its own
// timezone_start (falling back to the trip's default_timezone) to get a
// real UTC instant to compare against "now".

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { DateTime } from "npm:luxon@3";

async function sendPush(supabase: any, userId: string, title: string, body: string): Promise<boolean> {
  const { data: tokens } = await supabase
    .from("push_tokens").select("expo_push_token").eq("user_id", userId);
  if (!tokens || tokens.length === 0) return false; // no registered device — nowhere to deliver it

  const messages = tokens.map((t: any) => ({
    to: t.expo_push_token,
    title,
    body,
    sound: "default",
  }));

  const pushRes = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages),
  });
  const pushJson = await pushRes.json().catch(() => null);
  // Expo's response is a per-message ticket array — "ok" only means Expo
  // accepted it for delivery to FCM, not that it was actually delivered.
  // Logged (not surfaced anywhere) so a real delivery problem is at least
  // visible in this function's logs, not just silently swallowed.
  if (!pushRes.ok || pushJson?.data?.some?.((t: any) => t.status !== "ok")) {
    console.error("push send returned an error ticket", JSON.stringify(pushJson));
  }
  return true;
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: items, error } = await supabase
    .from("items")
    .select("id, title, start_date, time_start, timezone_start, reminder_minutes_before, trips(user_id, default_timezone)")
    .not("reminder_minutes_before", "is", null)
    .is("reminder_sent_at", null)
    .not("start_date", "is", null)
    .not("time_start", "is", null)
    .is("deleted_at", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const now = DateTime.utc();
  let sent = 0;
  let checked = 0;

  for (const item of items ?? []) {
    checked++;
    const trip = (item as any).trips as { user_id: string; default_timezone: string } | null;
    if (!trip?.user_id) continue;

    const zone = item.timezone_start || trip.default_timezone || "UTC";
    const triggerAt = DateTime.fromISO(`${item.start_date}T${item.time_start}`, { zone })
      .minus({ minutes: item.reminder_minutes_before });
    if (!triggerAt.isValid || triggerAt > now) continue;

    await sendPush(supabase, trip.user_id, "Coming up", item.title);
    await supabase.from("items").update({ reminder_sent_at: new Date().toISOString() }).eq("id", item.id);
    sent++;
  }

  // Booking reminders — a separate "go make this reservation" nudge (see
  // migration_048), an absolute instant rather than the day-of item's own
  // start-time-relative offset above, so no per-item timezone math needed
  // here: booking_reminder_at is already the real trigger instant.
  const { data: bookingItems, error: bookingError } = await supabase
    .from("items")
    .select("id, title, booking_reminder_at, trips(user_id)")
    .not("booking_reminder_at", "is", null)
    .is("booking_reminder_sent_at", null)
    .is("deleted_at", null);

  let bookingSent = 0;
  let bookingChecked = 0;

  if (!bookingError) {
    for (const item of bookingItems ?? []) {
      bookingChecked++;
      const trip = (item as any).trips as { user_id: string } | null;
      if (!trip?.user_id) continue;

      const triggerAt = DateTime.fromISO(item.booking_reminder_at);
      if (!triggerAt.isValid || triggerAt > now) continue;

      await sendPush(supabase, trip.user_id, "Time to book", item.title);
      await supabase.from("items").update({ booking_reminder_sent_at: new Date().toISOString() }).eq("id", item.id);
      bookingSent++;
    }
  }

  return new Response(
    JSON.stringify({ checked, sent, bookingChecked, bookingSent }),
    { headers: { "Content-Type": "application/json" } }
  );
});
