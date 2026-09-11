-- Adds a pre-populated "cities" reference dataset (name, country, IANA
-- timezone, ISO currency, coordinates, matching bundled cover photo) and a
-- trip_cities join table, so the trip creation/edit screens can replace the
-- free-text "Destinations" field with a searchable multi-select city picker
-- that auto-populates cover photo, timezone, currencies, and the map's
-- default focus point. See lib/destinationPhotos.ts for the bundled photo
-- set that cover_photo_id references (id into that array, or null -> the
-- generic _fallback.jpg).

create table cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  country_code text not null,        -- ISO 3166-1 alpha-2
  timezone text not null,            -- IANA tz name, e.g. 'Europe/Paris'
  currency_code text not null,       -- ISO 4217 (or 'NIS', matching this app's
                                      -- own convention for Israeli Shekel —
                                      -- see trip_currencies.code)
  latitude numeric(9,6) not null,
  longitude numeric(9,6) not null,
  cover_photo_id text,               -- id into lib/destinationPhotos.ts, or null
  created_at timestamptz not null default now(),
  unique (name, country_code)
);

create index idx_cities_name on cities (lower(name));

alter table cities enable row level security;

-- Shared reference data, not trip-scoped: any authenticated user can read
-- it; there is no client-side insert/update/delete policy since the set is
-- only ever seeded/extended via migration (service-role bypasses RLS).
create policy cities_select on cities for select using (auth.role() = 'authenticated');

-- ---------- trips: derived map-focus point ----------

alter table trips add column latitude numeric(9,6), add column longitude numeric(9,6);
alter table trips add constraint trips_latlon_paired check ((latitude is null) = (longitude is null));

-- ---------- trip_cities (join: which cities/custom destinations a trip has) ----------

create table trip_cities (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  city_id uuid references cities(id) on delete set null,
  custom_name text,                  -- free-text destination, set only when city_id is null
  sort_order int not null default 0, -- lowest = "primary" city, drives cover/timezone/lat-lon auto-fill
  created_at timestamptz not null default now(),
  constraint trip_cities_one_of_city_or_custom check (
    (city_id is not null and custom_name is null) or
    (city_id is null and custom_name is not null)
  )
);

create index idx_trip_cities_trip on trip_cities (trip_id);

alter table trip_cities enable row level security;

create policy trip_cities_owner on trip_cities
  for all using (user_has_trip_access(trip_id))
  with check (user_has_trip_access(trip_id));

-- ---------- Seed data ----------
-- The first block (bundled-photo matches) mirrors lib/destinationPhotos.ts's
-- 102-entry list exactly by (name, country); cover_photo_id is that file's
-- matching id. The second block extends coverage to ~200 total popular
-- destinations that don't yet have a dedicated bundled photo (cover_photo_id
-- null -> falls back to _fallback.jpg via the existing coverPhotoSource()).

