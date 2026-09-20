---
name: manifest-trip-planning
description: Create, read, and edit trips in Dror's Manifest travel-planning app via the Supabase connector. Use this whenever the conversation is planning a new trip, resuming/updating an existing one, or making a quick mid-trip change — writing itinerary items, lodging, flights, expenses, packing lists, etc. directly into Manifest's Postgres database.
---

# Manifest trip planning

Manifest is a personal travel-itinerary app (Expo/React Native + Supabase).
This skill lets you populate and edit trips directly in its database via
the Supabase connector, so research done in a chat session lands straight
in the app instead of needing to be re-typed there by hand.

Everything below was verified against the live schema, not assumed —
enums, triggers, and the write recipes were each run for real during
development. If the schema visibly disagrees with something here (a column
renamed, a new table), trust the live schema and treat this doc as stale
on that point.

## 0. Before writing anything: identify yourself

The Supabase connector for this project runs with elevated (service-role)
access, not as your own logged-in user — `auth.uid()` resolves to `NULL`
on a plain query. `trips` has a trigger, `trg_trips_force_owner`, that
**unconditionally overwrites** `user_id` with `auth.uid()` on every
insert — even if you explicitly supply a `user_id` value yourself, it gets
silently discarded and replaced with `NULL`, which then fails the
`NOT NULL` constraint. This is the only owner-enforcement trigger in the
schema (checked directly — no other table has one), but it blocks trip
creation entirely unless you impersonate the real user first.

