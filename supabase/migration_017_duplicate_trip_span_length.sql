-- Duplicate trip, v3: lets a lodging stay span's check-out move
-- independently of check-in, instead of always preserving the source
-- span's exact duration. Previously, duplicating into a shorter trip than
-- the stay's own length made it impossible to place at all — the day
-- picker only offered a check-in date and always added the original
-- duration, so nothing fit. item_selections rows now carry an optional
-- target_end_date; when present (day_id-null / stay-span items only), it
-- wins over the duration-preserving default.

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
  target_end_date date;
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

  create temporary table dup_id_map (old_id uuid primary key, new_id uuid not null) on commit drop;

  for sel in select * from jsonb_array_elements(item_selections)
  loop
    select * into src_item from items
      where id = (sel->>'item_id')::uuid and trip_id = source_trip_id and deleted_at is null;
    if not found then
      continue;
    end if;

    target_date := nullif(sel->>'target_date', '')::date;
    target_end_date := nullif(sel->>'target_end_date', '')::date;

    if src_item.day_id is null then
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

    item_start := case when src_item.start_date is not null then target_date else null end;
    item_end := case
      when src_item.day_id is null and target_end_date is not null then target_end_date
      when src_item.end_date is not null and src_item.start_date is not null
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
