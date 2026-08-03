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
itinerary, item details. Still TODO (placeholders in place):
- Types tab (flights-only / lodging-only views)
- Money tab (expense entry, split allocations, owed-by-party rollup)
- Shop tab (shopping list, linked to items/expenses)
- Item creation/editing forms
- Alternatives ("pick one of") UI
- Multi-leg sub-step UI
- Photo upload (Supabase Storage) per item
- PDF itinerary export
- Trip creation form (currency list, parties, timezone)

See `supabase/schema.sql` comments for the intended app-level logic behind
allocations, lodging spans, timezones, and soft delete.
