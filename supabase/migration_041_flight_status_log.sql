-- ============================================================
-- Manifest — Migration 041: persistent flight status log
-- ============================================================
-- flight_status (migration_040) holds only the latest known status per
-- flight item — each poll overwrites it. This table is the append-only
-- history alongside it: poll-flight-status inserts one row here every time
-- it detects a real status change within a flight's tracking window, plus
-- one "now tracking" row for the very first status it ever successfully
-- observes for that flight (previous_status null) — the same moment it
-- fires a push notification either way, one log row per notification,
-- never one per poll. Rows are never updated or deleted by the app, so a
-- flight's log is a permanent record of "what actually happened" even
-- after flight_status itself is long past its terminal status.
--
-- Read-only from the client: the dedicated log page
-- (app/item/[itemId]/flight-log.tsx) only ever selects from this table,
-- ordered newest-first, with a realtime subscription so a row inserted
-- while the page is open appears without a manual refresh.
-- ============================================================

create table flight_status_log (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  flight_number text not null,
  status text,                          -- the new status as of this event
  previous_status text,                 -- what it changed from; null on the first-ever "now tracking" event
  data jsonb not null default '{}',     -- full FlightStatus snapshot at this event (same shape as flight_status.data)
  created_at timestamptz not null default now()
);

create index flight_status_log_item_id_idx on flight_status_log(item_id, created_at desc);
create index flight_status_log_trip_id_idx on flight_status_log(trip_id);

alter table flight_status_log enable row level security;

-- FOR ALL (not a dedicated FOR SELECT) matching flight_status_owner's
-- shape — the app never writes to this table itself (poll-flight-status
-- runs as service_role, which bypasses RLS), but a single permissive
-- policy avoids the insert-policy pitfall documented for this project.
create policy flight_status_log_owner on flight_status_log
  for all using (user_has_trip_access(trip_id))
  with check (user_has_trip_access(trip_id));

-- Needed for the log page's live "new row appeared" subscription — same
-- publication item_research_jobs/email_proposals are already on.
alter publication supabase_realtime add table flight_status_log;
