-- Token generation stays server-side (same reasoning as set_trip_share_pin
-- in migration_046 not letting the client compute a PIN hash itself) —
-- gen_random_uuid() is already the id-generation convention throughout this
-- schema, reused here as a source of randomness rather than adding any
-- client-side crypto/uuid dependency just to mint a share token.
alter table trip_share_links alter column token set default replace(gen_random_uuid()::text, '-', '');

-- Idempotent "start/resume sharing": creates the trip's one share-link row
-- if it doesn't exist yet, or just re-enables it if it was turned off —
-- either way the existing token (if any) is preserved, since turning
-- sharing back on shouldn't silently break a link someone already has.
create or replace function get_or_create_trip_share_link(p_trip_id uuid)
returns trip_share_links
language plpgsql
security invoker
as $$
declare
  result trip_share_links;
begin
  if not user_has_trip_access(p_trip_id) then
    raise exception 'not authorized';
  end if;

  insert into trip_share_links (trip_id)
  values (p_trip_id)
  on conflict (trip_id) do update set enabled = true
  returning * into result;

  return result;
end;
$$;

-- Mints a fresh token on the existing link, invalidating any previously
-- distributed URL. Leaves an existing PIN as-is — rotating the link and
-- clearing the PIN are separate decisions.
create or replace function regenerate_trip_share_token(p_trip_id uuid)
returns trip_share_links
language plpgsql
security invoker
as $$
declare
  result trip_share_links;
begin
  if not user_has_trip_access(p_trip_id) then
    raise exception 'not authorized';
  end if;

  update trip_share_links
  set token = replace(gen_random_uuid()::text, '-', '')
  where trip_id = p_trip_id
  returning * into result;

  if result.id is null then
    raise exception 'no share link exists for this trip';
  end if;

  return result;
end;
$$;
