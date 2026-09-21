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

## 0. Before writing anything: identify yourself — and verify, don't assume

The Supabase connector for this project does **not** run as the app's real
owner — `auth.uid()` resolves to either `NULL` or, worse, a *different
real account* (this has actually happened: a trip once landed under a
"claude test" account instead of the owner's). `trips` has a trigger,
`trg_trips_force_owner`, that **unconditionally overwrites** `user_id`
with `auth.uid()` on every insert — even if you explicitly supply a
`user_id` value yourself, it gets silently discarded. This is the only
owner-enforcement trigger in the schema (checked directly — no other table
has one), but it means every trip you create lands under whoever
`auth.uid()` says you are, unless you correct it.

**The app's real login email is not necessarily the same email you know
the user by elsewhere** (their general Claude account, an alias, etc.) —
guessing this wrong is exactly what caused the earlier misfire. Don't
hardcode an email you haven't verified against this project's own data.
Confirm it first:

```sql
-- Whoever owns the most/oldest real trips is almost certainly the
-- app's actual owner in a single-family app like this one.
select u.email, u.id, count(t.id) as trip_count, min(t.created_at) as first_trip
from auth.users u join trips t on t.user_id = u.id
where t.deleted_at is null
group by u.email, u.id
order by trip_count desc;
```

If that's ambiguous, ask the user directly which email they log into
Manifest with rather than guessing — a wrong guess here doesn't error out,
it silently creates real data under the wrong account.

Known as of 2026-09-21: the real owner is `seraphnic@hotmail.com`, id
`027c3ff2-90b0-4a4c-ab90-b96afebea27c`. Treat this as a fast-path, not
gospel — re-run the query above if it's been a while or anything looks
off, since this is exactly the kind of fact that goes stale silently.

Once confirmed, use **one single atomic SQL statement** for the trip
insert, with the impersonation embedded directly in it — not a separate
statement beforehand. A separate preceding statement only works if it
lands in the exact same transaction as the insert, which depends on
connector-internal batching you can't verify from here; embedding it
removes that uncertainty entirely:

```sql
insert into trips (name, start_date, end_date, type, destinations, default_timezone)
select 'Kyoto & Osaka', '2027-04-10', '2027-04-17', 'pleasure', array['Kyoto','Osaka'], 'Asia/Tokyo'
where set_config('request.jwt.claims',
  json_build_object('sub', '<verified-user-id>', 'role', 'authenticated')::text, true) is not null
returning id, user_id;
```

**Always check the returned `user_id` matches the verified id before
doing anything else with that trip** — this is the one step that would
have caught the earlier mistake immediately instead of after the fact.
No other table in the schema needs this trick (nothing else has an
owner-enforcement trigger — everything else is reached through `trip_id`,
which the connector's elevated access can read/write regardless of
identity), so it's only relevant to the trip-creation statement itself.

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

`cover_photo_id` and `default_timezone` are **not** set automatically by
any trigger — the app's own "New Trip" screen sets them client-side from
the primary (`sort_order = 0`) `trip_cities` row the moment it's picked
(`cover_photo_id` <- `cities.cover_photo_id`, `default_timezone` <-
`cities.timezone`). A bare `insert into trips` with no follow-up leaves
both null/default, unlike a trip made in the app. See §2 for the
follow-up update.

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
will use before referencing its code from an expense. **The app always
looks up a real live rate at creation time** (Frankfurter/ECB, free and
keyless — see §2) rather than defaulting to `1`; do the same instead of
inserting a placeholder rate.

**`packing_items`** — `id, trip_id, name, category, packed, sort_order`.
`category` is free text; the app's own UI sticks to `Clothing, Documents,
Electronics, Toiletries, Other` but doesn't enforce it.

## 2. Recipe: create a new trip skeleton

Using the verified user id from §0, in one statement:

```sql
insert into trips (name, start_date, end_date, type, destinations, default_timezone)
select 'Kyoto & Osaka', '2027-04-10', '2027-04-17', 'pleasure', array['Kyoto', 'Osaka'], 'Asia/Tokyo'
where set_config('request.jwt.claims',
  json_build_object('sub', '<verified-user-id>', 'role', 'authenticated')::text, true) is not null
returning id, user_id;
-- Confirm user_id in the result matches the verified id from §0 before continuing.
-- Days (including the Proposals day) are auto-generated — no further insert needed.
```

Then link real cities (optional but recommended — drives cover photo/map).
The **first** row (`sort_order = 0`) is the primary city:

```sql
insert into trip_cities (trip_id, city_id, sort_order)
select '<trip_id>', id, 0 from cities where name = 'Kyoto' limit 1;
insert into trip_cities (trip_id, city_id, sort_order)
select '<trip_id>', id, 1 from cities where name = 'Osaka' limit 1;
```

**Then do the three things the app's own "New Trip" screen does that the
trigger does NOT do for you** — skipping these leaves a trip that looks
noticeably unfinished next to one made in the app (no cover photo, wrong
timezone, expenses in a foreign currency with no real conversion rate):

**a) Cover photo + timezone, from the primary city:**

```sql
update trips t set
  cover_photo_id = c.cover_photo_id,
  default_timezone = c.timezone
from trip_cities tc join cities c on c.id = tc.city_id
where tc.trip_id = t.id and tc.trip_id = '<trip_id>' and tc.sort_order = 0;
```

If the primary destination isn't in the `cities` table (a `custom_name`
row), there's no catalog photo/timezone to pull — leave `cover_photo_id`
null and set `default_timezone` by hand (ask the user, or infer from the
destination) instead of leaving it on the trip-insert default.

**b) Currencies, with a real live rate — not a placeholder `1`.** NIS is
always the default row. The app pulls the currency list from **every**
city on the trip, not just the primary one (a Kyoto+Osaka trip is all
JPY so it won't show, but a multi-country trip like Paris+Rome needs
both EUR entries deduped into one, and Paris+Bangkok needs EUR *and*
THB) — get the distinct set first:

```sql
select distinct c.currency_code
from trip_cities tc join cities c on c.id = tc.city_id
where tc.trip_id = '<trip_id>' and c.currency_code != 'NIS';
```

For each code that comes back, look up today's actual rate before
inserting — the app does this via Frankfurter (ECB reference rates, free,
no key): `GET https://api.frankfurter.app/latest?from=<CODE>&to=ILS`,
reading `.rates.ILS`. Use WebFetch (or curl if you have shell access) to
hit it for real at trip-creation time — never hardcode a remembered rate,
it goes stale immediately:

```sql
insert into trip_currencies (trip_id, code, rate_to_nis, is_default)
values ('<trip_id>', 'NIS', 1, true);

-- one row per distinct foreign currency from the query above, after
-- fetching each one's real rate:
insert into trip_currencies (trip_id, code, rate_to_nis, is_default)
values ('<trip_id>', 'JPY', <fetched_rate_ils_per_jpy>, false);
```

A `custom_name` destination (no `cities` row) contributes no currency
automatically — ask the user or infer it and add it by hand if the trip
needs it.

If the live lookup fails (network error, unsupported code), fall back to
`1` the same way the app's own currency-sync does on a failed fetch, but
say so — don't silently present a failed lookup as a real rate.

**c) Skim `trip_parties`, `packing_items`, companions if relevant to the
conversation** — the app also auto-adds a "Work" party for a
`business`/`mixed` trip and can pre-fill packing from a template/other
trip on creation (see §1/§4); replicate whichever of those the user
actually asked for, rather than all of them by default.

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
- If you created a new trip, you verified the owner against real existing
  trips (§0) rather than assuming an email, used the single-statement
  impersonation pattern, and confirmed the `returning user_id` actually
  matched — not just that it was non-null. A wrong-but-valid account is
  a silent failure this checklist exists specifically to catch.
- If you created a new trip with a real (non-custom) primary city, you
  ran the §2(a) update so `cover_photo_id`/`default_timezone` aren't
  left null/default, and you added `trip_currencies` rows with real
  looked-up rates (§2(b)) rather than placeholder `1`s for every
  non-NIS currency the trip will actually use.
