-- ============================================================
-- Manifest — Migration 011: replace trip_places with a "Proposals" day
-- ============================================================
-- Every trip gets one special day row with date = null, theme =
-- 'Proposals', sorted after every real day (sort_order 999999). It holds
-- ordinary items with no day/date — "promoting" one is just editing its
-- date to move it to a real day, reusing the exact move-to-day logic
-- item edit already has. This replaces the separate trip_places table.
-- ============================================================

-- ---- 1. Allow a day with no date ----------------------------------------

alter table days alter column date drop not null;

-- At most one no-date "Proposals" day per trip.
create unique index days_one_proposals_per_trip on days(trip_id) where date is null;

-- ---- 2. Extend the day-generation trigger to also create it ------------

create or replace function generate_trip_days()
returns trigger as $$
declare
  d date;
  next_order int;
begin
  select coalesce(max(sort_order), -1) + 1 into next_order
    from days where trip_id = new.id;

  for d in select generate_series(new.start_date, new.end_date, interval '1 day')::date loop
    insert into days (trip_id, date, sort_order)
    values (new.id, d, next_order)
    on conflict (trip_id, date) do nothing;
    next_order := next_order + 1;
  end loop;

  insert into days (trip_id, date, theme, sort_order)
  values (new.id, null, 'Proposals', 999999)
  on conflict (trip_id) where date is null do nothing;

  return new;
end;
$$ language plpgsql;

-- ---- 3. Backfill a Proposals day for every existing trip ----------------

insert into days (trip_id, date, theme, sort_order)
select id, null, 'Proposals', 999999 from trips
where deleted_at is null
on conflict (trip_id) where date is null do nothing;

-- ---- 4. Migrate trip_places rows into items under each trip's Proposals day

insert into items (trip_id, day_id, type, title, status, latitude, longitude, sort_order, custom_fields)
select
  tp.trip_id,
  d.id,
  case tp.category
    when 'Restaurant'  then 'meal'
    when 'Bar'         then 'bar'
    when 'Museum'      then 'sightseeing'
    when 'Market'      then 'sightseeing'
    when 'Shop'        then 'shopping'
    when 'Café'        then 'shopping'
    when 'Patisserie'  then 'shopping'
    else 'other'
  end::item_type,
  tp.name,
  'optional',
  tp.latitude,
  tp.longitude,
  row_number() over (partition by tp.trip_id order by tp.name) * 100,
  '{}'
from trip_places tp
join days d on d.trip_id = tp.trip_id and d.date is null
where tp.deleted_at is null;

-- Carry the descriptive text (address/hours) over as a quick note, since
-- items.notes is a deprecated dead column the app no longer reads.
insert into item_quick_notes (item_id, text, sort_order)
select i.id, tp.notes, 0
from trip_places tp
join days d on d.trip_id = tp.trip_id and d.date is null
join items i on i.day_id = d.id and i.title = tp.name
where tp.deleted_at is null and tp.notes is not null;

-- ---- 5. Drop the now-superseded trip_places table -----------------------

drop table trip_places;