Find the user id once (it doesn't change):

```sql
select id, email from auth.users where email = 'drorco9@gmail.com';
```

Then, **at the start of any session that will create a new trip**, set the
JWT claim so `auth.uid()` resolves correctly:

```sql
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<the-user-id-from-above>', 'role', 'authenticated')::text,
  true  -- local to this transaction/request only
);
```

Run this in the **same batched query** as the `insert into trips (...)`
that follows — the third argument (`true`) scopes it to the current
transaction, so it won't carry over to a separate tool call. It's harmless
to include even when you're only reading or editing an existing trip
(nothing else in the schema needs it), so the simplest habit is: include
it at the top of every write-heavy batch, not just trip creation.

## 1. Schema cheat sheet

Only the tables relevant to itinerary planning. Skip anything not listed
here — see §4.

**`trips`** — `id, user_id, name, start_date, end_date, type, destinations
(text[]), default_timezone, budget_amount, cover_photo_id, latitude,
longitude, custom_fields (jsonb), deleted_at`.
`type` enum: `business | pleasure | mixed` (a `mixed`/`business` trip
auto-seeds a "Work" row in `trip_parties`, see below).
Creating a trip auto-generates its `days` rows (see next) via a trigger —
**never insert into `days` yourself for the trip's real date range.**

**`days`** — one row per calendar date in `[start_date, end_date]`,
auto-generated. Columns: `id, trip_id, date, theme, color, city_id,
custom_city_name, sort_order`. **Every trip also gets exactly one extra
row with `date = null`, `theme = 'Proposals'`, `sort_order = 999999`** —
this is the "shortlist / not yet scheduled" bucket. An unscheduled item
(a candidate you haven't committed to a day yet) gets `day_id` pointing at
*that* row, with its own `start_date` left `null` — it is **not**
`day_id = null`. Find it with:
```sql
select id from days where trip_id = '<trip_id>' and date is null;
```

**`items`** — the core unit. Key columns: `id, trip_id, day_id, type,
title, start_date, end_date, time_start, time_end, timezone_start,
timezone_end, status, sort_order, address, phone, link,
google_maps_link, latitude, longitude, notes, confirmation_code,
booking_source, vendor, custom_fields (jsonb), is_stay_span,
parent_item_id, is_private, deleted_at`.

- `type` enum (verified live): `flight, transfer, transport, lodging,
  activity, meal, bar, sightseeing, attraction, shopping, work, other,
  cafe, bakery, ice_cream`.
- `status` enum: `booked | optional | planned`.
- **`start_date` must always match the date of the day `day_id` points
  to** (or be `null` for a Proposals item). The app does not derive one
  from the other — nothing enforces this at the DB level, and setting
  `day_id` without also setting `start_date` produces an item that's
  invisible to some app queries. (This was a real bug caught and fixed
  during a manual import this session.)
- `sort_order`: plain integer, gaps of **1000** between items on the same
  day (so `1000, 2000, 3000, ...`), lets a later insert slot in between
  without renumbering everything. When appending, use
  `max(sort_order) + 1000` for that `day_id`; when a day has no items yet,
  start at `1000`.
- Flights: put the flight number in `custom_fields->>'flight_number'`
  (e.g. `{"flight_number": "LY321"}`) — there's no dedicated column.
- Lodging is two row "roles" sharing `type = 'lodging'`: (a) the **stay
  span** itself — `is_stay_span = true`, `start_date`/`end_date` cover the
  whole stay, `day_id` left `null`; (b) ordinary **check-in/check-out
  day items** — `is_stay_span = false`, normal `day_id`/`sort_order`,
  `parent_item_id` pointing back at the span's `id`.
- `custom_fields.origin` is a free-text label the app's UI reads to show
  "Filled in by research" etc. on the item detail screen. Set it to
  `"research"` for anything you populated from your own web research —
  it's cosmetic but keeps items you add indistinguishable from ones the
  app's own research pipeline would have produced.

**`trip_cities`** — the trip's picked destinations:
`id, trip_id, city_id, custom_name, sort_order`. `sort_order = 0` (lowest)
is the trip's **primary** city, driving default cover photo/timezone/map
focus. Prefer linking a real `city_id` (see `cities`, a ~200-row reference
table — `select id from cities where name ilike '%paris%'`) over
`custom_name`; only use `custom_name` for a place genuinely not in that
table.

**`expenses`** — `id, trip_id, item_id, currency_code, amount,
expense_date, note, type, refund_amount, refund_company`. `type` enum:
`flight, lodging, transport, meals, shopping, other, attractions`.

**`allocations`** — belongs to one expense; `id, expense_id, amount,
party_id, shopping_list_item_id, note`. Every expense needs **at least
one** allocation row (the model has no "unsplit" state): a plain expense
gets one allocation for the full amount with `party_id = null` (meaning
"me, not owed by anyone"); a split gets one allocation per person, each
amount summing back to the expense total. This only represents "who owes
**the trip owner** back" — there's no payer field anywhere in the schema,
so it can't represent one companion paying another.

**`trip_parties`** — ad-hoc debtors for expense splitting (e.g. "Mom",
"Nadav"): `id, trip_id, name, is_work`. Not the same thing as a Doc
Tracker companion.

**`trip_currencies`** — `id, trip_id, code, rate_to_nis, is_default`. NIS
is always present at `rate_to_nis = 1`. Add a foreign currency the trip
will use before referencing its code from an expense.

**`packing_items`** — `id, trip_id, name, category, packed, sort_order`.
`category` is free text; the app's own UI sticks to `Clothing, Documents,
Electronics, Toiletries, Other` but doesn't enforce it.

## 2. Recipe: create a new trip skeleton

```sql
select set_config('request.jwt.claims',
  json_build_object('sub', '<user_id>', 'role', 'authenticated')::text, true);

insert into trips (name, start_date, end_date, type, destinations, default_timezone)
values ('Kyoto & Osaka', '2027-04-10', '2027-04-17', 'pleasure', array['Kyoto', 'Osaka'], 'Asia/Tokyo')
returning id;
-- days (including the Proposals day) are auto-generated — no further insert needed.
```

Then link real cities (optional but recommended — drives cover photo/map):

```sql
insert into trip_cities (trip_id, city_id, sort_order)
select '<trip_id>', id, 0 from cities where name = 'Kyoto' limit 1;
insert into trip_cities (trip_id, city_id, sort_order)
select '<trip_id>', id, 1 from cities where name = 'Osaka' limit 1;
```

## 3. Recipe: add itinerary items

Resolve the target day first:

```sql
select id, date from days where trip_id = '<trip_id>' order by date;
```

Then insert, keeping `start_date` in sync with the day and spacing
`sort_order` by 1000:

```sql
insert into items (trip_id, day_id, type, title, time_start, status, address, link, start_date, sort_order, custom_fields)
values (
  '<trip_id>', '<day_id>', 'meal', 'Dinner — Kikunoi',
  '19:00', 'planned', '459 Shimokawaracho, Kyoto', 'https://kikunoi.jp',
  '<day_date>', 1000,
  '{"origin": "research", "short_description": "..."}'::jsonb
);
```

A flight:

```sql
insert into items (trip_id, day_id, type, title, time_start, time_end, status, start_date, end_date, sort_order, custom_fields)
values (
  '<trip_id>', '<day_id>', 'flight', 'TLV -> NRT',
  '06:00', '22:30', 'booked', '<day_date>', '<day_date>', 1000,
  '{"flight_number": "LY84"}'::jsonb
);
```

Lodging (span + check-in/check-out):

```sql
insert into items (trip_id, type, title, is_stay_span, start_date, end_date, address, sort_order)
values ('<trip_id>', 'lodging', 'Hotel Granvia Kyoto', true, '2027-04-10', '2027-04-13', '...', 0)
returning id;  -- save as <span_id>

insert into items (trip_id, day_id, type, title, is_stay_span, parent_item_id, time_start, start_date, sort_order)
values ('<trip_id>', '<day1_id>', 'lodging', 'Check in — Hotel Granvia Kyoto', false, '<span_id>', '15:00', '2027-04-10', 2000);

insert into items (trip_id, day_id, type, title, is_stay_span, parent_item_id, time_start, start_date, sort_order)
values ('<trip_id>', '<day3_id>', 'lodging', 'Check out — Hotel Granvia Kyoto', false, '<span_id>', '11:00', '2027-04-13', 500);
```

An unscheduled candidate (Proposals):

```sql
insert into items (trip_id, day_id, type, title, status, address, sort_order)
select '<trip_id>', id, 'attraction', 'Fushimi Inari', 'optional', '...', 1000
from days where trip_id = '<trip_id>' and date is null;
```

## 4. Recipe: expenses, packing

```sql
-- a plain (unsplit) expense
with e as (
  insert into expenses (trip_id, currency_code, amount, expense_date, note, type)
  values ('<trip_id>', 'JPY', 45000, '2027-04-10', 'Hotel deposit', 'lodging')
  returning id
)
insert into allocations (expense_id, amount, party_id)
select id, 45000, null from e;

-- packing
insert into packing_items (trip_id, name, category, sort_order)
values ('<trip_id>', 'Portable wifi router', 'Electronics', 1000);
```

## 5. Recipe: resume/read an existing trip

Find it, then pull its full current state before making changes:

```sql
select id, name, start_date, end_date, type, destinations from trips
where deleted_at is null and name ilike '%kyoto%';

select id, date, theme, color from days where trip_id = '<trip_id>' order by date nulls last;

select i.id, i.day_id, d.date, i.type, i.title, i.time_start, i.status, i.is_stay_span, i.parent_item_id
from items i left join days d on d.id = i.day_id
where i.trip_id = '<trip_id>' and i.deleted_at is null
order by d.date nulls last, i.sort_order;

select c.name, c.country from trip_cities tc join cities c on c.id = tc.city_id
where tc.trip_id = '<trip_id>' order by tc.sort_order;

select e.*, a.amount, a.party_id from expenses e left join allocations a on a.expense_id = e.id
where e.trip_id = '<trip_id>';

select name, category, packed from packing_items where trip_id = '<trip_id>' order by sort_order;
```

Mid-trip, on-the-spot changes are the same recipes as §§2–4, just applied
to a `trip_id`/`day_id` you already have from this read step, rather than
ones you just created — nothing about editing is different from building.

## 6. What NOT to touch

These are owned by other subsystems with their own logic (research
pipelines, RLS patterns, push-notification cron jobs) that this skill
doesn't replicate — writing to them directly is likely to produce data
the app's own UI doesn't expect:

- `companions`, `companion_photos`, `travel_documents` — Doc Tracker,
  user-owned directly (`user_id = auth.uid()`), not trip-scoped.
- `entry_requirement_checks`, `entry_requirement_warnings`,
  `document_expiry_alerts` — computed by the app's own checks, not
  hand-entered.
- `flight_status`, `flight_status_log` — populated by a polling cron job.
- `item_research_jobs` — the app's own AI research pipeline's queue.
- `trip_shares`, `trip_share_links` — collaborator/public-link sharing,
  has its own token/RLS model.
- `settlement_payments` — fine to read, but only add a row here if you
  genuinely know a real payment was received; don't fabricate one.

## 7. Sanity checklist before finishing a session

- Every `items` row you inserted has `start_date` matching its `day_id`'s
  date (or both null, for Proposals).
- `sort_order` values don't collide within the same day.
- A lodging stay has exactly one `is_stay_span=true` span plus matching
  check-in/check-out rows pointing at it via `parent_item_id`.
- If you created a new trip, you ran the `set_config` impersonation step
  first — check `select user_id from trips where id = '<trip_id>'`
  actually shows the real user id, not null.