insert into cities (name, country, country_code, timezone, currency_code, latitude, longitude, cover_photo_id) values
  ('Paris', 'France', 'FR', 'Europe/Paris', 'EUR', 48.856700, 2.352200, 'paris'),
  ('London', 'United Kingdom', 'GB', 'Europe/London', 'GBP', 51.507400, -0.127800, 'london'),
  ('Rome', 'Italy', 'IT', 'Europe/Rome', 'EUR', 41.902800, 12.496400, 'rome'),
  ('Venice', 'Italy', 'IT', 'Europe/Rome', 'EUR', 45.440800, 12.315800, 'venice'),
  ('Florence', 'Italy', 'IT', 'Europe/Rome', 'EUR', 43.769600, 11.255800, 'florence'),
  ('Milan', 'Italy', 'IT', 'Europe/Rome', 'EUR', 45.464200, 9.190000, 'milan'),
  ('Naples', 'Italy', 'IT', 'Europe/Rome', 'EUR', 40.851800, 14.268100, 'naples'),
  ('Cinque Terre', 'Italy', 'IT', 'Europe/Rome', 'EUR', 44.126900, 9.711000, 'cinque-terre'),
  ('Amalfi Coast', 'Italy', 'IT', 'Europe/Rome', 'EUR', 40.634600, 14.602800, 'amalfi-coast'),
  ('Barcelona', 'Spain', 'ES', 'Europe/Madrid', 'EUR', 41.385100, 2.173400, 'barcelona'),
  ('Madrid', 'Spain', 'ES', 'Europe/Madrid', 'EUR', 40.416800, -3.703800, 'madrid'),
  ('Seville', 'Spain', 'ES', 'Europe/Madrid', 'EUR', 37.389200, -5.984500, 'seville'),
  ('Valencia', 'Spain', 'ES', 'Europe/Madrid', 'EUR', 39.469900, -0.376300, 'valencia'),
  ('Palma de Mallorca', 'Spain', 'ES', 'Europe/Madrid', 'EUR', 39.569600, 2.650200, 'palma-de-mallorca'),
  ('Ibiza', 'Spain', 'ES', 'Europe/Madrid', 'EUR', 38.909200, 1.432100, 'ibiza'),
  ('Lisbon', 'Portugal', 'PT', 'Europe/Lisbon', 'EUR', 38.722300, -9.139500, 'lisbon'),
  ('Porto', 'Portugal', 'PT', 'Europe/Lisbon', 'EUR', 41.157900, -8.629500, 'porto'),
  ('Berlin', 'Germany', 'DE', 'Europe/Berlin', 'EUR', 52.520000, 13.405000, 'berlin'),
  ('Munich', 'Germany', 'DE', 'Europe/Berlin', 'EUR', 48.135100, 11.582000, 'munich'),
  ('Hamburg', 'Germany', 'DE', 'Europe/Berlin', 'EUR', 53.551100, 9.993200, 'hamburg'),
  ('Cologne', 'Germany', 'DE', 'Europe/Berlin', 'EUR', 50.937500, 6.960100, 'cologne'),
  ('Frankfurt', 'Germany', 'DE', 'Europe/Berlin', 'EUR', 50.110600, 8.682100, 'frankfurt'),
  ('Amsterdam', 'Netherlands', 'NL', 'Europe/Amsterdam', 'EUR', 52.367600, 4.904100, 'amsterdam'),
  ('Rotterdam', 'Netherlands', 'NL', 'Europe/Amsterdam', 'EUR', 51.924400, 4.477700, 'rotterdam'),
  ('Brussels', 'Belgium', 'BE', 'Europe/Brussels', 'EUR', 50.850300, 4.351700, 'brussels'),
  ('Bruges', 'Belgium', 'BE', 'Europe/Brussels', 'EUR', 51.209000, 3.224200, 'bruges'),
  ('Vienna', 'Austria', 'AT', 'Europe/Vienna', 'EUR', 48.208500, 16.373100, 'vienna'),
  ('Salzburg', 'Austria', 'AT', 'Europe/Vienna', 'EUR', 47.809500, 13.055000, 'salzburg'),
  ('Innsbruck', 'Austria', 'AT', 'Europe/Vienna', 'EUR', 47.269200, 11.404100, 'innsbruck'),
  ('Zurich', 'Switzerland', 'CH', 'Europe/Zurich', 'CHF', 47.376900, 8.541700, 'zurich'),
  ('Geneva', 'Switzerland', 'CH', 'Europe/Zurich', 'CHF', 46.204400, 6.143200, 'geneva'),
  ('Prague', 'Czech Republic', 'CZ', 'Europe/Prague', 'CZK', 50.075500, 14.437800, 'prague'),
  ('Budapest', 'Hungary', 'HU', 'Europe/Budapest', 'HUF', 47.497900, 19.040200, 'budapest'),
  ('Warsaw', 'Poland', 'PL', 'Europe/Warsaw', 'PLN', 52.229700, 21.012200, 'warsaw'),
  ('Krakow', 'Poland', 'PL', 'Europe/Warsaw', 'PLN', 50.064700, 19.945000, 'krakow'),
  ('Vilnius', 'Lithuania', 'LT', 'Europe/Vilnius', 'EUR', 54.687200, 25.279800, 'vilnius'),
  ('Riga', 'Latvia', 'LV', 'Europe/Riga', 'EUR', 56.949600, 24.105900, 'riga'),
  ('Tallinn', 'Estonia', 'EE', 'Europe/Tallinn', 'EUR', 59.436900, 24.753600, 'tallinn'),
  ('Copenhagen', 'Denmark', 'DK', 'Europe/Copenhagen', 'DKK', 55.676100, 12.568300, 'copenhagen'),
  ('Stockholm', 'Sweden', 'SE', 'Europe/Stockholm', 'SEK', 59.329300, 18.068600, 'stockholm'),
  ('Gothenburg', 'Sweden', 'SE', 'Europe/Stockholm', 'SEK', 57.708700, 11.974600, 'gothenburg'),
  ('Oslo', 'Norway', 'NO', 'Europe/Oslo', 'NOK', 59.913900, 10.752200, 'oslo'),
  ('Bergen', 'Norway', 'NO', 'Europe/Oslo', 'NOK', 60.391600, 5.322000, 'bergen'),
  ('Helsinki', 'Finland', 'FI', 'Europe/Helsinki', 'EUR', 60.169900, 24.938400, 'helsinki'),
  ('Reykjavik', 'Iceland', 'IS', 'Atlantic/Reykjavik', 'ISK', 64.146600, -21.942600, 'reykjavik'),
  ('Dublin', 'Ireland', 'IE', 'Europe/Dublin', 'EUR', 53.349800, -6.260300, 'dublin'),
  ('Edinburgh', 'United Kingdom', 'GB', 'Europe/London', 'GBP', 55.953300, -3.188900, 'edinburgh'),
  ('Athens', 'Greece', 'GR', 'Europe/Athens', 'EUR', 37.983800, 23.727500, 'athens'),
  ('Santorini', 'Greece', 'GR', 'Europe/Athens', 'EUR', 36.393100, 25.461500, 'santorini'),
  ('Mykonos', 'Greece', 'GR', 'Europe/Athens', 'EUR', 37.445700, 25.328500, 'mykonos'),
  ('Dubrovnik', 'Croatia', 'HR', 'Europe/Zagreb', 'EUR', 42.640800, 18.108000, 'dubrovnik'),
  ('Split', 'Croatia', 'HR', 'Europe/Zagreb', 'EUR', 43.508100, 16.440200, 'split'),
  ('Ljubljana', 'Slovenia', 'SI', 'Europe/Ljubljana', 'EUR', 46.056900, 14.505800, 'ljubljana'),
  ('Zagreb', 'Croatia', 'HR', 'Europe/Zagreb', 'EUR', 45.815000, 15.981900, 'zagreb'),
  ('Belgrade', 'Serbia', 'RS', 'Europe/Belgrade', 'RSD', 44.786800, 20.448100, 'belgrade'),
  ('Bucharest', 'Romania', 'RO', 'Europe/Bucharest', 'RON', 44.426800, 26.102700, 'bucharest'),
  ('Sofia', 'Bulgaria', 'BG', 'Europe/Sofia', 'BGN', 42.697700, 23.321800, 'sofia'),
  ('Istanbul', 'Turkey', 'TR', 'Europe/Istanbul', 'TRY', 41.008200, 28.978400, 'istanbul'),
  ('Antalya', 'Turkey', 'TR', 'Europe/Istanbul', 'TRY', 36.896900, 30.713300, 'antalya'),
  ('Cappadocia', 'Turkey', 'TR', 'Europe/Istanbul', 'TRY', 38.643100, 34.828100, 'cappadocia'),
  ('Valletta', 'Malta', 'MT', 'Europe/Malta', 'EUR', 35.899700, 14.514500, 'valletta'),
  ('Nice', 'France', 'FR', 'Europe/Paris', 'EUR', 43.710200, 7.261900, 'nice'),
  ('New York City', 'United States', 'US', 'America/New_York', 'USD', 40.712800, -74.006000, 'new-york-city'),
  ('Los Angeles', 'United States', 'US', 'America/Los_Angeles', 'USD', 34.052200, -118.243700, 'los-angeles'),
  ('San Francisco', 'United States', 'US', 'America/Los_Angeles', 'USD', 37.774900, -122.419400, 'san-francisco'),
  ('Las Vegas', 'United States', 'US', 'America/Los_Angeles', 'USD', 36.171000, -115.139000, 'las-vegas'),
  ('Miami', 'United States', 'US', 'America/New_York', 'USD', 25.761700, -80.191800, 'miami'),
  ('Chicago', 'United States', 'US', 'America/Chicago', 'USD', 41.878100, -87.629800, 'chicago'),
  ('Washington DC', 'United States', 'US', 'America/New_York', 'USD', 38.907200, -77.036900, 'washington-dc'),
  ('Boston', 'United States', 'US', 'America/New_York', 'USD', 42.360100, -71.058900, 'boston'),
  ('Seattle', 'United States', 'US', 'America/Los_Angeles', 'USD', 47.606200, -122.332100, 'seattle'),
  ('Orlando', 'United States', 'US', 'America/New_York', 'USD', 28.538300, -81.379200, 'orlando'),
  ('New Orleans', 'United States', 'US', 'America/Chicago', 'USD', 29.951000, -90.071500, 'new-orleans'),
  ('Honolulu', 'United States', 'US', 'Pacific/Honolulu', 'USD', 21.306900, -157.858300, 'honolulu'),
  ('San Diego', 'United States', 'US', 'America/Los_Angeles', 'USD', 32.715700, -117.161100, 'san-diego'),
  ('Nashville', 'United States', 'US', 'America/Chicago', 'USD', 36.162700, -86.781600, 'nashville'),
  ('Grand Canyon', 'United States', 'US', 'America/Phoenix', 'USD', 36.106500, -112.112900, 'grand-canyon'),
  ('Tokyo', 'Japan', 'JP', 'Asia/Tokyo', 'JPY', 35.676200, 139.650300, 'tokyo'),
  ('Kyoto', 'Japan', 'JP', 'Asia/Tokyo', 'JPY', 35.011600, 135.768100, 'kyoto'),
  ('Osaka', 'Japan', 'JP', 'Asia/Tokyo', 'JPY', 34.693700, 135.502300, 'osaka'),
  ('Hakone', 'Japan', 'JP', 'Asia/Tokyo', 'JPY', 35.232900, 139.106900, 'hakone'),
  ('Sapporo', 'Japan', 'JP', 'Asia/Tokyo', 'JPY', 43.061900, 141.354400, 'sapporo'),
  ('Nara', 'Japan', 'JP', 'Asia/Tokyo', 'JPY', 34.685100, 135.804900, 'nara'),
  ('Hiroshima', 'Japan', 'JP', 'Asia/Tokyo', 'JPY', 34.385500, 132.455300, 'hiroshima'),
  ('Beijing', 'China', 'CN', 'Asia/Shanghai', 'CNY', 39.904200, 116.407400, 'beijing'),
  ('Shanghai', 'China', 'CN', 'Asia/Shanghai', 'CNY', 31.230400, 121.473700, 'shanghai'),
  ('Hong Kong', 'Hong Kong', 'HK', 'Asia/Hong_Kong', 'HKD', 22.319300, 114.169400, 'hong-kong'),
  ('Guilin', 'China', 'CN', 'Asia/Shanghai', 'CNY', 25.234500, 110.180000, 'guilin'),
  ('Xi''an', 'China', 'CN', 'Asia/Shanghai', 'CNY', 34.341600, 108.940200, 'xi-an'),
  ('Chengdu', 'China', 'CN', 'Asia/Shanghai', 'CNY', 30.572800, 104.066700, 'chengdu'),
  ('Bangkok', 'Thailand', 'TH', 'Asia/Bangkok', 'THB', 13.756300, 100.501500, 'bangkok'),
  ('Phuket', 'Thailand', 'TH', 'Asia/Bangkok', 'THB', 7.880400, 98.392300, 'phuket'),
  ('Chiang Mai', 'Thailand', 'TH', 'Asia/Bangkok', 'THB', 18.796100, 98.979300, 'chiang-mai'),
  ('Krabi', 'Thailand', 'TH', 'Asia/Bangkok', 'THB', 8.086300, 98.906300, 'krabi'),
  ('Koh Samui', 'Thailand', 'TH', 'Asia/Bangkok', 'THB', 9.512400, 100.013800, 'koh-samui'),
  ('Singapore', 'Singapore', 'SG', 'Asia/Singapore', 'SGD', 1.352100, 103.819800, 'singapore'),
  ('Seoul', 'South Korea', 'KR', 'Asia/Seoul', 'KRW', 37.566500, 126.978000, 'seoul'),
  ('Bali', 'Indonesia', 'ID', 'Asia/Makassar', 'IDR', -8.340900, 115.092000, 'bali'),
  ('Dubai', 'United Arab Emirates', 'AE', 'Asia/Dubai', 'AED', 25.204800, 55.270800, 'dubai'),
  ('Ha Long Bay', 'Vietnam', 'VN', 'Asia/Ho_Chi_Minh', 'VND', 20.910100, 107.183900, 'ha-long-bay'),
  ('Lyon', 'France', 'FR', 'Europe/Paris', 'EUR', 45.764000, 4.835700, 'lyon'),

  -- Additional popular destinations without a dedicated bundled cover photo
  -- (cover_photo_id null -> falls back to the generic _fallback.jpg).
  ('Malaga', 'Spain', 'ES', 'Europe/Madrid', 'EUR', 36.721300, -4.421400, null),
  ('Bilbao', 'Spain', 'ES', 'Europe/Madrid', 'EUR', 43.263000, -2.935000, null),
  ('Granada', 'Spain', 'ES', 'Europe/Madrid', 'EUR', 37.177300, -3.598600, null),
  ('San Sebastian', 'Spain', 'ES', 'Europe/Madrid', 'EUR', 43.318300, -1.981200, null),
  ('Marseille', 'France', 'FR', 'Europe/Paris', 'EUR', 43.296500, 5.369800, null),
  ('Bordeaux', 'France', 'FR', 'Europe/Paris', 'EUR', 44.837800, -0.579200, null),
  ('Strasbourg', 'France', 'FR', 'Europe/Paris', 'EUR', 48.573400, 7.752100, null),
  ('Verona', 'Italy', 'IT', 'Europe/Rome', 'EUR', 45.438400, 10.991600, null),
  ('Turin', 'Italy', 'IT', 'Europe/Rome', 'EUR', 45.070300, 7.686900, null),
  ('Bologna', 'Italy', 'IT', 'Europe/Rome', 'EUR', 44.494900, 11.342600, null),
  ('Pisa', 'Italy', 'IT', 'Europe/Rome', 'EUR', 43.722800, 10.401700, null),
  ('Palermo', 'Italy', 'IT', 'Europe/Rome', 'EUR', 38.115700, 13.361300, null),
  ('Cagliari', 'Italy', 'IT', 'Europe/Rome', 'EUR', 39.223800, 9.121700, null),
  ('Corfu', 'Greece', 'GR', 'Europe/Athens', 'EUR', 39.624300, 19.921700, null),
  ('Rhodes', 'Greece', 'GR', 'Europe/Athens', 'EUR', 36.434100, 28.217600, null),
  ('Heraklion', 'Greece', 'GR', 'Europe/Athens', 'EUR', 35.338700, 25.144200, null),
  ('Thessaloniki', 'Greece', 'GR', 'Europe/Athens', 'EUR', 40.640100, 22.944400, null),
  ('Gdansk', 'Poland', 'PL', 'Europe/Warsaw', 'PLN', 54.352000, 18.646600, null),
  ('Poznan', 'Poland', 'PL', 'Europe/Warsaw', 'PLN', 52.406400, 16.925200, null),
  ('Wroclaw', 'Poland', 'PL', 'Europe/Warsaw', 'PLN', 51.107900, 17.038500, null),
  ('Cesky Krumlov', 'Czech Republic', 'CZ', 'Europe/Prague', 'CZK', 48.812700, 14.317500, null),
  ('Manchester', 'United Kingdom', 'GB', 'Europe/London', 'GBP', 53.480800, -2.242600, null),
  ('Liverpool', 'United Kingdom', 'GB', 'Europe/London', 'GBP', 53.408400, -2.991600, null),
  ('Bath', 'United Kingdom', 'GB', 'Europe/London', 'GBP', 51.381100, -2.359000, null),
  ('Oxford', 'United Kingdom', 'GB', 'Europe/London', 'GBP', 51.752000, -1.257700, null),
  ('Cambridge', 'United Kingdom', 'GB', 'Europe/London', 'GBP', 52.205300, 0.121800, null),
  ('Kyiv', 'Ukraine', 'UA', 'Europe/Kyiv', 'UAH', 50.450100, 30.523400, null),
  ('Tbilisi', 'Georgia', 'GE', 'Asia/Tbilisi', 'GEL', 41.715100, 44.827100, null),
  ('Yerevan', 'Armenia', 'AM', 'Asia/Yerevan', 'AMD', 40.179200, 44.499100, null),
  ('Baku', 'Azerbaijan', 'AZ', 'Asia/Baku', 'AZN', 40.409300, 49.867100, null),
  ('Bratislava', 'Slovakia', 'SK', 'Europe/Bratislava', 'EUR', 48.148600, 17.107700, null),
  ('Larnaca', 'Cyprus', 'CY', 'Asia/Nicosia', 'EUR', 34.918200, 33.629100, null),
  ('Luxembourg City', 'Luxembourg', 'LU', 'Europe/Luxembourg', 'EUR', 49.611600, 6.131900, null),
  ('Monaco', 'Monaco', 'MC', 'Europe/Monaco', 'EUR', 43.738400, 7.424600, null),
  ('Andorra la Vella', 'Andorra', 'AD', 'Europe/Andorra', 'EUR', 42.506300, 1.521800, null),

  ('Tel Aviv', 'Israel', 'IL', 'Asia/Jerusalem', 'NIS', 32.085300, 34.781800, null),
  ('Jerusalem', 'Israel', 'IL', 'Asia/Jerusalem', 'NIS', 31.768300, 35.213700, null),
  ('Eilat', 'Israel', 'IL', 'Asia/Jerusalem', 'NIS', 29.558100, 34.948200, null),
  ('Amman', 'Jordan', 'JO', 'Asia/Amman', 'JOD', 31.945400, 35.928400, null),
  ('Petra', 'Jordan', 'JO', 'Asia/Amman', 'JOD', 30.328500, 35.444400, null),
  ('Doha', 'Qatar', 'QA', 'Asia/Qatar', 'QAR', 25.285400, 51.531000, null),
  ('Abu Dhabi', 'United Arab Emirates', 'AE', 'Asia/Dubai', 'AED', 24.453900, 54.377300, null),
  ('Muscat', 'Oman', 'OM', 'Asia/Muscat', 'OMR', 23.585900, 58.405900, null),
  ('Manama', 'Bahrain', 'BH', 'Asia/Bahrain', 'BHD', 26.228500, 50.586000, null),
  ('Kuwait City', 'Kuwait', 'KW', 'Asia/Kuwait', 'KWD', 29.375900, 47.977400, null),
  ('Riyadh', 'Saudi Arabia', 'SA', 'Asia/Riyadh', 'SAR', 24.713600, 46.675300, null),
  ('Jeddah', 'Saudi Arabia', 'SA', 'Asia/Riyadh', 'SAR', 21.485800, 39.192500, null),
  ('Beirut', 'Lebanon', 'LB', 'Asia/Beirut', 'LBP', 33.893800, 35.501800, null),
  ('Cairo', 'Egypt', 'EG', 'Africa/Cairo', 'EGP', 30.044400, 31.235700, null),
  ('Luxor', 'Egypt', 'EG', 'Africa/Cairo', 'EGP', 25.687200, 32.639600, null),

  ('Marrakech', 'Morocco', 'MA', 'Africa/Casablanca', 'MAD', 31.629500, -7.981100, null),
  ('Casablanca', 'Morocco', 'MA', 'Africa/Casablanca', 'MAD', 33.573100, -7.589800, null),
  ('Fes', 'Morocco', 'MA', 'Africa/Casablanca', 'MAD', 34.018100, -5.007800, null),
  ('Tunis', 'Tunisia', 'TN', 'Africa/Tunis', 'TND', 36.806500, 10.181500, null),
  ('Cape Town', 'South Africa', 'ZA', 'Africa/Johannesburg', 'ZAR', -33.924900, 18.424100, null),
  ('Johannesburg', 'South Africa', 'ZA', 'Africa/Johannesburg', 'ZAR', -26.204100, 28.047300, null),
  ('Nairobi', 'Kenya', 'KE', 'Africa/Nairobi', 'KES', -1.292100, 36.821900, null),
  ('Zanzibar', 'Tanzania', 'TZ', 'Africa/Dar_es_Salaam', 'TZS', -6.165900, 39.202600, null),
  ('Victoria Falls', 'Zimbabwe', 'ZW', 'Africa/Harare', 'USD', -17.924300, 25.857200, null),

  ('Toronto', 'Canada', 'CA', 'America/Toronto', 'CAD', 43.653200, -79.383200, null),
  ('Vancouver', 'Canada', 'CA', 'America/Vancouver', 'CAD', 49.282700, -123.120700, null),
  ('Montreal', 'Canada', 'CA', 'America/Montreal', 'CAD', 45.501900, -73.567400, null),
  ('Quebec City', 'Canada', 'CA', 'America/Toronto', 'CAD', 46.813900, -71.208000, null),
  ('Mexico City', 'Mexico', 'MX', 'America/Mexico_City', 'MXN', 19.432600, -99.133200, null),
  ('Cancun', 'Mexico', 'MX', 'America/Cancun', 'MXN', 21.161900, -86.851500, null),
  ('Tulum', 'Mexico', 'MX', 'America/Cancun', 'MXN', 20.211400, -87.465400, null),
  ('Havana', 'Cuba', 'CU', 'America/Havana', 'CUP', 23.113600, -82.366600, null),
  ('San Juan', 'Puerto Rico', 'PR', 'America/Puerto_Rico', 'USD', 18.465500, -66.105700, null),
  ('Lima', 'Peru', 'PE', 'America/Lima', 'PEN', -12.046400, -77.042800, null),
  ('Cusco', 'Peru', 'PE', 'America/Lima', 'PEN', -13.531900, -71.967500, null),
  ('Bogota', 'Colombia', 'CO', 'America/Bogota', 'COP', 4.711000, -74.072100, null),
  ('Cartagena', 'Colombia', 'CO', 'America/Bogota', 'COP', 10.391000, -75.479400, null),
  ('Rio de Janeiro', 'Brazil', 'BR', 'America/Sao_Paulo', 'BRL', -22.906800, -43.172900, null),
  ('Sao Paulo', 'Brazil', 'BR', 'America/Sao_Paulo', 'BRL', -23.550500, -46.633300, null),
  ('Buenos Aires', 'Argentina', 'AR', 'America/Argentina/Buenos_Aires', 'ARS', -34.603700, -58.381600, null),
  ('Santiago', 'Chile', 'CL', 'America/Santiago', 'CLP', -33.448900, -70.669300, null),
  ('Quito', 'Ecuador', 'EC', 'America/Guayaquil', 'USD', -0.180700, -78.467800, null),

  ('Austin', 'United States', 'US', 'America/Chicago', 'USD', 30.267200, -97.743100, null),
  ('Denver', 'United States', 'US', 'America/Denver', 'USD', 39.739200, -104.990300, null),
  ('Portland', 'United States', 'US', 'America/Los_Angeles', 'USD', 45.515200, -122.678400, null),
  ('Philadelphia', 'United States', 'US', 'America/New_York', 'USD', 39.952600, -75.165200, null),
  ('Charleston', 'United States', 'US', 'America/New_York', 'USD', 32.776500, -79.931100, null),
  ('Savannah', 'United States', 'US', 'America/New_York', 'USD', 32.080900, -81.091200, null),
  ('Napa Valley', 'United States', 'US', 'America/Los_Angeles', 'USD', 38.502500, -122.265400, null),
  ('Palm Springs', 'United States', 'US', 'America/Los_Angeles', 'USD', 33.830300, -116.545300, null),

  ('Sydney', 'Australia', 'AU', 'Australia/Sydney', 'AUD', -33.868800, 151.209300, null),
  ('Melbourne', 'Australia', 'AU', 'Australia/Melbourne', 'AUD', -37.813600, 144.963100, null),
  ('Brisbane', 'Australia', 'AU', 'Australia/Brisbane', 'AUD', -27.469800, 153.025100, null),
  ('Auckland', 'New Zealand', 'NZ', 'Pacific/Auckland', 'NZD', -36.850900, 174.764500, null),
  ('Queenstown', 'New Zealand', 'NZ', 'Pacific/Auckland', 'NZD', -45.031200, 168.662600, null),
  ('Nadi', 'Fiji', 'FJ', 'Pacific/Fiji', 'FJD', -17.776500, 177.435600, null),

  ('Delhi', 'India', 'IN', 'Asia/Kolkata', 'INR', 28.704100, 77.102500, null),
  ('Mumbai', 'India', 'IN', 'Asia/Kolkata', 'INR', 19.076000, 72.877700, null),
  ('Jaipur', 'India', 'IN', 'Asia/Kolkata', 'INR', 26.912400, 75.787300, null),
  ('Agra', 'India', 'IN', 'Asia/Kolkata', 'INR', 27.176700, 78.008100, null),
  ('Goa', 'India', 'IN', 'Asia/Kolkata', 'INR', 15.299300, 74.124000, null),
  ('Kathmandu', 'Nepal', 'NP', 'Asia/Kathmandu', 'NPR', 27.717200, 85.324000, null),
  ('Male', 'Maldives', 'MV', 'Indian/Maldives', 'MVR', 4.175500, 73.509300, null),
  ('Colombo', 'Sri Lanka', 'LK', 'Asia/Colombo', 'LKR', 6.927100, 79.861200, null),
  ('Hanoi', 'Vietnam', 'VN', 'Asia/Ho_Chi_Minh', 'VND', 21.027800, 105.834200, null),
  ('Ho Chi Minh City', 'Vietnam', 'VN', 'Asia/Ho_Chi_Minh', 'VND', 10.823100, 106.629700, null),
  ('Siem Reap', 'Cambodia', 'KH', 'Asia/Phnom_Penh', 'KHR', 13.363300, 103.856400, null),
  ('Phnom Penh', 'Cambodia', 'KH', 'Asia/Phnom_Penh', 'KHR', 11.556400, 104.928200, null),
  ('Manila', 'Philippines', 'PH', 'Asia/Manila', 'PHP', 14.599500, 120.984200, null),
  ('Cebu', 'Philippines', 'PH', 'Asia/Manila', 'PHP', 10.315700, 123.885400, null),
  ('Kuala Lumpur', 'Malaysia', 'MY', 'Asia/Kuala_Lumpur', 'MYR', 3.139000, 101.686900, null),
  ('Langkawi', 'Malaysia', 'MY', 'Asia/Kuala_Lumpur', 'MYR', 6.350000, 99.800000, null),
  ('Taipei', 'Taiwan', 'TW', 'Asia/Taipei', 'TWD', 25.033000, 121.565400, null),
  ('Busan', 'South Korea', 'KR', 'Asia/Seoul', 'KRW', 35.179600, 129.075600, null),
  ('Jeju', 'South Korea', 'KR', 'Asia/Seoul', 'KRW', 33.499600, 126.531200, null);
