-- Duplicate a trip, selecting which items carry over and onto which day.
-- The client sends item_selections as a jsonb array of
-- {"item_id": uuid, "target_date": date | null} (null target_date = the
-- new trip's Proposals day). Only listed items are copied; everything not
-- selected is simply absent from the new trip.
--
-- Deliberately excluded from every copied item, per product decision (see
-- the Departures Board "DUPE" writeup): confirmation_code, booking_source,
-- notes, item_photos, file attachments, reminder_sent_at (a new instance
-- hasn't fired one yet). Also not copied: shopping_list_items, expenses,
-- map_routes, item_quick_notes, item_links, alt_group_id — none of these
-- were asked for, and alt_group_id in particular would otherwise link a
-- freshly copied item back into its *source* trip's "pick one of" group.
--
-- parent_item_id (flight-leg / stay check-in-check-out linkage) is
-- preserved only when both the parent and the child item are selected;
-- otherwise the copied child simply loses that link, since there's no
-- sensible parent to point it at in the new trip.

create or replace function duplicate_trip(
  source_trip_id uuid,
  new_start_date date,
  item_selections jsonb
) returns uuid
language plpgsql
as $$
declare
  src trips%rowtype;
  new_trip_id uuid;
  date_offset int;
  sel jsonb;
  src_item items%rowtype;
  new_day_id uuid;
  target_date date;
  new_item_id uuid;
begin
  select * into src from trips where id = source_trip_id and deleted_at is null;
  if not found then
    raise exception 'source trip % not found', source_trip_id;
  end if;

  date_offset := new_start_date - src.start_date;

  insert into trips (name, start_date, end_date, type, destinations, default_timezone, custom_fields)
  values (src.name, new_start_date, src.end_date + date_offset, src.type, src.destinations, src.default_timezone, src.custom_fields)
  returning id into new_trip_id;
  -- trg_trips_generate_days fires here, creating every day in range plus
  -- the one no-date Proposals day — nothing else needs to create days.

  create temporary table dup_id_map (old_id uuid primary key, new_id uuid not null) on commit drop;

  for sel in select * from jsonb_array_elements(item_selections)
  loop
    select * into src_item from items
      where id = (sel->>'item_id')::uuid and trip_id = source_trip_id and deleted_at is null;
    if not found then
      continue;
    end if;

    target_date := nullif(sel->>'target_date', '')::date;

    select id into new_day_id from days
      where trip_id = new_trip_id and date is not distinct from target_date;

    if new_day_id is null then
      -- target date fell outside the generated range (item moved past the
      -- new trip's end, say) — add the extra day rather than drop the item.
      insert into days (trip_id, date, sort_order)
      values (new_trip_id, target_date, (select coalesce(max(sort_order), 0) + 1 from days where trip_id = new_trip_id))
      returning id into new_day_id;
    end if;

    insert into items (
      day_id, trip_id, type, title, start_date, end_date, time_start, time_end,
      timezone_start, timezone_end, custom_fields, status, is_stay_span,
      address, phone, vendor, link, google_maps_link, sort_order,
      latitude, longitude, reminder_minutes_before
    ) values (
      new_day_id, new_trip_id, src_item.type, src_item.title,
      case when src_item.start_date is null then null else src_item.start_date + date_offset end,
      case when src_item.end_date is null then null else src_item.end_date + date_offset end,
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

grant execute on function duplicate_trip(uuid, date, jsonb) to authenticated;
