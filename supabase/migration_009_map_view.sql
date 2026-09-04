-- ============================================================
-- Manifest — Migration 009: built-in map view
-- ============================================================
-- Promotes lat/lon out of items.custom_fields into real columns, adds
-- PostGIS for future "near me" queries, and adds two new tables: map_routes
-- (hand-drawn walking-route polylines) and trip_places (non-itinerary
-- "shortlist" pins — runner-up restaurants, unchosen museums, etc. — that
-- deliberately do NOT belong in `items`, since they have no day/time and
-- would otherwise pollute every day-by-day/trip-wide items query).
--
-- RLS on both new tables mirrors items_owner exactly (FOR ALL, not a
-- dedicated FOR INSERT policy) — see migration_007/008 for why FOR INSERT
-- policies are broken on this project; FOR ALL is the proven-working shape
-- here, and user_has_trip_access() is the same already-audited helper every
-- other trip-scoped table already uses, so this introduces no new RLS
-- surface to reason about.
-- ============================================================

-- ---- 1. Promote lat/lon out of custom_fields ----------------------------

alter table items
  add column latitude  numeric(9,6),
  add column longitude numeric(9,6);

update items
set latitude  = (custom_fields->>'lat')::numeric,
    longitude = (custom_fields->>'lon')::numeric
where custom_fields ? 'lat' and custom_fields ? 'lon';

alter table items
  add constraint items_latlon_paired
  check ((latitude is null) = (longitude is null));

create index items_latlon_idx on items (latitude, longitude)
  where deleted_at is null and latitude is not null;

-- Note: the custom_fields.lat/lon keys are left in place deliberately.
-- Drop them in a follow-up migration once nothing in the app reads them.

-- ---- 2. PostGIS -----------------------------------------------------------

create extension if not exists postgis;

alter table items
  add column geom geography(Point, 4326)
  generated always as (
    case when latitude is not null and longitude is not null
    then st_setsrid(st_makepoint(longitude::float8, latitude::float8), 4326)::geography end
  ) stored;

create index items_geom_idx on items using gist (geom)
  where deleted_at is null;

-- ---- 3. map_routes ---------------------------------------------------------

create table map_routes (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references trips(id) on delete cascade,
  day_id      uuid references days(id) on delete set null,
  name        text not null,
  color       text,                       -- e.g. '#A52714'; null = inherit day colour
  geometry    jsonb not null,             -- GeoJSON LineString, [lon,lat] vertex order
  sort_order  int not null default 1000,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_map_routes_trip on map_routes(trip_id) where deleted_at is null;

alter table map_routes enable row level security;

create policy map_routes_owner on map_routes
  for all using (user_has_trip_access(trip_id))
  with check (user_has_trip_access(trip_id));

-- ---- 4. trip_places (the "spares/shortlist" model) -------------------------
-- Trip-scoped places with no schedule — the map-equivalent of the old
-- Google My Maps "Spares & fallbacks" layer. Not an item_status hack:
-- these never appear in day views, expense rollups, etc. `category` is a
-- free-text label (not the item_type enum) used only to pick a marker
-- glyph — spares don't need the full itinerary type vocabulary.

create table trip_places (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references trips(id) on delete cascade,
  name        text not null,
  category    text,
  latitude    numeric(9,6) not null,
  longitude   numeric(9,6) not null,
  address     text,
  link        text,
  notes       text,
  sort_order  int not null default 1000,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_trip_places_trip on trip_places(trip_id) where deleted_at is null;

alter table trip_places enable row level security;

create policy trip_places_owner on trip_places
  for all using (user_has_trip_access(trip_id))
  with check (user_has_trip_access(trip_id));

-- ---- 5. Seed the 4 hand-drawn Paris routes ----------------------------------
-- From routes.json (companion file to MANIFEST-MAP-HANDOFF.md). Scoped to
-- the Paris trip fixture; day_id resolved by joining days on date.

insert into map_routes (trip_id, day_id, name, color, geometry, sort_order)
select '88fe6341-c8a8-44de-82b1-63763c453877', d.id, r.name, r.color, r.geometry, r.sort_order
from (values
  ('2026-10-28'::date, 'Day 1 walk', '#A52714', 1000,
    '{"type":"LineString","coordinates":[[2.34364,48.87272],[2.3447,48.87262],[2.34556,48.8718],[2.3462,48.8705],[2.34676,48.8693],[2.34714,48.8683],[2.34729,48.86723],[2.34706,48.8664],[2.34694,48.8656],[2.34681,48.86526],[2.3466,48.86505],[2.3462,48.86487],[2.347,48.86474],[2.3481,48.86455],[2.3493,48.86432],[2.35045,48.86408],[2.3514,48.86395],[2.35216,48.86377],[2.35222,48.863],[2.35224,48.8622],[2.35225,48.86159],[2.3531,48.8613],[2.35386,48.86103],[2.3547,48.8608],[2.3554,48.86055],[2.3551,48.86],[2.3546,48.8594],[2.35419,48.85875],[2.35463,48.85858],[2.3556,48.8584],[2.35644,48.85823],[2.3559,48.8578],[2.35449,48.85747],[2.35505,48.85731],[2.35498,48.85683]]}'::jsonb),
  ('2026-10-29'::date, 'Bourse to the Forum', '#0F9D58', 1000,
    '{"type":"LineString","coordinates":[[2.3424,48.86295],[2.343,48.86285],[2.34375,48.86265],[2.34457,48.862425],[2.3453,48.86228],[2.346,48.86208],[2.346673,48.861922]]}'::jsonb),
  ('2026-10-30'::date, 'Montmartre walk', '#F9A825', 1000,
    '{"type":"LineString","coordinates":[[2.33885,48.88443],[2.3387,48.8846],[2.33862,48.88465],[2.339,48.8843],[2.3394,48.8839],[2.33981,48.88348],[2.3406,48.8838],[2.3415,48.8842],[2.34261,48.88464],[2.343,48.8856],[2.3433,48.8864],[2.34342,48.88709],[2.3422,48.8869],[2.340671,48.886518],[2.3418,48.8867],[2.3429,48.886],[2.3429,48.8853],[2.34261,48.88464],[2.3433,48.8842],[2.34366,48.88365],[2.3428,48.883],[2.341,48.8825],[2.339,48.882],[2.336922,48.881691],[2.3378,48.8823],[2.3405,48.8827],[2.3425,48.8829],[2.34393,48.88304]]}'::jsonb),
  ('2026-10-31'::date, 'Maubert to Mouffetard', '#9C27B0', 1000,
    '{"type":"LineString","coordinates":[[2.34889,48.8503],[2.3487,48.8496],[2.34845,48.8488],[2.3482,48.848],[2.348,48.8472],[2.3484,48.8465],[2.349,48.8459],[2.3493,48.8452],[2.34938,48.84407],[2.34945,48.8433],[2.3495,48.8425],[2.34973,48.84162],[2.35,48.8408],[2.3501,48.8399],[2.350436,48.839386],[2.351,48.8401],[2.351552,48.840625]]}'::jsonb)
) as r(date, name, color, sort_order, geometry)
join days d on d.trip_id = '88fe6341-c8a8-44de-82b1-63763c453877' and d.date = r.date;
