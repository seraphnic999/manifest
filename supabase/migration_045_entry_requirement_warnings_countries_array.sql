-- Combine a requirement that applies identically across multiple countries
-- (e.g. ETIAS is the same authorization for every Schengen country on a
-- trip) into one warning per (trip, companion, requirement) instead of one
-- per country — countries becomes an array. Table only ever held data from
-- this feature's own testing so far, so recreated rather than migrated.
drop table if exists entry_requirement_warnings;

create table entry_requirement_warnings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  companion_id uuid not null references companions(id) on delete cascade,
  countries text[] not null,
  requirement_description text not null,
  matches_doc_type text,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, companion_id, requirement_description)
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
