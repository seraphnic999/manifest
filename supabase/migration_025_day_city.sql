-- Ties each day to a specific city (from the trip's own picked
-- destinations, the full cities dataset, or a custom name), independent of
-- the trip's own primary city. Nullable by design: a day with no override
-- (both columns null) simply inherits the trip's primary city at display
-- time — no backfill needed for existing days, and generate_trip_days()
-- needs no changes since new days are created with both columns unset.

alter table days
  add column city_id uuid references cities(id) on delete set null,
  add column custom_city_name text;

-- Unlike trip_cities (where every row must represent a real destination),
-- a day is allowed to have neither set (inherit the trip's primary city) —
-- so this only forbids setting *both* at once, not requiring at least one.
alter table days
  add constraint days_city_one_or_none check (city_id is null or custom_city_name is null);
