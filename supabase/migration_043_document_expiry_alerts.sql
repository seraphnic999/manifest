-- ============================================================
-- Manifest — Migration 043: document expiry reminders
-- ============================================================
-- One row per travel_documents row that's currently within a year of
-- expiring (or already expired) — created/maintained by the daily
-- check-document-expiry Edge Function, never by the app directly (the app
-- only ever updates dismissed_at). Primary key is document_id itself, not a
-- separate id: a document can only ever have one active "this is expiring"
-- situation at a time, and keying on the document lets the cron tell a
-- genuinely new/renewed expiry apart from one it already knows about by
-- comparing the stored expiry_date against the document's current one.
--
-- notified_at is set once the push notification for this alert has gone
-- out — "the first time a document is identified as about to expire" means
-- exactly once per (document, expiry_date) pair, not once per daily sweep.
-- dismissed_at is set by the user from the expiry-warnings screen or the
-- companion detail page; once set, this alert is permanently hidden until
-- the underlying document's expiry_date actually changes (a renewal), which
-- resets both notified_at and dismissed_at back to null via a fresh row
-- (see check-document-expiry's own comment for the exact logic).
-- ============================================================

create table document_expiry_alerts (
  document_id uuid primary key references travel_documents(id) on delete cascade,
  expiry_date date not null,
  first_detected_at timestamptz not null default now(),
  notified_at timestamptz,
  dismissed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index idx_document_expiry_alerts_dismissed on document_expiry_alerts(dismissed_at);

alter table document_expiry_alerts enable row level security;

-- FOR ALL (not a dedicated FOR SELECT/UPDATE), matching this project's
-- established pattern — the app only ever updates dismissed_at (via the
-- expiry-warnings screen or companion detail page), the daily cron inserts/
-- updates/deletes as service_role (which bypasses RLS entirely), but one
-- permissive owner policy avoids the insert-policy pitfall documented for
-- this project regardless.
create policy document_expiry_alerts_owner on document_expiry_alerts
  for all using (
    exists (
      select 1 from travel_documents td
      join companions c on c.id = td.companion_id
      where td.id = document_expiry_alerts.document_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from travel_documents td
      join companions c on c.id = td.companion_id
      where td.id = document_expiry_alerts.document_id and c.user_id = auth.uid()
    )
  );

create trigger trg_document_expiry_alerts_updated_at
  before update on document_expiry_alerts
  for each row execute function set_updated_at();

-- Needed for the Home bubble / expiry-warnings screen to live-update if a
-- sweep runs (or another device dismisses a warning) while the app is open.
alter publication supabase_realtime add table document_expiry_alerts;
