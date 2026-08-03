# Manifest

Personal travel companion app — trip planning, itinerary, expenses, and
shopping list, built with Expo (React Native + react-native-web) and
Supabase.

## Stack
- Expo Router (file-based routing, shared between web and native)
- Supabase (Postgres + Auth + Storage)
- Hosting: Vercel (web build), EAS Build (Android APK, phase 2)

## Setup

1. `npm install`
2. Create a Supabase project, then run `supabase/schema.sql` in the SQL editor
   (or via `supabase db push` if using the CLI).
3. Copy `.env.example` to `.env` and fill in your Supabase URL + anon key.
4. Create a user for yourself in Supabase Auth (email/password), since
   sign-up isn't exposed in-app — this is a single-user personal tool.
5. `npm run web` to run in the browser, or `npm run start` for Expo Go / a
   dev client.

## Structure

```
app/
  (auth)/login.tsx          — Supabase email/password sign-in
  (tabs)/                   — Trips, Types, Money, Shop tabs
  trip/[tripId]/            — trip day list
  trip/[tripId]/day/[date]  — itinerary for one day
  item/[itemId]/            — full item details (booking source, notes, etc.)
lib/
  supabase.ts               — client setup
  types.ts                  — TS types matching the DB schema
  theme.ts                  — design tokens (see wireframes.html for direction)
supabase/
  schema.sql                — full DB schema, RLS policies, triggers
```

## Status

Scaffolded and wired to real data for: auth, trip list, day list, day
itinerary, item details, item creation (type-picker + per-category forms),
item editing/delete (soft), drag-and-drop reordering, day titles, trip
summary/overview page, lodging check-in/out auto-move, photo upload per item.

Still TODO:
- Money tab (expense entry, split allocations, owed-by-party rollup)
- Shop tab (shopping list, linked to items/expenses)
- Alternatives ("pick one of") UI
- Multi-leg sub-step UI (note: needs its own relationship, since
  parent_item_id is now used for lodging check-in/out linkage too)
- PDF itinerary export
- Trip editing (currently create-only)

See `supabase/schema.sql` comments for the intended app-level logic behind
allocations, lodging spans, timezones, and soft delete.
