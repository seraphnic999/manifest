-- ============================================================
-- Manifest — Migration 014: reminders (cloud push)
-- ============================================================
-- Cloud-based, not on-device: a scheduled Edge Function (see
-- supabase/functions/send-reminders) checks for due, unsent reminders and
-- sends a real push notification via Expo's push API, rather than the
-- phone scheduling its own local alarm — survives an OEM battery
-- optimizer killing background alarms, and the app being force-quit.
-- ============================================================

alter table items add column reminder_minutes_before integer;
alter table items add column reminder_sent_at timestamptz;

-- One row per device that's registered for push. A single user could have
-- more than one device eventually, hence a real table (not a column on
-- auth.users) — unique per (user, token) so re-registering the same
-- device's token is a no-op rather than a duplicate row.
create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null,
  updated_at timestamptz not null default now(),
  constraint push_tokens_unique unique (user_id, expo_push_token)
);

alter table push_tokens enable row level security;

create policy push_tokens_owner on push_tokens
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());
