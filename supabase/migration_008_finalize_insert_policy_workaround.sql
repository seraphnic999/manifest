-- ============================================================
-- Manifest — Migration 008: finalize the FOR INSERT policy workaround
-- ============================================================
-- Run this once against your live Supabase project (SQL Editor). Builds
-- on migration_007 (which added the ownership-forcing trigger and fixed
-- trips_delete, but used a dedicated `for insert` policy that turned out
-- to ALSO be broken).
--
-- Diagnosis, extensively verified live against this project: even a
-- completely trivial, unconditional `for insert with check (true)` policy
-- (no role restriction) was rejected by RLS — but the exact same check
-- expressed as a `for all` policy instead of a dedicated `for insert`
-- policy works correctly. Confirmed by directly toggling
-- ENABLE/DISABLE ROW LEVEL SECURITY on the table (disabling fixed it
-- instantly, re-enabling broke it again, with identical policy content
-- throughout) — this rules out caching/staleness and isolates the fault
-- specifically to how RLS evaluates dedicated FOR INSERT command-type
-- policies on this table/project.
--
-- Fix: replace the dedicated FOR INSERT policy with a FOR ALL policy
-- shaped so it only ever grants anything extra for INSERT: `with check
-- (true)` permits INSERT unconditionally — safe because
-- trg_trips_force_owner (added in migration_007) always overwrites
-- user_id with the caller's own auth.uid() before the row is stored,
-- regardless of what the client sends.
--
-- `using (user_id = auth.uid())` is required too — empirically, on this
-- project, RLS enforces the USING clause against the RETURNING row of an
-- INSERT under a FOR ALL policy (non-standard vs. plain Postgres, where a
-- bare INSERT's RETURNING doesn't need a separate SELECT-policy pass —
-- verified live: with using(false) the insert itself still failed with
-- the RLS error; switching to the real ownership condition fixed it).
-- This doesn't loosen anything: it's exactly the row a client can already
-- reach via trips_select/trips_update's user_has_trip_access, or exactly
-- what trips_delete's user_owns_trip already allows, so OR-combining it
-- in adds no new access for SELECT/UPDATE-eligibility/DELETE.
--
-- Side effect of using FOR ALL: its `with check (true)` also loosens
-- UPDATE's new-row validation (normally re-checked against trips_update's
-- own with_check), which could otherwise let someone reassign a trip's
-- user_id via UPDATE. Closed off directly with a dedicated trigger that
-- makes user_id immutable after creation, independent of whatever RLS
-- does — defense in depth regardless of the RLS quirk above.
-- ============================================================

drop policy if exists trips_insert on trips;
drop policy if exists trips_insert_all on trips;
create policy trips_insert_all on trips for all using (user_id = auth.uid()) with check (true);

create or replace function trips_prevent_user_id_change()
returns trigger
language plpgsql
as $$
begin
  new.user_id := old.user_id;
  return new;
end;
$$;

drop trigger if exists trg_trips_prevent_user_id_change on trips;
create trigger trg_trips_prevent_user_id_change
  before update on trips
  for each row execute function trips_prevent_user_id_change();
