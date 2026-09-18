-- Entry Requirements Checker: after a trip is created (or re-run manually
-- from the trip's hamburger menu), research each of the trip's countries'
-- entry requirements for an Israeli traveler, then validate every companion
-- attached to the trip actually holds a matching, unexpired document.
-- Mirrors item_research_jobs' job-row + background-edge-function shape
-- (see check-entry-requirements) for the research side, and
-- document_expiry_alerts' per-row dismiss tracking for the warning side.

create table entry_requirement_checks (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'researching', 'ready', 'failed')),
  -- [{ country, requirement_summary, no_special_requirements, documents_required: [{ description, matches_doc_type, min_validity_months_beyond_travel, source_url }] }]
  countries jsonb,
  error text,
  cost_usd numeric,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id)
);

create trigger trg_entry_requirement_checks_updated_at before update on entry_requirement_checks
  for each row execute function set_updated_at();

alter table entry_requirement_checks enable row level security;
create policy entry_requirement_checks_access on entry_requirement_checks
  for all using (user_has_trip_access(trip_id))
  with check (user_has_trip_access(trip_id));

-- One row per (trip, companion, country, requirement) that companion does
-- NOT currently satisfy. A resolved problem (the companion added the
-- missing document, or a re-run's fresh research no longer finds the
-- requirement) is deleted, not just marked dismissed — dismissed_at means
-- "the user acknowledged this, still logged, greyed out on Document
-- Analysis" and is cleared back to null (never shown again as a
-- fully-deleted row) only when the trip's check is explicitly re-run.
create table entry_requirement_warnings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  companion_id uuid not null references companions(id) on delete cascade,
  country text not null,
  requirement_description text not null,
  matches_doc_type text,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, companion_id, country, requirement_description)
);

create index idx_entry_requirement_warnings_trip on entry_requirement_warnings(trip_id);
create index idx_entry_requirement_warnings_dismissed on entry_requirement_warnings(dismissed_at);

create trigger trg_entry_requirement_warnings_updated_at before update on entry_requirement_warnings
  for each row execute function set_updated_at();

alter table entry_requirement_warnings enable row level security;
create policy entry_requirement_warnings_access on entry_requirement_warnings
  for all using (user_has_trip_access(trip_id))
  with check (user_has_trip_access(trip_id));

alter publication supabase_realtime add table entry_requirement_warnings;
alter publication supabase_realtime add table entry_requirement_checks;
