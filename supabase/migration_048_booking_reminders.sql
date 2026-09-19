-- ============================================================
-- Manifest — Migration 048: booking reminders
-- ============================================================
-- A separate "go make this reservation" nudge, decoupled from the day-of
-- reminder (migration_014's reminder_minutes_before/reminder_sent_at) —
-- that one fires N minutes before the item's own start time, wrong shape
-- for "book 6 weeks before the trip". This is a plain absolute instant the
-- user picked (defaulting to the researched lead time), checked the same
-- way by send-reminders: due and unsent.
-- ============================================================

alter table items add column booking_reminder_at timestamptz;
alter table items add column booking_reminder_sent_at timestamptz;
