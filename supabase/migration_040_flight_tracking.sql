-- ============================================================
-- Manifest — Migration 040: live flight tracking
-- ============================================================
-- A scheduled Edge Function (see supabase/functions/poll-flight-status,
-- cron-registered separately — not in this migration, same as
-- send-reminders in migration_014) starts polling AeroDataBox 4 hours
-- before each flight item's scheduled departure and keeps checking every
-- ~20 minutes until the flight lands (or a safety cutoff passes). One row
-- per flight item — the latest known status plus the previous one, so the
-- poller can detect a real change and fire exactly one push notification
-- per change, not one per poll.
--
-- This table is the single source of truth for a flight's live status: the
-- trip overview page's status bubble, the item detail page's own card, and
-- a manual "refresh now" tap from either screen all read/write the same
-- row, so a manual refresh from one screen is immediately reflected on the
-- other without a second AeroDataBox call.
-- ============================================================

create table flight_status (
  item_id uuid primary key references items(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  flight_number text not null,
  status text,                          -- e.g. "Scheduled", "EnRoute", "Landed", "Cancelled"; null if never successfully checked
  previous_status text,                 -- the status as of the check before this one — lets the poller detect a real change
  data jsonb not null default '{}',     -- full FlightStatus shape (departure/arrival airport, times, gate, terminal)
  tracking_active boolean not null default true, -- false once landed/cancelled or past the safety cutoff — the poller skips these
  last_error text,                      -- most recent lookup failure, if any; left as-is (not cleared) by a later transient error on a different flight
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index flight_status_trip_id_idx on flight_status(trip_id);

alter table flight_status enable row level security;

create policy flight_status_owner on flight_status
  for all using (user_has_trip_access(trip_id))
  with check (user_has_trip_access(trip_id));

create trigger flight_status_set_updated_at
  before update on flight_status
  for each row execute function set_updated_at();
