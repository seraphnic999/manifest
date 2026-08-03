-- ============================================================
-- Travel Companion App — Supabase/Postgres Schema
-- ============================================================
-- Model: Trip -> Days -> Items (+sub-items, +alternatives)
--        Trip -> Currencies, Parties
--        Item -> Expenses -> Allocations (-> ShoppingListItem, -> Party)
--        Trip -> ShoppingListItems (optionally linked to an Item)
-- ============================================================

-- ---------- Enums ----------

create type trip_type as enum ('business', 'pleasure', 'mixed');

create type item_type as enum (
  'flight', 'transfer', 'transport', 'lodging', 'activity',
  'meal', 'bar', 'sightseeing', 'shopping', 'work', 'other'
);
-- 'transfer'  = pre-booked private transfer (taxi, Transfeero-style car)
-- 'transport' = public transport instructions/legs (train, bus, shuttle)

create type item_status as enum ('booked', 'optional', 'idea', 'pending');

-- ---------- Trips ----------

create table trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  type trip_type not null default 'pleasure',
  destinations text[] default '{}',
  default_timezone text not null default 'Asia/Jerusalem', -- IANA tz name; new items inherit this
  custom_fields jsonb not null default '{}',  -- freeform extension point, no migration needed later
  deleted_at timestamptz,            -- soft delete / archive; null = active. Permanent removal is
                                      -- a separate, explicit hard-delete action from the archive view.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_dates_valid check (end_date >= start_date)
);

create index idx_trips_user on trips(user_id);
create index idx_trips_active on trips(user_id) where deleted_at is null;  -- fast default "active trips" filter

-- Computed trip status (future/current/past) is derived from dates at query
-- time rather than stored, e.g.:
--   case
--     when current_date < start_date then 'future'
--     when current_date > end_date then 'past'
--     else 'current'
--   end

-- ---------- Currencies (per trip) ----------

create table trip_currencies (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  code text not null,               -- e.g. 'NIS', 'EUR', 'USD'
  rate_to_nis numeric(12,6) not null default 1,  -- manual conversion rate
  is_default boolean not null default false,      -- true for NIS row
  created_at timestamptz not null default now(),
  unique (trip_id, code)
);

create index idx_trip_currencies_trip on trip_currencies(trip_id);

-- ---------- Parties (who can owe money: Mom, Work, etc.) ----------

create table trip_parties (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,                -- 'Work', 'Mom', etc.
  is_work boolean not null default false,  -- auto-added for business/mixed trips
  created_at timestamptz not null default now(),
  unique (trip_id, name)
);

create index idx_trip_parties_trip on trip_parties(trip_id);

-- ---------- Days ----------

create table days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  date date not null,
  theme text,                        -- 'At sea', 'Working 1/2 day', etc.
  sort_order int not null,           -- explicit order, independent of date gaps
  created_at timestamptz not null default now(),
  unique (trip_id, date)
);

create index idx_days_trip on days(trip_id);

-- ---------- Items ----------

create table items (
  id uuid primary key default gen_random_uuid(),
  day_id uuid references days(id) on delete cascade,   -- nullable: trip-level items (rare)
  trip_id uuid not null references trips(id) on delete cascade,
  parent_item_id uuid references items(id) on delete cascade, -- for multi-leg sub-steps
  alt_group_id uuid,                 -- shared id groups "pick one of" alternatives
  type item_type not null default 'other',
  title text not null,
  start_date date,                   -- for multi-day items (lodging check-in, etc.)
  end_date date,                     -- for multi-day items (lodging check-out, etc.)
  time_start time,                   -- check-in time / departure time / start time
  time_end time,                     -- check-out time / arrival time / end time
  timezone_start text,               -- IANA tz name; null = inherit trip.default_timezone
  timezone_end text,                 -- IANA tz name; null = inherit trip.default_timezone
                                      -- (kept separate so a flight can depart in one zone
                                      -- and land in another, e.g. TLV -> OTP)
  custom_fields jsonb not null default '{}', -- freeform extension point, no migration needed later
  status item_status not null default 'booked',
  is_stay_span boolean not null default false, -- true only for the multi-day lodging "stay" item itself;
                                                -- check-in/check-out are separate ordinary items
                                                -- (parent_item_id -> this item) with their own time/sort_order
  notes text,                        -- long freeform text / directions
  confirmation_code text,
  booking_source text,               -- how it was booked: 'Direct', 'Expedia', 'GetYourGuide', etc.
                                      -- (free text w/ a suggested-values list in the app, not a DB enum,
                                      -- so new sources don't need a migration)
  address text,
  phone text,
  vendor text,
  link text,
  sort_order int not null,
  deleted_at timestamptz,            -- soft delete / archive; null = active. App filters this by
                                      -- default everywhere; permanent removal is a separate,
                                      -- explicit hard-delete action from the archive view.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_items_day on items(day_id);
create index idx_items_trip on items(trip_id);
create index idx_items_parent on items(parent_item_id);
create index idx_items_type on items(trip_id, type);   -- powers "all flights" / "all hotels" views
create index idx_items_alt_group on items(alt_group_id);
create index idx_items_date_range on items(start_date, end_date);
create index idx_items_active on items(trip_id) where deleted_at is null;  -- fast default "active items" filter

-- ---------- Item photos ----------

create table item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  storage_path text not null,        -- path in Supabase Storage
  caption text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_item_photos_item on item_photos(item_id);

-- ---------- Shopping list ----------

create table shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  item_id uuid references items(id) on delete set null,  -- optional link to an activity (duty free, mall...)
  name text not null,
  quantity int not null default 1,
  note text,
  created_at timestamptz not null default now()
  -- "bought" state is derived from whether an allocation links to this row
);

create index idx_shopping_trip on shopping_list_items(trip_id);
create index idx_shopping_item on shopping_list_items(item_id);

-- ---------- Expenses ----------

create table expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  item_id uuid references items(id) on delete set null,  -- optional link to the related item
  currency_code text not null,       -- references trip_currencies.code (see check below)
  amount numeric(12,2) not null,
  expense_date date,
  note text,
  created_at timestamptz not null default now()
);

