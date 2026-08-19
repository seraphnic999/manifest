-- ============================================================
-- Manifest — Migration 005: move items.notes into item_quick_notes
-- ============================================================
-- Run this once against your live Supabase project (SQL Editor), AFTER
-- migration_004 (which creates item_quick_notes) has already been applied.
--
-- The app no longer shows or edits the old single free-text items.notes
-- field — quick notes replace it entirely. This copies every item's
-- existing note text into a new item_quick_notes row, then clears the old
-- field. The items.notes column itself is left in place (unused) rather
-- than dropped, in case anything still needs to read it later.
-- ============================================================

insert into item_quick_notes (item_id, text, sort_order)
select
  items.id,
  items.notes,
  coalesce((select max(sort_order) + 1 from item_quick_notes where item_quick_notes.item_id = items.id), 0)
from items
where items.notes is not null and trim(items.notes) <> '';

update items set notes = null where notes is not null;
