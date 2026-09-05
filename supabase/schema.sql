-- ============================================================
-- Travel Companion App — Supabase/Postgres Schema
-- ============================================================
-- Model: Trip -> Days -> Items (+sub-items, +alternatives)
--        Trip -> Currencies, Parties
--        Item -> Expenses -> Allocations (-> ShoppingListItem, -> Party)
--        Trip -> ShoppingListItems (optionally linked to an Item)
-- ============================================================

-- ---------- Extensions ----------

create extension if not exists postgis; -- powers items.geom (see below) for future "near me" queries

-- ---------- Enums ----------

create type trip_type as enum ('business', 'pleasure', 'mixed');

create type item_type as enum (
  'flight', 'transfer', 'transport', 'lodging', 'activity',
  'meal', 'bar', 'sightseeing', 'attraction', 'shopping', 'work', 'other'
);
-- 'transfer'  = pre-booked private transfer (taxi, Transfeero-style car)
-- 'transport' = public transport instructions/legs (train, bus, shuttle)

create type item_status as enum ('booked', 'optional', 'planned');
-- A closed, smaller list than item_type (transfers fold into 'transport',
-- bar tabs fold into 'meals') since this drives the expense report's
-- category breakdown, not a general-purpose taxonomy.
create type expense_type as enum ('flight', 'lodging', 'transport', 'meals', 'attractions', 'shopping', 'other');

-- ---------- Trips ----------

create table trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
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
  date date,                         -- null only for the one special "Proposals"
                                      -- day every trip has (see trigger below) —
                                      -- a holding pen for undated candidate items;
                                      -- "promoting" one is just editing its date
                                      -- to move it onto a real day.
  theme text,                        -- 'At sea', 'Working 1/2 day', etc.
  sort_order int not null,           -- explicit order, independent of date gaps
  created_at timestamptz not null default now(),
  unique (trip_id, date)
);

