-- ============================================================
-- Manifest — Migration 010: remove the 'idea' item_status value
-- ============================================================
-- Never used in any real trip — the one live row using it was in the
-- Barcelona seed/test fixture, reassigned to 'optional' below. Postgres
-- has no DROP VALUE for enums, so this swaps in a new type without it.
-- ============================================================

update items set status = 'optional' where status = 'idea';

create type item_status_new as enum ('booked', 'optional', 'planned');
alter table items alter column status drop default;
alter table items alter column status type item_status_new using status::text::item_status_new;
alter table items alter column status set default 'booked';
drop type item_status;
alter type item_status_new rename to item_status;
