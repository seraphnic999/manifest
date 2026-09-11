-- Lets an item override which icon its map marker shows (defaults to its
-- item-type category icon when null). Value is an IconName string from
-- components/icons/Icon.tsx's MAP_PICKER_ICONS, not DB-validated since the
-- available set lives in app code, not the schema.
alter table items add column map_icon text;
