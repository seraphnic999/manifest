-- ============================================================
-- Manifest — Migration 003: expense follow-ups
-- ============================================================
-- Run this once against your live Supabase project (SQL Editor). Purely
-- additive — a new enum value and a new nullable column — nothing here
-- drops or rewrites existing data, and the app keeps working on the old
-- schema until you run this, it just won't have these bits active yet.
-- ============================================================

-- New expense type: attractions (tours, museums, tickets — previously
-- lumped into "other"). Item types activity/attraction/sightseeing now
-- derive to this instead of "other" (see lib/expenseType.ts).
alter type expense_type add value if not exists 'attractions';

-- Per-split note, alongside the existing amount/party/shopping-item fields
-- on a split row (the expense's own top-level note is separate and covers
-- the whole expense, not one split of it).
alter table allocations add column if not exists note text;
