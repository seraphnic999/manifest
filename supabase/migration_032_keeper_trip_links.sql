-- Keepers hold a many-to-one relationship with items now: any number of
-- trip items (across any number of trips) can point back to the same
-- keeper, so a keeper can show every trip it's ever been added to and be
-- added to new trips going forward. The old one-directional
-- keepers.source_item_id (added in migration_031) assumed a single link
-- and is superseded by this items-side foreign key.

alter table items add column keeper_id uuid references keepers(id) on delete set null;
create index idx_items_keeper on items(keeper_id);

-- Backfill: every keeper that already recorded which item it came from
-- gets that link re-expressed as the item pointing at the keeper.
update items set keeper_id = k.id
from keepers k
where k.source_item_id = items.id;

alter table keepers drop column source_item_id;

-- A keeper is a reusable snapshot of a *place*, not of any one trip's
-- booking — these columns were always trip-instance detail (this
-- specific stay's dates, this specific booking's confirmation number)
-- that never belonged on the reusable record in the first place.
alter table keepers
  drop column start_date,
  drop column end_date,
  drop column time_start,
  drop column time_end,
  drop column timezone_start,
  drop column timezone_end,
  drop column notes,
  drop column confirmation_code,
  drop column booking_source;
