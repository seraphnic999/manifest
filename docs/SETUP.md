# Manifest — Setup, Deploy & Test Guide

## 1. Create the Supabase project (the database)

1. Go to https://supabase.com, sign in, **New project**.
2. Pick a name (e.g. `manifest`), a database password (save it somewhere —
   you won't need it day-to-day, but you'll want it if you ever connect
   directly via `psql`), and a region close to you.
3. Wait for provisioning (~2 minutes).

### Run the schema
4. In the Supabase dashboard: **SQL Editor** → **New query**.
5. Open `supabase/schema.sql` from the repo, paste the whole thing in, **Run**.
   This creates every table, enum, index, trigger, RLS policy, and the
   `item-photos` storage bucket.
6. You should see "Success. No rows returned." If something errors, the
   most likely cause is running it twice — most statements are safe to
   re-run (`on conflict do nothing` / `create or replace`), but `create
   type` and `create table` are not; drop the conflicting object first or
   start a fresh project.

### Create yourself a user
7. **Authentication** → **Users** → **Add user** → **Create new user**.
   Enter an email and password (this is the login you'll use in the app —
   there's no public sign-up screen, it's a single-user personal tool).
8. Click into the user you just created and copy the **UUID** shown at the
   top — you'll need it in the next step.

### Load the Barcelona test itinerary (optional but recommended)
9. Open `supabase/seed_barcelona.sql`, replace `PASTE-YOUR-USER-ID-HERE`
   with the UUID from step 8.
10. Paste the whole script into a new SQL Editor query, **Run**. This
    creates the full 12-day trip — flights, both lodging stays with
    auto-linked check-in/out, every activity/meal/transport item, correct
    statuses (optional/idea/pending where the original notes implied it),
    and the EUR currency alongside NIS.
11. Sanity check: **Table Editor** → `trips` should show one row named
    "Barcelona & Cruise"; `items` should show ~80 rows.

### Get your API credentials
12. **Project Settings** → **API**. Copy the **Project URL** and the
    **anon/public key** (not the service_role key — never put that one in
    the app).

## 2. Run it locally

1. Clone the repo:
   ```
   git clone https://github.com/seraphnic999/manifest.git
   cd manifest
   ```
2. `npm install`
3. Copy the env template and fill it in:
   ```
   cp .env.example .env
   ```
   Edit `.env`:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```
4. Run in the browser:
   ```
   npm run web
   ```
   This opens `http://localhost:8081` (or similar — the terminal tells you
   the exact port). Log in with the email/password you created in step 7
   above. You should land on the trip list and see "Barcelona & Cruise" if
   you ran the seed script.
5. To test on your phone via Expo Go instead of the browser:
   ```
   npm run start
   ```
   Scan the QR code with the **Expo Go** app (install it from the Play
   Store first). Your phone and computer need to be on the same Wi-Fi
   network. Note: `expo-image-picker` and the native date/time pickers
   need a real device or simulator — some things won't behave identically
   in a browser tab vs. Expo Go, so it's worth checking both.

## 3. Deploy the web app

### Option A — Vercel (recommended for the web build)
1. Push any local changes to GitHub first (`git push`).
2. Go to https://vercel.com, sign in with GitHub, **Add New → Project**,
   import `seraphnic999/manifest`.
3. Vercel will try to auto-detect the framework — Expo's static web output
   isn't one of its built-in presets, so set these manually under
   **Build & Development Settings**:
   - **Build Command**: `npx expo export --platform web`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
4. Add the two environment variables from your `.env` (Project Settings →
   Environment Variables): `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_ANON_KEY`. These need the `EXPO_PUBLIC_` prefix
   to be bundled into the client build — Expo's convention, not Vercel's.
5. **Deploy**. Every push to `main` redeploys automatically after this.

### Option B — Railway (alternative)
1. https://railway.app → **New Project** → **Deploy from GitHub repo** →
   pick `manifest`.
2. Railway needs an explicit start command since there's no server here —
   simplest is a static file serve. Add a `serve` script, or set:
   - **Build Command**: `npm install && npx expo export --platform web`
   - **Start Command**: `npx serve dist -s -l $PORT`
     (this needs the `serve` package — add it as a dependency, or Railway
     will fail to find it: `npm install serve`)
3. Add the same two `EXPO_PUBLIC_*` environment variables as above.
4. Deploy.

Either option gives you a URL you can open from any browser, on any
device — this is your "access from anywhere" web version.

## 4. What's NOT deployed yet

- **Android APK** (phase 2, per the original plan) — building that is a
  separate step via EAS Build (`eas build --platform android`), not part
  of this web deploy. We haven't set up an Expo/EAS account or the native
  build config for that yet.
- **Storage bucket policies** only take effect once `schema.sql` has been
  run against your specific project — if you skipped that or ran an older
  version of it before the photo-upload work was added, re-run just the
  "Storage: item photo files" section at the bottom of `schema.sql`.

## 5. Suggested test pass

With the Barcelona trip loaded, good things to click through:
- Trip Overview: flights, lodging, days list, Money card, Shopping link
- A day with the lodging banner (05/08 or 09/08) — confirm the "STAY" row
  and separate check-in/out items both show up correctly
- Drag-reorder a couple of items on one day
- Edit an item, add a photo to it
- Add an expense linked to an item, then a split expense (e.g. simulate a
  duty-free-style purchase) with a party and a shopping list item
- Add a shopping list item linked to an activity, mark it bought via the
  expense flow, confirm it shows as bought in both the Shopping screen and
  on that item's details page
