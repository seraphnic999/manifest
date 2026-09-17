-- ============================================================
-- Manifest — Migration 042: synced per-user app settings
-- ============================================================
-- One row per user, holding device-independent preferences (currently just
-- dark_mode) — the same account signed in on a second device should see
-- the same setting without re-toggling it there. lib/ThemeContext.tsx
-- loads this once per app session/sign-in and writes through on every
-- toggle; AsyncStorage still caches the last-known value locally so the
-- app doesn't flash the wrong theme before that one network round trip
-- completes.
-- ============================================================

create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dark_mode boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;

create policy user_settings_owner on user_settings
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger user_settings_set_updated_at
  before update on user_settings
  for each row execute function set_updated_at();