create index idx_days_trip on days(trip_id);
create unique index days_one_proposals_per_trip on days(trip_id) where date is null;

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
  notes text,                        -- deprecated: superseded by item_quick_notes; app no longer reads/writes this
  confirmation_code text,
  booking_source text,               -- how it was booked: 'Direct', 'Expedia', 'GetYourGuide', etc.
                                      -- (free text w/ a suggested-values list in the app, not a DB enum,
                                      -- so new sources don't need a migration)
  address text,
  phone text,
  vendor text,
  link text,
  google_maps_link text,             -- optional; opens in a new tab on web, deep-links to the
                                      -- Google Maps app on native — separate from `link` (the
                                      -- item's own booking/info URL)
  sort_order int not null,
  latitude numeric(9,6),             -- map view: promoted out of custom_fields.lat (still present
  longitude numeric(9,6),            -- there too until a follow-up migration drops it). Both or neither.
  geom geography(Point, 4326) generated always as (
    case when latitude is not null and longitude is not null
    then st_setsrid(st_makepoint(longitude::float8, latitude::float8), 4326)::geography end
  ) stored,                          -- derived from lat/lon; app never writes this directly
  deleted_at timestamptz,            -- soft delete / archive; null = active. App filters this by
                                      -- default everywhere; permanent removal is a separate,
                                      -- explicit hard-delete action from the archive view.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_latlon_paired check ((latitude is null) = (longitude is null))
);

create index idx_items_day on items(day_id);
create index idx_items_trip on items(trip_id);
create index idx_items_parent on items(parent_item_id);
create index idx_items_type on items(trip_id, type);   -- powers "all flights" / "all hotels" views
create index idx_items_alt_group on items(alt_group_id);
create index idx_items_date_range on items(start_date, end_date);
create index idx_items_active on items(trip_id) where deleted_at is null;  -- fast default "active items" filter
create index items_latlon_idx on items(latitude, longitude) where deleted_at is null and latitude is not null;
create index items_geom_idx on items using gist(geom) where deleted_at is null;

-- ---------- Item photos ----------

create table item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  storage_path text not null,        -- path in Supabase Storage
  caption text,
  file_name text,                    -- original filename; null for older photo-only rows
  mime_type text,                    -- null mime_type = image (every row before file attachments existed)
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_item_photos_item on item_photos(item_id);

-- ---------- Item-to-item links (cross-navigation between related items) ----------
-- One row per link; item_id_a is always the lexically-smaller uuid of the
-- pair (enforced in application code, not here) so a link only ever exists
-- in one direction and "is A linked to B" is a single unique check.
create table item_links (
  id uuid primary key default gen_random_uuid(),
  item_id_a uuid not null references items(id) on delete cascade,
  item_id_b uuid not null references items(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint item_links_no_self check (item_id_a <> item_id_b),
  constraint item_links_unique unique (item_id_a, item_id_b)
);

create index idx_item_links_a on item_links(item_id_a);
create index idx_item_links_b on item_links(item_id_b);

-- ---------- Quick single-line notes on items ----------
-- Distinct from items.notes (one long free-text field, edited via the full
-- edit form) — this is a list of short standalone notes addable/removable
-- in one tap from the item details page, no edit-mode round trip needed.
create table item_quick_notes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  text text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_item_quick_notes_item on item_quick_notes(item_id);

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
  type expense_type not null default 'other',
  refund_amount numeric(12,2),       -- optional; same currency as this expense; not part of the split
  refund_company text,               -- e.g. "Global Blue"
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
  note text,                         -- optional note for this split specifically
  created_at timestamptz not null default now(),
  constraint allocation_amount_positive check (amount > 0)
);

create index idx_allocations_expense on allocations(expense_id);
create index idx_allocations_shopping_item on allocations(shopping_list_item_id);
create index idx_allocations_party on allocations(party_id);

-- ---------- Trip sharing ----------
-- Lets a trip be collaboratively edited by more than one account. Invites
-- are by email; if the invited address hasn't signed up yet, the row sits
-- with shared_with_user_id null until claim_pending_trip_shares() (called
-- once after login) resolves it.

create table trip_shares (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  invited_email text not null,
  shared_with_user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint trip_shares_unique unique (trip_id, invited_email)
);

-- ---------- Map: routes ----------
-- Hand-drawn walking-route polylines that don't correspond to any item.
-- Non-itinerary "shortlist" places (runner-up restaurants, unchosen
-- museums) used to live in a separate trip_places table, but that's been
-- superseded by the "Proposals" day (see days.date above) — they're now
-- just ordinary items with day_id pointing at that day.

create table map_routes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  day_id uuid references days(id) on delete set null,
  name text not null,
  color text,                        -- e.g. '#A52714'; null = inherit day colour
  geometry jsonb not null,           -- GeoJSON LineString, [lon,lat] vertex order
  sort_order int not null default 1000,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_map_routes_trip on map_routes(trip_id) where deleted_at is null;

create index idx_trip_shares_trip on trip_shares(trip_id);
create index idx_trip_shares_user on trip_shares(shared_with_user_id);

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

  -- Every trip also gets one no-date "Proposals" day, sorted last.
  insert into days (trip_id, date, theme, sort_order)
  values (new.id, null, 'Proposals', 999999)
  on conflict (trip_id) where date is null do nothing;

  return new;
end;
$$ language plpgsql;

create trigger trg_trips_generate_days
  after insert or update of start_date, end_date on trips
  for each row execute function generate_trip_days();

-- ---------- Trip ownership enforcement (insert/update) ----------
-- RLS's WITH CHECK is unreliable specifically for dedicated FOR INSERT
-- policies on this project (verified extensively live — see
-- migration_007/migration_008 for the full diagnosis: a trivial,
-- unconditional `for insert with check (true)` was still rejected, while
-- the identical check expressed as a FOR ALL policy works). Ownership is
-- enforced here instead via triggers, which run through the same
-- evaluation path already proven reliable (a plain function-body read of
-- auth.uid()), with the RLS policy itself reduced to a pass-through.

create or replace function trips_force_owner()
returns trigger
language plpgsql
as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;

create trigger trg_trips_force_owner
  before insert on trips
  for each row execute function trips_force_owner();

create or replace function trips_prevent_user_id_change()
returns trigger
language plpgsql
as $$
begin
  new.user_id := old.user_id;
  return new;
end;
$$;

create trigger trg_trips_prevent_user_id_change
  before update on trips
  for each row execute function trips_prevent_user_id_change();

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
alter table item_links enable row level security;
alter table item_quick_notes enable row level security;
alter table trip_shares enable row level security;
alter table map_routes enable row level security;

-- A share row is visible to the trip owner (to manage who it's shared with)
-- and to the person it names (to see their own shared trips). No insert/
-- update/delete policy is defined at all — direct client writes are denied
-- by default once RLS is on; every write instead goes through the
-- security-definer functions below, which is what lets share_trip_with_email
-- resolve an email to a user id (auth.users isn't client-readable) without
-- granting broader table access to do it.
create policy trip_shares_visible on trip_shares
  for select using (
    shared_with_user_id = auth.uid()
    or exists (select 1 from trips where trips.id = trip_shares.trip_id and trips.user_id = auth.uid())
  );

-- True for the trip's owner (identical to the plain ownership check this
-- replaces) OR for anyone the trip has been shared with. Every other policy
-- below is built on this, so sharing only ever adds access, never removes it.
create function user_has_trip_access(p_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from trips where trips.id = p_trip_id and trips.user_id = auth.uid()
  ) or exists (
    select 1 from trip_shares where trip_shares.trip_id = p_trip_id and trip_shares.shared_with_user_id = auth.uid()
  );
$$;

-- Storage policies run in a context where a plain (non-security-definer)
-- subquery into an RLS-protected public-schema table is unreliable — the
-- JWT claims auth.uid() reads don't always propagate correctly into that
-- nested lookup, so a subquery-based storage policy can spuriously deny
-- access even for the trip's own owner. Wrapping the check in its own
-- security-definer function (same pattern as user_has_trip_access) avoids
-- the nested-RLS lookup entirely and is the pattern Supabase itself
-- recommends for storage policies that need to check application data.
create function storage_path_owner_has_trip_access(p_path text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from trips
    where trips.user_id::text = (storage.foldername(p_path))[1]
      and user_has_trip_access(trips.id)
  );
$$;

grant execute on function storage_path_owner_has_trip_access(text) to authenticated;

create function share_trip_with_email(p_trip_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not exists (select 1 from trips where id = p_trip_id and user_id = auth.uid()) then
    raise exception 'Only the trip owner can share it';
  end if;

  select id into v_user_id from auth.users where lower(email) = lower(p_email) limit 1;

  insert into trip_shares (trip_id, invited_email, shared_with_user_id)
  values (p_trip_id, lower(p_email), v_user_id)
  on conflict (trip_id, invited_email) do update set shared_with_user_id = excluded.shared_with_user_id;
end;
$$;

create function unshare_trip(p_trip_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from trips where id = p_trip_id and user_id = auth.uid()) then
    raise exception 'Only the trip owner can remove a share';
  end if;
  delete from trip_shares where trip_id = p_trip_id and lower(invited_email) = lower(p_email);
end;
$$;

-- Called once after login: attaches any share invited by this account's own
-- email address that was created before the invitee had signed up.
create function claim_pending_trip_shares()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update trip_shares
  set shared_with_user_id = auth.uid()
  where shared_with_user_id is null
    and invited_email = lower((select email from auth.users where id = auth.uid()));
end;
$$;

grant execute on function user_has_trip_access(uuid) to authenticated;
grant execute on function share_trip_with_email(uuid, text) to authenticated;
grant execute on function unshare_trip(uuid, text) to authenticated;
grant execute on function claim_pending_trip_shares() to authenticated;

create policy trips_select on trips for select using (user_has_trip_access(id));
create policy trips_update on trips for update using (user_has_trip_access(id)) with check (user_has_trip_access(id));

create function user_owns_trip(p_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from trips where trips.id = p_trip_id and trips.user_id = auth.uid());
$$;

grant execute on function user_owns_trip(uuid) to authenticated;

-- FOR ALL (not a dedicated FOR INSERT policy) is required — see the
-- trigger comment above for why. `using` matches what trips_select and
-- trips_delete already independently allow, so it grants nothing extra
-- for SELECT/UPDATE-eligibility/DELETE; `with check (true)` permits
-- INSERT unconditionally since trg_trips_force_owner already guarantees
-- correct ownership regardless of what the client sends.
create policy trips_insert_all on trips for all using (user_id = auth.uid()) with check (true);
create policy trips_delete on trips for delete using (user_owns_trip(id));

create policy trip_currencies_owner on trip_currencies
  for all using (user_has_trip_access(trip_id))
  with check (user_has_trip_access(trip_id));

create policy trip_parties_owner on trip_parties
  for all using (user_has_trip_access(trip_id))
  with check (user_has_trip_access(trip_id));

create policy days_owner on days
  for all using (user_has_trip_access(trip_id))
  with check (user_has_trip_access(trip_id));

create policy items_owner on items
  for all using (user_has_trip_access(trip_id))
  with check (user_has_trip_access(trip_id));

create policy shopping_list_items_owner on shopping_list_items
  for all using (user_has_trip_access(trip_id))
  with check (user_has_trip_access(trip_id));

create policy expenses_owner on expenses
  for all using (user_has_trip_access(trip_id))
  with check (user_has_trip_access(trip_id));

create policy allocations_owner on allocations
  for all using (exists (
      select 1 from expenses
      where expenses.id = allocations.expense_id and user_has_trip_access(expenses.trip_id)
    ))
  with check (exists (
      select 1 from expenses
      where expenses.id = allocations.expense_id and user_has_trip_access(expenses.trip_id)
    ));

create policy item_photos_owner on item_photos
  for all using (exists (
      select 1 from items
      where items.id = item_photos.item_id and user_has_trip_access(items.trip_id)
    ))
  with check (exists (
      select 1 from items
      where items.id = item_photos.item_id and user_has_trip_access(items.trip_id)
    ));

create policy item_links_owner on item_links
  for all using (exists (
      select 1 from items
      where items.id = item_links.item_id_a and user_has_trip_access(items.trip_id)
    ))
  with check (exists (
      select 1 from items
      where items.id = item_links.item_id_a and user_has_trip_access(items.trip_id)
    ));

create policy item_quick_notes_owner on item_quick_notes
  for all using (exists (
      select 1 from items
      where items.id = item_quick_notes.item_id and user_has_trip_access(items.trip_id)
    ))
  with check (exists (
      select 1 from items
      where items.id = item_quick_notes.item_id and user_has_trip_access(items.trip_id)
    ));

create policy map_routes_owner on map_routes
  for all using (user_has_trip_access(trip_id))
  with check (user_has_trip_access(trip_id));

-- ---------- Storage: item photo files ----------
-- Objects are stored at path "{trip_owner_user_id}/{item_id}/{filename}" —
-- lib/photos.ts resolves and uses the trip OWNER's id for this prefix
-- regardless of which collaborator uploads, so this check never needs the
-- item_photos row to exist yet at upload time (it's written to storage
-- before the row referencing it is inserted) — it only needs the path's
-- leading segment to belong to a trip this user has access to.

insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', false)
on conflict (id) do nothing;

create policy item_photos_storage_shared on storage.objects
  for all using (bucket_id = 'item-photos' and storage_path_owner_has_trip_access(name))
  with check (bucket_id = 'item-photos' and storage_path_owner_has_trip_access(name));
-- ============================================================
