-- Coordinates for a trip's custom-named (free-text) destinations, so the
-- travel-stats world map can plot a pin for them too, not just built-in
-- cities. Populated by the geocode-city edge function when a custom city is
-- saved; left null if geocoding fails (rare) or for rows predating this.
-- Picked (city_id) rows never use these columns — they read cities.latitude/
-- longitude instead, which is always populated.
alter table trip_cities add column latitude numeric(9,6);
alter table trip_cities add column longitude numeric(9,6);
alter table trip_cities add constraint trip_cities_latlon_paired check ((latitude is null) = (longitude is null));
