-- Links a keeper back to the item it was created from, so the item detail
-- screen can show "already kept" instead of "Add to Keepers", and so a
-- future recurring-instance feature has something to attach new trip items
-- back to. Deliberately `on delete set null`, not cascade — keepers are a
-- snapshot the user chose to keep; deleting the source item (or its trip)
-- shouldn't delete the memory, just sever the live link.

alter table keepers add column source_item_id uuid references items(id) on delete set null;

create index idx_keepers_source_item on keepers(source_item_id);
