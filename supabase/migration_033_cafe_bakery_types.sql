-- New Food & Drink subtypes: Cafe and Bakery, alongside the existing
-- Restaurant/Bar. Each ADD VALUE runs on its own since Postgres won't let
-- a new enum value be used in the same transaction that adds it.
alter type item_type add value if not exists 'cafe';
alter type item_type add value if not exists 'bakery';
