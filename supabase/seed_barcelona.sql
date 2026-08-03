-- ============================================================
-- Seed: Barcelona & Cruise trip (05/08/2026 - 16/08/2026)
-- ============================================================
-- Run this AFTER schema.sql, once your Supabase project and your own
-- auth user both exist. Replace the v_user_id value below with your own
-- user UUID (Supabase dashboard -> Authentication -> Users -> copy the
-- UUID next to your email) before running.
-- ============================================================

do $$
declare
  v_user_id  uuid := '027c3ff2-90b0-4a4c-ab90-b96afebea27c';
  v_trip_id  uuid;
  v_airbnb   uuid;
  v_cruise   uuid;
  d05 uuid; d06 uuid; d07 uuid; d08 uuid; d09 uuid; d10 uuid;
  d11 uuid; d12 uuid; d13 uuid; d14 uuid; d15 uuid; d16 uuid;
begin
  -- ---------- Trip ----------
  insert into trips (user_id, name, start_date, end_date, type, destinations, default_timezone)
  values (
    v_user_id, 'Barcelona & Cruise', '2026-08-05', '2026-08-16', 'pleasure',
    array['Barcelona','Palma','Cinque Terre','Rome','Naples'], 'Europe/Madrid'
  )
  returning id into v_trip_id;

  -- NIS is always seeded; EUR added since most of this trip is in Europe.
  -- Rate is a placeholder — edit to the real rate when you use this for real.
  insert into trip_currencies (trip_id, code, rate_to_nis, is_default) values
    (v_trip_id, 'NIS', 1,    true),
    (v_trip_id, 'EUR', 4.05, false);

  -- The trigger on trips auto-generates one `days` row per date in range.
  select id into d05 from days where trip_id = v_trip_id and date = '2026-08-05';
  select id into d06 from days where trip_id = v_trip_id and date = '2026-08-06';
  select id into d07 from days where trip_id = v_trip_id and date = '2026-08-07';
  select id into d08 from days where trip_id = v_trip_id and date = '2026-08-08';
  select id into d09 from days where trip_id = v_trip_id and date = '2026-08-09';
  select id into d10 from days where trip_id = v_trip_id and date = '2026-08-10';
  select id into d11 from days where trip_id = v_trip_id and date = '2026-08-11';
  select id into d12 from days where trip_id = v_trip_id and date = '2026-08-12';
  select id into d13 from days where trip_id = v_trip_id and date = '2026-08-13';
  select id into d14 from days where trip_id = v_trip_id and date = '2026-08-14';
  select id into d15 from days where trip_id = v_trip_id and date = '2026-08-15';
  select id into d16 from days where trip_id = v_trip_id and date = '2026-08-16';

  update days set theme = 'Flight in + Barcelona' where id = d05;
  update days set theme = 'Barcelona'              where id = d06;
  update days set theme = 'Barcelona'               where id = d07;
  update days set theme = 'Barcelona'               where id = d08;
  update days set theme = 'Cruise embarkation'       where id = d09;
  update days set theme = 'Palma'                    where id = d10;
  update days set theme = 'At sea'                   where id = d11;
  update days set theme = 'Florence/Pisa (tender)'    where id = d12;
  update days set theme = 'Rome'                      where id = d13;
  update days set theme = 'Naples'                    where id = d14;
  update days set theme = 'At sea'                    where id = d15;
  update days set theme = 'Barcelona + flight home'    where id = d16;

  -- ---------- Lodging spans ----------
  insert into items (trip_id, type, title, is_stay_span, start_date, end_date, time_start, time_end, address, sort_order)
  values (v_trip_id, 'lodging', 'Airbnb - Carrer de la Unio 23', true, '2026-08-05', '2026-08-09', '11:00', '12:30', 'Carrer de la Unio 23, Barcelona', 0)
  returning id into v_airbnb;

  insert into items (trip_id, type, title, is_stay_span, start_date, end_date, time_start, sort_order)
  values (v_trip_id, 'lodging', 'Legend of the Seas (Cruise)', true, '2026-08-09', '2026-08-16', '13:00', 0)
  returning id into v_cruise;

  insert into items (trip_id, day_id, parent_item_id, type, title, time_start, status, sort_order) values
    (v_trip_id, d05, v_airbnb, 'lodging', 'Check in - Airbnb', '11:00', 'booked', 250),
    (v_trip_id, d09, v_airbnb, 'lodging', 'Check out - Airbnb', '12:30', 'booked', 200),
    (v_trip_id, d09, v_cruise, 'lodging', 'Check in - Legend of the Seas', '13:00', 'booked', 250),
    (v_trip_id, d16, v_cruise, 'lodging', 'Check out - Legend of the Seas', null, 'booked', 100);

  -- ---------- 05/08 Wed - Flight in + Barcelona ----------
  insert into items (trip_id, day_id, type, title, time_start, time_end, vendor, confirmation_code, address, phone, booking_source, status, notes, sort_order) values
  (v_trip_id, d05, 'flight',      'TLV to BCN',                     '05:25', '09:25', 'LY393', 'XWKTMD', null, null, null, 'booked', null, 100),
  (v_trip_id, d05, 'transfer',    'Transfeero to apartment',        null,    null,    'Transfeero', '78580592', null, null, null, 'booked', null, 200),
  (v_trip_id, d05, 'meal',        'Dunkin Donuts',                  null,    null,    null, null, null, null, null, 'booked', null, 300),
  (v_trip_id, d05, 'sightseeing', 'Big Fun Museum',                 null,    null,    null, null, null, null, null, 'booked', null, 400),
  (v_trip_id, d05, 'meal',        'Lunch - Macchina (Italian)',     null,    null,    null, null, null, null, null, 'booked', null, 500),
  (v_trip_id, d05, 'sightseeing', 'La Boqueria / Rambla',           null,    null,    null, null, null, null, null, 'booked', null, 600),
  (v_trip_id, d05, 'activity',    'Tuk Tuk Tour',                  '16:00', '18:00', 'Hola TukTuk', null, 'Carrer d''Arago 414, Eixample', null, 'GetYourGuide', 'booked', null, 700),
  (v_trip_id, d05, 'meal',        'Dinner - Xiringuito Scribe',     '20:00', null,    null, null, null, null, null, 'booked', null, 800);

  -- ---------- 06/08 Thu - Barcelona ----------
  insert into items (trip_id, day_id, type, title, time_start, time_end, vendor, confirmation_code, address, phone, booking_source, status, notes, sort_order) values
  (v_trip_id, d06, 'transfer',    'Pick up rental car - EuropCar Sants', '08:00', null, 'EuropCar Sants', null, null, null, 'Expedia', 'booked', null, 100),
  (v_trip_id, d06, 'sightseeing', 'PortAventura',                        null,    null, null, null, null, null, null, 'booked', '1 hour drive, opens at 10:30, fast pass x10pp', 200),
  (v_trip_id, d06, 'other',       'Parking reserved - BSM La Boqueria',  null,    null, null, null, null, null, null, 'booked', null, 300);

  -- ---------- 07/08 Fri - Barcelona (Montserrat day) ----------
  insert into items (trip_id, day_id, type, title, time_start, time_end, vendor, confirmation_code, address, phone, booking_source, status, notes, sort_order) values
  (v_trip_id, d07, 'transport', 'Travel to Montserrat',                '08:00', null, null, null, null, null, null, 'booked', 'Try to arrive early', 100),
  (v_trip_id, d07, 'transport', 'Cremallera rack railway - rail + funicular', null, null, null, null, null, null, null, 'booked', null, 200),
  (v_trip_id, d07, 'meal',      'Lunch at Masia Vinyanova',            '13:00', null, null, null, null, '+34937448604', null, 'booked', null, 300),
  (v_trip_id, d07, 'activity',  'Winery - Oller del Mas',              '14:30', null, null, null, null, null, null, 'optional', null, 400),
  (v_trip_id, d07, 'shopping',  'La Roca Village outlets',             '16:00', null, null, null, null, null, null, 'booked', null, 500),
  (v_trip_id, d07, 'transfer',  'Return rental car - EuropCar Sants',  null,    null, 'EuropCar Sants', null, null, null, null, 'booked', 'By 22:00', 600);

  -- ---------- 08/08 Sat - Barcelona ----------
  insert into items (trip_id, day_id, type, title, time_start, time_end, vendor, confirmation_code, address, phone, booking_source, status, notes, sort_order) values
  (v_trip_id, d08, 'meal',        'Breakfast - Granja Viader',       '09:00', null, null, null, null, null, null, 'booked', null, 100),
  (v_trip_id, d08, 'sightseeing', 'Science Museum',                  '10:00', null, null, null, null, null, null, 'booked', null, 200),
  (v_trip_id, d08, 'sightseeing', 'Sagrada Familia',                 '12:30', null, null, null, null, null, 'GetYourGuide', 'booked', null, 300),
  (v_trip_id, d08, 'meal',        'Lunch - Circolo Popolaire',       '14:30', null, null, null, null, null, null, 'booked', null, 400),
  (v_trip_id, d08, 'sightseeing', 'Gracia + Rambla',                 null,    null, null, null, null, null, null, 'booked', null, 500),
  (v_trip_id, d08, 'meal',        'Dinner - National Burger',        null,    null, null, null, null, null, null, 'booked', null, 600);

  -- ---------- 09/08 Sun - Cruise embarkation ----------
  insert into items (trip_id, day_id, type, title, time_start, time_end, vendor, confirmation_code, address, phone, booking_source, status, notes, sort_order) values
  (v_trip_id, d09, 'meal',     'Breakfast at Hoffman/Colmena',   '09:00', null,    null, null, null, null, null, 'booked', null, 100),
  (v_trip_id, d09, 'activity', 'Orsom Catamaran',                '10:30', null,    null, null, null, null, null, 'booked', '1.5 hours', 150),
  (v_trip_id, d09, 'bar',      'Shockwave',                      '22:45', null,    null, null, null, null, null, 'booked', null, 1400);

  -- ---------- 10/08 Mon - Palma ----------
  insert into items (trip_id, day_id, type, title, time_start, time_end, vendor, confirmation_code, address, phone, booking_source, status, notes, sort_order) values
  (v_trip_id, d10, 'other',       'Get off the cruise',              '08:30', null,    null, null, null, null, null, 'booked', null, 100),
  (v_trip_id, d10, 'sightseeing', 'Coves of Drach tour',             '09:30', null,    null, null, null, null, 'GetYourGuide', 'booked', 'Pickup at Poppa Club', 200),
  (v_trip_id, d10, 'transport',   'Return to Palma',                 '14:30', null,    null, null, null, null, null, 'booked', null, 300),
  (v_trip_id, d10, 'meal',        'Late lunch at Maura',             '15:00', null,    null, null, null, null, null, 'booked', null, 400),
  (v_trip_id, d10, 'sightseeing', 'Walk around town center',         '16:00', '17:00', null, null, null, null, null, 'booked', 'Cathedral, Placa Major', 500),
  (v_trip_id, d10, 'transport',   'Back to cruise',                  '17:30', null,    null, null, null, null, null, 'booked', null, 600);

  -- ---------- 11/08 Tue - At sea ----------
  insert into items (trip_id, day_id, type, title, time_start, time_end, vendor, confirmation_code, address, phone, booking_source, status, notes, sort_order) values
  (v_trip_id, d11, 'meal', 'Izumi',   '19:30', null, null, null, null, null, null, 'booked', null, 100),
  (v_trip_id, d11, 'bar',  'Fusion',  '22:30', null, null, null, null, null, null, 'booked', null, 200);

  -- ---------- 12/08 Wed - Florence/Pisa (tender) - Cinque Terre ----------
  insert into items (trip_id, day_id, type, title, time_start, time_end, vendor, confirmation_code, address, phone, booking_source, status, notes, sort_order) values
  (v_trip_id, d12, 'transport', 'La Spezia tender to Centrale Train Station', null, null, null, null, null, null, null, 'booked', 'Cinque Terre day', 100),
  (v_trip_id, d12, 'transport', 'Train to Riomaggiore',                       null, null, null, null, null, null, null, 'booked', null, 200),
  (v_trip_id, d12, 'transport', 'Train to Manarola (lunch)',                  null, null, null, null, null, null, null, 'booked', null, 300),
  (v_trip_id, d12, 'transport', 'Train to Monterosso (beach + gelato)',       null, null, null, null, null, null, null, 'booked', null, 400),
  (v_trip_id, d12, 'transport', 'Train back to La Spezia',                    null, null, null, null, null, null, null, 'booked', null, 500),
  (v_trip_id, d12, 'transport', 'Tender back to cruise',                      null, null, null, null, null, null, null, 'booked', null, 600);

  -- ---------- 13/08 Thu - Rome ----------
  insert into items (trip_id, day_id, type, title, time_start, time_end, vendor, confirmation_code, address, phone, booking_source, status, notes, sort_order) values
  (v_trip_id, d13, 'transfer',    'Civitavecchia pickup',              '08:30', null, null, null, null, null, null, 'booked', null, 100),
  (v_trip_id, d13, 'transfer',    'Drop at Hotel de Russie',            '09:30', null, null, null, 'Hotel de Russie, Rome', null, null, 'booked', null, 200),
  (v_trip_id, d13, 'sightseeing', 'Piazza del Popolo',                  null,    null, null, null, null, null, null, 'booked', null, 300),
  (v_trip_id, d13, 'sightseeing', 'Via del Corso',                      null,    null, null, null, null, null, null, 'booked', null, 400),
  (v_trip_id, d13, 'sightseeing', 'Spanish Steps',                      null,    null, null, null, null, null, null, 'booked', null, 500),
  (v_trip_id, d13, 'sightseeing', 'Trevi Fountain',                     null,    null, null, null, null, null, null, 'booked', null, 600),
  (v_trip_id, d13, 'sightseeing', 'Pantheon',                           null,    null, null, null, null, null, null, 'booked', null, 700),
  (v_trip_id, d13, 'meal',        'Lunch at Osteria da Fortunata',      '13:00', null, null, null, 'Cancelleria', null, null, 'booked', null, 800),
  (v_trip_id, d13, 'shopping',    'Campo di Fiori - Norcineria Viola',  null,    null, null, null, null, null, null, 'booked', null, 900),
  (v_trip_id, d13, 'sightseeing', 'Piazza Navona',                      null,    null, null, null, null, null, null, 'booked', null, 1000),
  (v_trip_id, d13, 'meal',        'Gelato at Frigidarium',              null,    null, null, null, null, null, null, 'booked', null, 1100),
  (v_trip_id, d13, 'sightseeing', 'Castel Sant''Angelo',                null,    null, null, null, null, null, null, 'booked', null, 1200),
  (v_trip_id, d13, 'transfer',    'Pickup at Hotel de Russie',          '17:00', null, null, null, 'Hotel de Russie, Rome', null, null, 'booked', null, 1300),
  (v_trip_id, d13, 'transfer',    'Drop at cruise port',                '18:00', null, null, null, null, null, null, 'booked', null, 1400);

  -- ---------- 14/08 Fri - Naples ----------
  insert into items (trip_id, day_id, type, title, time_start, time_end, vendor, confirmation_code, address, phone, booking_source, status, notes, sort_order) values
  (v_trip_id, d14, 'sightseeing', 'Guided tour to Pompeii',             '09:15', null, null, null, null, null, 'GetYourGuide', 'booked', 'Pickup at Starhotels Terminus', 100),
  (v_trip_id, d14, 'transport',   'Back to Naples',                     '12:15', null, null, null, null, null, null, 'booked', null, 200),
  (v_trip_id, d14, 'meal',        'Sfogliatelle Attanasio',             null,    null, null, null, null, null, null, 'booked', null, 300),
  (v_trip_id, d14, 'sightseeing', 'SpaccaNapoli / Via dei Tribunali',   null,    null, null, null, null, null, null, 'booked', null, 400),
  (v_trip_id, d14, 'meal',        'Lunch - Pizza at Sorbillo / Di Matteo + fried pizza', null, null, null, null, null, null, null, 'booked', null, 500),
  (v_trip_id, d14, 'shopping',    'Presepe Napoli market',              null,    null, null, null, null, null, null, 'booked', null, 600),
  (v_trip_id, d14, 'meal',        'Gelato at Scaturchio / Maradona wall', null,  null, null, null, null, null, null, 'booked', null, 700),
  (v_trip_id, d14, 'transport',   'Back to cruise port',                '18:00', null, null, null, null, null, null, 'booked', null, 800);

  -- ---------- 15/08 Sat - At sea ----------
  insert into items (trip_id, day_id, type, title, time_start, time_end, vendor, confirmation_code, address, phone, booking_source, status, notes, sort_order) values
  (v_trip_id, d15, 'activity', 'Escape room',                        '11:00', null, null, null, null, null, null, 'booked', null, 100),
  (v_trip_id, d15, 'activity', 'Charlie and the Chocolate Factory',  '20:30', null, null, null, null, null, null, 'booked', null, 200);

  -- ---------- 16/08 Sun - Barcelona + flight home ----------
  insert into items (trip_id, day_id, type, title, time_start, time_end, vendor, confirmation_code, address, phone, booking_source, status, notes, sort_order) values
  (v_trip_id, d16, 'other',       'Locker near Placa Catalunya', null,    null, null, null, null, null, null, 'pending', 'Need to book', 200),
  (v_trip_id, d16, 'sightseeing', 'Bunkers of Carmel or Montjuic', null,  null, null, null, null, null, null, 'idea',    null, 300),
  (v_trip_id, d16, 'flight',      'BCN to TLV',                  '22:35', '03:40', 'LY392', 'XWKTMD', null, null, null, 'booked', 'Lands 03:40 (next day)', 400);

end $$;
