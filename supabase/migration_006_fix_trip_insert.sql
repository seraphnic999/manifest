-- ============================================================
-- Manifest — Migration 006: fix "can't create a new trip"
-- ============================================================
-- Run this once against your live Supabase project (SQL Editor).
--
-- Creating a new trip currently fails with "new row violates row-level
-- security policy for table trips". SELECT and UPDATE on trips both work
-- correctly (verified directly), which means the trips_insert policy
-- itself is most likely missing or never took effect, leaving trips with
-- RLS enabled and no permissive policy at all for INSERT — Postgres denies
-- everything by default in that case. This re-asserts the insert (and
-- delete, for the same reason) policy exactly as it should be; safe to run
-- even if it's already correct.
-- ============================================================

drop policy if exists trips_insert on trips;
create policy trips_insert on trips for insert with check (user_id = auth.uid());

drop policy if exists trips_delete on trips;
create policy trips_delete on trips for delete using (user_id = auth.uid());
