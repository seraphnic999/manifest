-- New cities for the v44 destination-photo batch: the three Iberian/UK cruise
-- ports the user explicitly asked for (Southampton, Vigo, La Coruña — all on
-- the "Paris, London & Iberian Cruise" trip's Freedom of the Seas itinerary),
-- plus a modest sweep of other major European and US destinations not yet in
-- the catalog. cover_photo_id is left null; see
-- design/destination-photo-prompts-batch2.json for the images still needed
-- (kebab-case ids are already predictable — e.g. "la-coruña" — once an image
-- exists for each).
insert into cities (name, country, country_code, timezone, currency_code, latitude, longitude, cover_photo_id) values
  ('Southampton', 'United Kingdom', 'GB', 'Europe/London', 'GBP', 50.909700, -1.404400, null),
  ('Vigo', 'Spain', 'ES', 'Europe/Madrid', 'EUR', 42.240600, -8.720700, null),
  ('La Coruña', 'Spain', 'ES', 'Europe/Madrid', 'EUR', 43.362300, -8.411500, null),
  ('Antwerp', 'Belgium', 'BE', 'Europe/Brussels', 'EUR', 51.219400, 4.402500, null),
  ('Basel', 'Switzerland', 'CH', 'Europe/Zurich', 'CHF', 47.559600, 7.588600, null),
  ('Faro', 'Portugal', 'PT', 'Europe/Lisbon', 'EUR', 37.019400, -7.930400, null),
  ('Belfast', 'United Kingdom', 'GB', 'Europe/London', 'GBP', 54.597300, -5.930100, null),
  ('Sarajevo', 'Bosnia and Herzegovina', 'BA', 'Europe/Sarajevo', 'BAM', 43.856300, 18.413100, null),
  ('Yellowstone National Park', 'United States', 'US', 'America/Denver', 'USD', 44.428000, -110.588500, null),
  ('Yosemite National Park', 'United States', 'US', 'America/Los_Angeles', 'USD', 37.865100, -119.538300, null),
  ('Key West', 'United States', 'US', 'America/New_York', 'USD', 24.555100, -81.780000, null),
  ('Maui', 'United States', 'US', 'Pacific/Honolulu', 'USD', 20.798400, -156.331900, null),
  ('Anchorage', 'United States', 'US', 'America/Anchorage', 'USD', 61.218100, -149.900300, null),
  ('Niagara Falls', 'United States', 'US', 'America/New_York', 'USD', 43.096200, -79.037700, null);
