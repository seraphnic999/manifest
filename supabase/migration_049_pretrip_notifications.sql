-- ============================================================
-- Manifest — Migration 049: pre-trip notifications
-- ============================================================
-- Two one-shot, trip-level system pushes (see send-reminders):
--   - checkin_reminder: 24h before the trip's first flight departs
--   - pretrip_briefing: 12h before the same anchor (or a fallback —
--     the first day's earliest timed item, or a synthetic 09:00 local
--     on the start date, for a trip with no flight item)
-- Each tracked with its own *_sent_at column, same one-shot pattern as
-- items.reminder_sent_at (migration_014) and
-- items.booking_reminder_sent_at (migration_048) — never reused across
-- purposes, so one doesn't suppress or get suppressed by the other.
-- ============================================================

alter table trips add column checkin_reminder_sent_at timestamptz;
alter table trips add column pretrip_briefing_sent_at timestamptz;
