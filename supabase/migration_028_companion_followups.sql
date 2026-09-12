-- Doc Tracker follow-up: an optional Israeli ID# field on companions, and a
-- trip <-> companion join table ("who am I traveling with") so trips can
-- show attached companions as avatars on the Overview page.

alter table companions add column israeli_id text;

create table trip_companions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  companion_id uuid not null references companions(id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (trip_id, companion_id)
);

create index idx_trip_companions_trip on trip_companions(trip_id);
create index idx_trip_companions_companion on trip_companions(companion_id);

alter table trip_companions enable row level security;
create policy trip_companions_owner on trip_companions
  for all using (user_has_trip_access(trip_id))
  with check (user_has_trip_access(trip_id));
