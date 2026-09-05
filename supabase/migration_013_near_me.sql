-- ============================================================
-- Manifest — Migration 013: nearby_items() for Near-me mode
-- ============================================================
-- Uses the geom column already generated on every item (see
-- migration_009_map_view.sql) — no schema change needed. Scoped to every
-- item on the trip with coordinates, not just the Proposals shortlist,
-- per the roadmap decision. Plain SECURITY INVOKER (the default) means
-- the underlying `items` select still goes through the existing
-- items_owner RLS policy exactly like any other client query — this
-- function adds no access of its own.
-- ============================================================

create or replace function nearby_items(
  p_trip_id uuid, p_lat float8, p_lon float8, p_limit int default 20
)
returns table (item items, distance_m double precision)
language sql
stable
as $$
  select i, st_distance(i.geom, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography) as distance_m
  from items i
  where i.trip_id = p_trip_id
    and i.deleted_at is null
    and i.geom is not null
  order by i.geom <-> st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography
  limit p_limit;
$$;
