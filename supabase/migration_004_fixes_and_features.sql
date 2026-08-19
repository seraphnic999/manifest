-- ============================================================
-- Manifest — Migration 004: storage RLS fix + tax refunds + quick notes
-- ============================================================
-- Run this once against your live Supabase project (SQL Editor).
-- ============================================================

-- ---------- Fix: attachment upload failing with "row-level security policy" ----------
-- The previous storage policy (from migration_002) did a plain subquery
-- into the RLS-protected `trips` table from within a storage.objects
-- policy. That nested lookup doesn't reliably see auth.uid() the same way
-- a top-level query does, so it could spuriously deny access even to a
-- trip's own owner. Wrapping the check in its own security-definer
-- function (same pattern as user_has_trip_access) avoids the nested-RLS
-- lookup entirely — this is the pattern Supabase itself recommends for
-- storage policies that need to check application data.
create or replace function storage_path_owner_has_trip_access(p_path text)
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

drop policy if exists item_photos_storage_owner on storage.objects;
drop policy if exists item_photos_storage_shared on storage.objects;
create policy item_photos_storage_shared on storage.objects
  for all using (bucket_id = 'item-photos' and storage_path_owner_has_trip_access(name))
  with check (bucket_id = 'item-photos' and storage_path_owner_has_trip_access(name));

-- ---------- Tax refunds on expenses ----------
-- Both nullable/optional — an expense with no refund just has both null.
-- Deliberately NOT part of the split: allocations still sum to the full
-- original amount regardless of any refund tracked here.
alter table expenses add column if not exists refund_amount numeric(12,2);
alter table expenses add column if not exists refund_company text;

-- ---------- Quick single-line notes on items ----------
-- Distinct from items.notes (one long free-text field, edited via the full
-- edit form) — this is a list of short standalone notes addable/removable
-- in one tap from the item details page, no edit-mode round trip needed.
create table if not exists item_quick_notes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  text text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_item_quick_notes_item on item_quick_notes(item_id);

alter table item_quick_notes enable row level security;

drop policy if exists item_quick_notes_owner on item_quick_notes;
create policy item_quick_notes_owner on item_quick_notes
  for all using (exists (
      select 1 from items
      where items.id = item_quick_notes.item_id and user_has_trip_access(items.trip_id)
    ))
  with check (exists (
      select 1 from items
      where items.id = item_quick_notes.item_id and user_has_trip_access(items.trip_id)
    ));