create index idx_expenses_trip on expenses(trip_id);
create index idx_expenses_item on expenses(item_id);

-- ---------- Allocations (splits of a single expense) ----------

create table allocations (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  amount numeric(12,2) not null,     -- in the expense's currency; sum should equal expense.amount
  shopping_list_item_id uuid references shopping_list_items(id) on delete set null,
  party_id uuid references trip_parties(id) on delete set null,  -- null = self / not owed
  created_at timestamptz not null default now(),
  constraint allocation_amount_positive check (amount > 0)
);

create index idx_allocations_expense on allocations(expense_id);
create index idx_allocations_shopping_item on allocations(shopping_list_item_id);
create index idx_allocations_party on allocations(party_id);

-- ============================================================
-- Notes on app-level logic (not enforced in SQL):
--
-- 1. Default allocation: when an expense is created without an explicit
--    split, the app creates exactly one allocation with the full amount,
--    no shopping_list_item_id, no party_id — this is the "generic" case.
--
-- 2. "Work" party auto-seeded when a trip's type is 'business' or 'mixed'
--    (insert into trip_parties with is_work = true, name = 'Work').
--
-- 3. NIS row auto-seeded into trip_currencies for every trip
--    (code = 'NIS', rate_to_nis = 1, is_default = true).
--
-- 4. NIS-equivalent amounts are computed at query time:
--      expense.amount * trip_currencies.rate_to_nis
--    rather than stored, so correcting a rate recalculates everything.
--
-- 5. "Owed by <party>" report: group allocations by party_id, sum amount
--    (converted to NIS via the parent expense's currency/rate), across
--    the whole trip.
--
-- 6. Alternatives ("Caru'cu Bere / Hanu'lui Manuc"): items sharing the
--    same alt_group_id are presented as a "pick one" cluster in the UI;
--    only one is expected to end up 'booked'.
--
-- 7. Recommended RLS: enable row-level security on all tables, policy
--    "user_id = auth.uid()" on trips, and cascade the check via trip_id
--    joins on all child tables.
--
-- 8. Multi-day items (lodging, and optionally rental cars/other spans):
--    day_id is the anchor day (e.g. check-in day), but the day view for
--    a given date should query:
--      where start_date = :day_date  -> show as "check-in" / "start"
--         or end_date   = :day_date  -> show as "check-out" / "end"
--    Same-day lodging swaps (checkout Hotel A, checkin Hotel B) are just
--    two separate lodging items whose ranges both touch that date —
--    no special-casing needed.
--
-- 9. Lodging specifically splits into two kinds of rows:
--    a) the STAY item itself: type='lodging', is_stay_span=true,
--       start_date/end_date set, no meaningful time/sort_order — shown
--       at a fixed banner position on every day it spans (not mixed
--       into the ordered timeline).
--    b) CHECK-IN / CHECK-OUT events: ordinary items (their own time,
--       status, notes) with parent_item_id pointing at the stay item —
--       these DO sit in the normal ordered day timeline like any other
--       item, so the user can slot "check-in at 15:00" between lunch
--       and a walk, for instance.
--
-- 10. Itinerary (day view) shows only core fields per item: time, title,
--     type, status. Everything else — booking_source, vendor, link,
--     confirmation_code, address, phone, notes, sub-steps, alternatives,
--     linked expenses — lives on a dedicated item details page/screen,
--     reached by tapping the item, to keep the day view uncluttered.
--
-- 11. Custom fields: trips.custom_fields and items.custom_fields are
--     open jsonb bags for anything niche you start tracking later
--     (loyalty numbers, seat assignments, whatever comes up) without a
--     schema migration. Anything that turns out to matter a lot can
--     graduate into a real column afterwards.
--
-- 12. Timezones: time_start/time_end are wall-clock (no embedded tz).
--     timezone_start/timezone_end resolve to the item's own value if
--     set, else fall back to trips.default_timezone. Most items only
--     need timezone_start to differ from default (e.g. the airport
--     taxi in local Israel time); flights are the case where start and
--     end genuinely differ (origin vs. destination zone).
--
-- 13. Photos: item_photos is a proper child table (not jsonb) so each
--     photo can carry its own caption and sort_order, and multiple
--     photos per item are just multiple rows.
--
-- 14. Soft delete / archive: trips.deleted_at and items.deleted_at are
--     null for active records. "Delete" in the app sets deleted_at
--     (moves it to an archive/trash view); the app filters
--     deleted_at is null everywhere by default (the partial indexes
--     above keep that filter fast). Permanent removal is a distinct,
--     explicit second action taken from the archive view — an actual
--     DELETE, which cascades as normal. Children (days/items/expenses/
--     etc.) aren't required to be independently archived when their
--     parent trip is archived — the app just stops surfacing anything
--     under an archived trip.
-- ============================================================

