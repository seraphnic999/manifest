-- ============================================================
-- Manifest — Migration 002: new feature schema changes
-- ============================================================
-- Run this once against your live Supabase project (SQL Editor) when
-- convenient. Every statement here is purely additive (new nullable
-- columns / new tables) — nothing here drops or rewrites existing data,
-- and the app keeps working on the old schema until you run this, it just
-- won't have these specific new features active yet.
-- ============================================================

-- ---------- File/document attachments (alongside existing photos) ----------
-- item_photos already covers "an attachment on an item" structurally
-- (storage_path + caption + sort_order) — broadened in place rather than
-- introducing a parallel table, since a document is just a differently-typed
-- attachment. Existing rows get NULL here (the app treats NULL mime_type as
-- "image", matching every row that existed before this migration).
alter table item_photos add column if not exists file_name text;
alter table item_photos add column if not exists mime_type text;

-- ---------- Item-to-item links (cross-navigation between related items) ----------
-- One row per link; item_id_a is always the lexically-smaller uuid of the
-- pair (enforced in application code, not here) so a link only ever exists
-- in one direction and "is A linked to B" is a single unique check.
create table if not exists item_links (
  id uuid primary key default gen_random_uuid(),
  item_id_a uuid not null references items(id) on delete cascade,
  item_id_b uuid not null references items(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint item_links_no_self check (item_id_a <> item_id_b),
  constraint item_links_unique unique (item_id_a, item_id_b)
);

create index if not exists idx_item_links_a on item_links(item_id_a);
create index if not exists idx_item_links_b on item_links(item_id_b);

alter table item_links enable row level security;

drop policy if exists item_links_owner on item_links;
create policy item_links_owner on item_links
  for all using (exists (
      select 1 from items
      join trips on trips.id = items.trip_id
      where items.id = item_links.item_id_a and trips.user_id = auth.uid()
    ))
  with check (exists (
      select 1 from items
      join trips on trips.id = items.trip_id
      where items.id = item_links.item_id_a and trips.user_id = auth.uid()
    ));

-- ---------- Expense type ----------
-- A closed, smaller list than item_type (transfers fold into 'transport',
-- bar tabs fold into 'meals') since this drives the expense report's
-- category breakdown, not a general-purpose taxonomy.
do $$ begin
  create type expense_type as enum ('flight', 'lodging', 'transport', 'meals', 'shopping', 'other');
exception when duplicate_object then null;
end $$;

alter table expenses add column if not exists type expense_type not null default 'other';

-- ============================================================
-- Trip sharing — the one non-trivial change in this file
-- ============================================================
-- Everything above this point only adds columns/tables. This section also
-- REWRITES every existing RLS policy that currently reads
-- `trips.user_id = auth.uid()`, replacing that check with
-- `user_has_trip_access(trip_id)`, which is true for the owner (identical
-- to the old check) OR for anyone the trip has been shared with — so
-- existing single-owner access is fully preserved, this only adds a new
-- class of allowed access. Still, review this section before running it;
-- it's the part of this migration that touches security policy rather than
-- just shape. Safe to run more than once (every statement drops-if-exists
-- or creates-or-replaces first).

-- Defensive: the new trips_insert policy below checks user_id = auth.uid()
-- on every insert, same as the policy it replaces — this just makes sure
-- the column still defaults itself when the client omits it, whatever the
-- current default is (a no-op if it's already this).
alter table trips alter column user_id set default auth.uid();

create table if not exists trip_shares (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  invited_email text not null,
  shared_with_user_id uuid references auth.users(id) on delete cascade, -- null until that email's account claims it (see claim_pending_trip_shares below)
  created_at timestamptz not null default now(),
  constraint trip_shares_unique unique (trip_id, invited_email)
);

create index if not exists idx_trip_shares_trip on trip_shares(trip_id);
create index if not exists idx_trip_shares_user on trip_shares(shared_with_user_id);

alter table trip_shares enable row level security;

drop policy if exists trip_shares_visible on trip_shares;
create policy trip_shares_visible on trip_shares
  for select using (
    shared_with_user_id = auth.uid()
    or exists (select 1 from trips where trips.id = trip_shares.trip_id and trips.user_id = auth.uid())
  );
-- No insert/update/delete policy is defined on trip_shares at all — direct
-- client writes are denied by default once RLS is enabled. All writes go
-- through the security-definer functions below instead, which is what lets
-- share_trip_with_email() resolve an email to a user id (auth.users isn't
-- client-readable) without granting broader table access to do it.

create or replace function user_has_trip_access(p_trip_id uuid)
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

create or replace function share_trip_with_email(p_trip_id uuid, p_email text)
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

create or replace function unshare_trip(p_trip_id uuid, p_email text)
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
create or replace function claim_pending_trip_shares()
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

-- ---- Rewire every table's RLS policy to route through user_has_trip_access ----

drop policy if exists trips_owner on trips;
drop policy if exists trips_select on trips;
drop policy if exists trips_update on trips;
drop policy if exists trips_insert on trips;
drop policy if exists trips_delete on trips;
create policy trips_select on trips for select using (user_has_trip_access(id));
create policy trips_update on trips for update using (user_has_trip_access(id)) with check (user_has_trip_access(id));
create policy trips_insert on trips for insert with check (user_id = auth.uid());
create policy trips_delete on trips for delete using (user_id = auth.uid());

drop policy if exists trip_currencies_owner on trip_currencies;
create policy trip_currencies_owner on trip_currencies
  for all using (user_has_trip_access(trip_id)) with check (user_has_trip_access(trip_id));

drop policy if exists trip_parties_owner on trip_parties;
create policy trip_parties_owner on trip_parties
  for all using (user_has_trip_access(trip_id)) with check (user_has_trip_access(trip_id));

drop policy if exists days_owner on days;
create policy days_owner on days
  for all using (user_has_trip_access(trip_id)) with check (user_has_trip_access(trip_id));

drop policy if exists items_owner on items;
create policy items_owner on items
  for all using (user_has_trip_access(trip_id)) with check (user_has_trip_access(trip_id));

drop policy if exists shopping_list_items_owner on shopping_list_items;
create policy shopping_list_items_owner on shopping_list_items
  for all using (user_has_trip_access(trip_id)) with check (user_has_trip_access(trip_id));

drop policy if exists expenses_owner on expenses;
create policy expenses_owner on expenses
  for all using (user_has_trip_access(trip_id)) with check (user_has_trip_access(trip_id));

drop policy if exists allocations_owner on allocations;
create policy allocations_owner on allocations
  for all using (exists (select 1 from expenses where expenses.id = allocations.expense_id and user_has_trip_access(expenses.trip_id)))
  with check (exists (select 1 from expenses where expenses.id = allocations.expense_id and user_has_trip_access(expenses.trip_id)));

drop policy if exists item_photos_owner on item_photos;
create policy item_photos_owner on item_photos
  for all using (exists (select 1 from items where items.id = item_photos.item_id and user_has_trip_access(items.trip_id)))
  with check (exists (select 1 from items where items.id = item_photos.item_id and user_has_trip_access(items.trip_id)));

drop policy if exists item_links_owner on item_links;
create policy item_links_owner on item_links
  for all using (exists (select 1 from items where items.id = item_links.item_id_a and user_has_trip_access(items.trip_id)))
  with check (exists (select 1 from items where items.id = item_links.item_id_a and user_has_trip_access(items.trip_id)));

-- Storage objects are stored at "{trip_owner_user_id}/{item_id}/{filename}"
-- (lib/photos.ts resolves and uses the trip OWNER's id for this prefix,
-- regardless of which collaborator uploads) so this check never needs the
-- item_photos row to exist yet at upload time — it only needs the path's
-- leading segment to belong to a trip this user has access to.
drop policy if exists item_photos_storage_owner on storage.objects;
drop policy if exists item_photos_storage_shared on storage.objects;
create policy item_photos_storage_shared on storage.objects
  for all using (
    bucket_id = 'item-photos'
    and exists (
      select 1 from trips
      where trips.user_id::text = (storage.foldername(name))[1]
        and user_has_trip_access(trips.id)
    )
  )
  with check (
    bucket_id = 'item-photos'
    and exists (
      select 1 from trips
      where trips.user_id::text = (storage.foldername(name))[1]
        and user_has_trip_access(trips.id)
    )
  );
