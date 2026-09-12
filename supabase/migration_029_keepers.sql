-- Keepers: a personal log of trip items worth remembering, organized by
-- city. A snapshot copy of the source item (not a live reference — trips
-- can be archived/deleted without affecting a kept memory), tied to the
-- day's effective city at the time it was kept. Mirrors companions' plain
-- user-owned-table pattern (no owner-forcing trigger; relies on the
-- column's own default auth.uid() since the app never overrides it).

create table keepers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  city_id uuid references cities(id),
  custom_city_name text,
  city_label text not null,
  item_type text not null,
  title text not null,
  start_date date,
  end_date date,
  time_start text,
  time_end text,
  timezone_start text,
  timezone_end text,
  notes text,
  confirmation_code text,
  booking_source text,
  address text,
  phone text,
  vendor text,
  link text,
  google_maps_link text,
  latitude double precision,
  longitude double precision,
  map_icon text,
  source_trip_name text,
  rating int check (rating between 1 and 5),
  personal_notes text,
  created_at timestamptz not null default now()
);

create index idx_keepers_user on keepers(user_id);
create index idx_keepers_city_label on keepers(user_id, city_label);

alter table keepers enable row level security;
create policy keepers_owner on keepers
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
