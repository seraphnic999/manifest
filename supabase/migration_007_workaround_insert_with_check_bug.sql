-- ============================================================
-- Manifest — Migration 007: work around a broken WITH CHECK evaluation
-- for trips_insert (and the same landmine in trips_delete's USING clause)
-- ============================================================
-- Run this once against your live Supabase project (SQL Editor).
--
-- Diagnosis (extensively verified live against this exact project, after
-- migration_006 was already applied and the DB was fully restarted):
--   - The trips_insert policy `with check (user_id = auth.uid())` is
--     present, correctly defined, and applies to the right role.
--   - auth.uid() reliably resolves to the correct, matching user id in
--     every SELECT-style context tested: a bare RPC call, a
--     security-definer wrapper function, and a direct lookup against an
--     existing row this account genuinely owns (user_id = auth.uid()
--     evaluates to true there).
--   - Yet the identical expression, evaluated as a WITH CHECK during
--     INSERT, always rejects the row — even with an explicit, provably
--     correct literal user_id, even wrapped in a security-definer
--     function, even executed as a raw INSERT inside a PL/pgSQL function
--     (bypassing PostgREST's table-write path entirely), and even after a
--     full database restart (rules out stale connection-pool plan cache).
--   - This isolates the fault specifically to Postgres's WITH CHECK
--     OPTIONS evaluation mechanism (used by INSERT and UPDATE's new-row
--     check) on this instance — not to auth.uid(), the policy text, the
--     JWT, or the role. USING-style row filters (SELECT/DELETE/UPDATE's
--     old-row check) are unaffected, matching what trips_select and
--     trips_update (built on user_has_trip_access) already rely on
--     successfully.
--
-- Workaround: stop enforcing ownership via WITH CHECK/USING expressions
-- built on auth.uid() for insert and delete. Force user_id via a BEFORE
-- INSERT trigger instead (a plain function-body read of auth.uid(), the
-- same evaluation shape already proven reliable), and relax the insert
-- policy to `with check (true)` scoped to the authenticated role only —
-- the trigger, not the policy, is what actually guarantees a user can
-- only ever create trips for themselves. For delete, swap the USING
-- clause to a dedicated owner-only security-definer function (the same
-- successful pattern user_has_trip_access already uses for select/update)
-- rather than the direct unwrapped auth.uid() comparison.
-- ============================================================

create or replace function trips_force_owner()
returns trigger
language plpgsql
as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_trips_force_owner on trips;
create trigger trg_trips_force_owner
  before insert on trips
  for each row execute function trips_force_owner();

drop policy if exists trips_insert on trips;
create policy trips_insert on trips for insert to authenticated with check (true);

create or replace function user_owns_trip(p_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from trips where trips.id = p_trip_id and trips.user_id = auth.uid());
$$;

grant execute on function user_owns_trip(uuid) to authenticated;

drop policy if exists trips_delete on trips;
create policy trips_delete on trips for delete using (user_owns_trip(id));