-- ---------- updated_at auto-maintenance ----------

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_trips_updated_at
  before update on trips
  for each row execute function set_updated_at();

create trigger trg_items_updated_at
  before update on items
  for each row execute function set_updated_at();

-- ---------- Auto-generate day rows from trip date range ----------

create or replace function generate_trip_days()
returns trigger as $$
declare
  d date;
  next_order int;
begin
  -- On insert, or when dates change on update, create any missing day
  -- rows spanning start_date..end_date. Existing days (and their items)
  -- are left untouched; this only fills in gaps.
  select coalesce(max(sort_order), -1) + 1 into next_order
    from days where trip_id = new.id;

  for d in select generate_series(new.start_date, new.end_date, interval '1 day')::date loop
    insert into days (trip_id, date, sort_order)
    values (new.id, d, next_order)
    on conflict (trip_id, date) do nothing;
    next_order := next_order + 1;
  end loop;

  return new;
end;
$$ language plpgsql;

create trigger trg_trips_generate_days
  after insert or update of start_date, end_date on trips
  for each row execute function generate_trip_days();

-- ---------- Row Level Security ----------

alter table trips enable row level security;
alter table trip_currencies enable row level security;
alter table trip_parties enable row level security;
alter table days enable row level security;
alter table items enable row level security;
alter table shopping_list_items enable row level security;
alter table expenses enable row level security;
alter table allocations enable row level security;
alter table item_photos enable row level security;

create policy trips_owner on trips
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy trip_currencies_owner on trip_currencies
  for all using (exists (select 1 from trips where trips.id = trip_currencies.trip_id and trips.user_id = auth.uid()))
  with check (exists (select 1 from trips where trips.id = trip_currencies.trip_id and trips.user_id = auth.uid()));

create policy trip_parties_owner on trip_parties
  for all using (exists (select 1 from trips where trips.id = trip_parties.trip_id and trips.user_id = auth.uid()))
  with check (exists (select 1 from trips where trips.id = trip_parties.trip_id and trips.user_id = auth.uid()));

create policy days_owner on days
  for all using (exists (select 1 from trips where trips.id = days.trip_id and trips.user_id = auth.uid()))
  with check (exists (select 1 from trips where trips.id = days.trip_id and trips.user_id = auth.uid()));

create policy items_owner on items
  for all using (exists (select 1 from trips where trips.id = items.trip_id and trips.user_id = auth.uid()))
  with check (exists (select 1 from trips where trips.id = items.trip_id and trips.user_id = auth.uid()));

create policy shopping_list_items_owner on shopping_list_items
  for all using (exists (select 1 from trips where trips.id = shopping_list_items.trip_id and trips.user_id = auth.uid()))
  with check (exists (select 1 from trips where trips.id = shopping_list_items.trip_id and trips.user_id = auth.uid()));

create policy expenses_owner on expenses
  for all using (exists (select 1 from trips where trips.id = expenses.trip_id and trips.user_id = auth.uid()))
  with check (exists (select 1 from trips where trips.id = expenses.trip_id and trips.user_id = auth.uid()));

create policy allocations_owner on allocations
  for all using (exists (
      select 1 from expenses
      join trips on trips.id = expenses.trip_id
      where expenses.id = allocations.expense_id and trips.user_id = auth.uid()
    ))
  with check (exists (
      select 1 from expenses
      join trips on trips.id = expenses.trip_id
      where expenses.id = allocations.expense_id and trips.user_id = auth.uid()
    ));

create policy item_photos_owner on item_photos
  for all using (exists (
      select 1 from items
      join trips on trips.id = items.trip_id
      where items.id = item_photos.item_id and trips.user_id = auth.uid()
    ))
  with check (exists (
      select 1 from items
      join trips on trips.id = items.trip_id
      where items.id = item_photos.item_id and trips.user_id = auth.uid()
    ));

-- ---------- Storage: item photo files ----------
-- Objects are stored at path "{user_id}/{item_id}/{filename}" — the policies
-- below trust that convention to scope access without a join, since storage
-- RLS can't easily join back to the items/trips tables per-request.

insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', false)
on conflict (id) do nothing;

create policy item_photos_storage_owner on storage.objects
  for all using (
    bucket_id = 'item-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'item-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
-- ============================================================
