-- Extends generate_trip_days() (unchanged trigger wiring) to write an
-- explicit color onto every day row it creates, instead of leaving that to
-- always be computed client-side. The palette matches lib/dayColors.ts's
-- AUTO_DAY_COLORS exactly and must be kept in sync with it by hand.
create or replace function generate_trip_days()
returns trigger as $$
declare
  d date;
  next_order int;
  palette text[] := array[
    '#A52714', '#0F9D58', '#F9A825', '#9C27B0', '#880E4F', '#01579B',
    '#006064', '#4E342E', '#E65100', '#1A237E', '#558B2F', '#817717', '#757575'
  ];
begin
  -- On insert, or when dates change on update, create any missing day
  -- rows spanning start_date..end_date. Existing days (and their items)
  -- are left untouched; this only fills in gaps.
  select coalesce(max(sort_order), -1) + 1 into next_order
    from days where trip_id = new.id;

  for d in select generate_series(new.start_date, new.end_date, interval '1 day')::date loop
    insert into days (trip_id, date, sort_order, color)
    values (new.id, d, next_order, palette[(next_order % array_length(palette, 1)) + 1])
    on conflict (trip_id, date) do nothing;
    next_order := next_order + 1;
  end loop;

  -- Every trip also gets one no-date "Proposals" day, sorted last, with
  -- the app's "light blue" accent as its default map color.
  insert into days (trip_id, date, theme, sort_order, color)
  values (new.id, null, 'Proposals', 999999, '#3E82D6')
  on conflict (trip_id) where date is null do nothing;

  return new;
end;
$$ language plpgsql;
