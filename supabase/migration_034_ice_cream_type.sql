-- New Food & Drink subtype: Ice Cream, alongside Restaurant/Bar/Cafe/Bakery.
alter type item_type add value if not exists 'ice_cream';
