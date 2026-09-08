-- Global search across trips, items, shopping list, and expenses — one
-- function, one round trip, rather than four separate client-side queries.
-- Plain `ilike` scans (no trigram/full-text index): at this app's single-
-- user data scale (low hundreds of rows per table at most) that's plenty
-- fast, and adding pg_trgm now would be solving a problem that doesn't
-- exist yet. Archived trips (deleted_at set) are excluded throughout,
-- matching "not on the main dashboard" — Archived Trips has its own list.
--
-- security invoker (the default for a plain function) — runs as the
-- calling user, so every branch is still filtered by that table's own RLS
-- policy, the same as if the client had queried each table directly.

create or replace function search_everything(query text)
returns table (
  kind text,        -- 'trip' | 'item' | 'shopping' | 'expense'
  id uuid,
  trip_id uuid,
  trip_name text,
  title text,
  subtitle text
)
language sql
stable
as $$
  select 'trip', t.id, t.id, t.name, t.name,
    to_char(t.start_date, 'DD Mon YYYY') || ' – ' || to_char(t.end_date, 'DD Mon YYYY')
  from trips t
  where t.deleted_at is null and t.name ilike '%' || query || '%'

  union all
  select 'item', i.id, i.trip_id, t.name, i.title,
    coalesce(nullif(i.address, ''), nullif(i.vendor, ''), '')
  from items i
  join trips t on t.id = i.trip_id
  where i.deleted_at is null and t.deleted_at is null
    and (i.title ilike '%' || query || '%'
         or i.address ilike '%' || query || '%'
         or i.vendor ilike '%' || query || '%')

  union all
  select 'shopping', s.id, s.trip_id, t.name, s.name, coalesce(s.note, '')
  from shopping_list_items s
  join trips t on t.id = s.trip_id
  where t.deleted_at is null and s.name ilike '%' || query || '%'

  union all
  select 'expense', e.id, e.trip_id, t.name, coalesce(nullif(e.note, ''), initcap(e.type::text)),
    e.amount::text || ' ' || e.currency_code
  from expenses e
  join trips t on t.id = e.trip_id
  where t.deleted_at is null and e.note ilike '%' || query || '%'

  limit 50;
$$;

grant execute on function search_everything(text) to authenticated;
