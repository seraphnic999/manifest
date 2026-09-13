-- "At Sea" as a selectable city — a cruise's sea day isn't a real place, but
-- days/trips still need *some* entry from the cities picker, and the
-- fallback (trip's primary city) can be actively wrong for a trip whose
-- primary destination isn't the cruise's home port. Coordinates are a
-- placeholder (0,0 — deliberately "no real single location", not meant to
-- ever anchor a map view) rather than left null, since latitude/longitude
-- are not-null on this table.
insert into cities (name, country, country_code, timezone, currency_code, latitude, longitude, cover_photo_id)
values ('At Sea', 'International Waters', 'ZZ', 'Etc/UTC', 'USD', 0, 0, 'at-sea');
