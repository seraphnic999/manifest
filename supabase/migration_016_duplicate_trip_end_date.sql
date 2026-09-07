-- Duplicate trip, v2: the client now picks the new trip's end date
-- independently of the source trip's length (not just a start date with
-- length copied over), and sends an explicit target_date per selected
-- item computed by mapping day 1 -> day 1, day 2 -> day 2, etc. Items that
-- would fall past the new trip's last day arrive here with target_date
-- already null (the client requires the user to resolve those before
-- calling this at all) — this function trusts what it's given rather than
-- re-deriving or clamping anything itself.
--
-- Also now handles day_id-null items (the lodging "stay" span itself,
-- which spans a date range rather than sitting on one day) — previously
-- silently dropped by the client's item list entirely.

drop function if exists duplicate_trip(uuid, date, jsonb);

create or replace function duplicate_trip(
  source_trip_id uuid,
  new_start_date date,
  new_end_date date,
  item_selections jsonb
) returns uuid
language plpgsql
as $$
declare
  src trips%rowtype;
  new_trip_id uuid;
  sel jsonb;
  src_item items%rowtype;
  new_day_id uuid;
  target_date date;
  new_item_id uuid;
  item_start date;
  item_end date;
begin
  select * into src from trips where id = source_trip_id and deleted_at is null;
  if not found then
    raise exception 'source trip % not found', source_trip_id;
  end if;

  if new_end_date < new_start_date then
    raise exception 'new_end_date must be on or after new_start_date';
  end if;

  insert into trips (name, start_date, end_date, type, destinations, default_timezone, custom_fields)
  values (src.name, new_start_date, new_end_date, src.type, src.destinations, src.default_timezone, src.custom_fields)
  returning id into new_trip_id;
  -- trg_trips_generate_days fires here, creating every day in the new
  -- range plus the Proposals day.

  create temporary table dup_id_map (old_id uuid primary key, new_id uuid not null) on commit drop;

  for sel in select * from jsonb_array_elements(item_selections)
  loop
    select * into src_item from items
      where id = (sel->>'item_id')::uuid and trip_id = source_trip_id and deleted_at is null;
    if not found then
      continue;
    end if;

    target_date := nullif(sel->>'target_date', '')::date;

    if src_item.day_id is null then
      -- Trip-level / multi-day item (the lodging stay span): not tied to
      -- any day row, and there's no dateless "Proposals" resting place
      -- that makes sense for a date range, so a null target just means
      -- skip it — the client never actually sends null here for these.
      if target_date is null then
        continue;
      end if;
      new_day_id := null;
    else
      select id into new_day_id from days
        where trip_id = new_trip_id and date is not distinct from target_date;

      if new_day_id is null then
        insert into days (trip_id, date, sort_order)
        values (new_trip_id, target_date, (select coalesce(max(sort_order), 0) + 1 from days where trip_id = new_trip_id))
        returning id into new_day_id;
      end if;
    end if;

    -- start_date/end_date shift with the item's day (kept in lockstep with
    -- day_id for ordinary items; for the stay span this IS its check-in/
    -- check-out range) — preserving the original span length rather than
    -- assuming a single global offset, so a manually-reassigned item keeps
    -- its own duration intact.
    item_start := case when src_item.start_date is not null then target_date else null end;
    item_end := case when src_item.end_date is not null and src_item.start_date is not null
      then target_date + (src_item.end_date - src_item.start_date)
      else src_item.end_date end;

    insert into items (
      day_id, trip_id, type, title, start_date, end_date, time_start, time_end,
      timezone_start, timezone_end, custom_fields, status, is_stay_span,
      address, phone, vendor, link, google_maps_link, sort_order,
      latitude, longitude, reminder_minutes_before
    ) values (
      new_day_id, new_trip_id, src_item.type, src_item.title, item_start, item_end,
      src_item.time_start, src_item.time_end, src_item.timezone_start, src_item.timezone_end,
      src_item.custom_fields, src_item.status, src_item.is_stay_span,
      src_item.address, src_item.phone, src_item.vendor, src_item.link, src_item.google_maps_link,
      src_item.sort_order, src_item.latitude, src_item.longitude, src_item.reminder_minutes_before
    )
    returning id into new_item_id;

    insert into dup_id_map values (src_item.id, new_item_id);
  end loop;

  update items ni
  set parent_item_id = pm.new_id
  from dup_id_map sm
  join items si on si.id = sm.old_id
  join dup_id_map pm on pm.old_id = si.parent_item_id
  where ni.id = sm.new_id;

  return new_trip_id;
end;
$$;

grant execute on function duplicate_trip(uuid, date, date, jsonb) to authenticated;
