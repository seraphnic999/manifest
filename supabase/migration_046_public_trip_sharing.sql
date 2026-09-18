-- Read-only public trip sharing: a per-trip link an owner/collaborator can
-- turn on, optionally PIN-protect, and share outside the app (e.g. over
-- WhatsApp) for a read-only web view. Deliberately a separate table from
-- trip_shares (the existing invite-a-collaborator-by-email feature) — this
-- one is anonymous-access-by-token, an unrelated concept.

alter table items add column is_private boolean not null default false;

create table trip_share_links (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade unique,
  token text not null unique,
  enabled boolean not null default true,
  -- SHA-256 hex digest only — the PIN itself is never stored. Set/cleared
  -- via set_trip_share_pin() below, never written to directly.
  pin_hash text,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid()
);

alter table trip_share_links enable row level security;
create policy trip_share_links_access on trip_share_links
  for all using (user_has_trip_access(trip_id))
  with check (user_has_trip_access(trip_id));

-- Only the share-trip-data Edge Function (service role) reads this; the app
-- never queries Open-Meteo results back out of it directly.
create table weather_share_cache (
  city_key text primary key, -- "<lat rounded to 2dp>,<lon rounded to 2dp>"
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

-- Validates and hashes a PIN for a trip's share link without the app ever
-- needing its own hashing dependency, and without the plaintext PIN
-- touching application logs or client code beyond this one RPC call.
-- p_pin null clears any existing PIN (link becomes open to anyone with the
-- link, same as it started).
create or replace function set_trip_share_pin(p_trip_id uuid, p_pin text)
returns void
language plpgsql
security invoker
as $$
begin
  if not user_has_trip_access(p_trip_id) then
    raise exception 'not authorized';
  end if;

  if p_pin is not null and p_pin !~ '^[0-9]{4,}$' then
    raise exception 'PIN must be at least 4 digits';
  end if;

  update trip_share_links
  set pin_hash = case when p_pin is null then null else encode(extensions.digest(p_pin, 'sha256'), 'hex') end
  where trip_id = p_trip_id;
end;
$$;
