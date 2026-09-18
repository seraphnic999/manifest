// Manifest — share-trip-data Edge Function
//
// Backs the public, unauthenticated /share/<token> page: given a share
// token (and an optional PIN, if the link has one set), returns one curated
// JSON payload of exactly what a read-only guest should see — the trip,
// its days, non-private items, weather (server-cached, see below), map
// routes, and any flight_status rows for this trip's flight items.
//
// Deliberately does NOT touch companions, travel_documents,
// document_expiry_alerts, entry_requirement_warnings/checks, expenses,
// packing_items, shopping_list_items, trip_companions, or trip_shares (the
// unrelated invite-a-collaborator-by-email feature) — none of that is ever
// queried here, so there's nothing to accidentally leak.
//
// Deployed with verify_jwt: false — like every public share-link product,
// the token in the URL *is* the credential. A PIN, if the link has one, is
// a second factor checked here against a stored SHA-256 hash (see
// migration_046's set_trip_share_pin()) — the plaintext PIN is never
// persisted anywhere.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Json = Record<string, any>;

// Booking admin, not itinerary info a guest needs — stripped from every
// item before it leaves this function. reminder_* are this app-owner's own
// notification settings, meaningless (and slightly odd) to show a guest.
const STRIPPED_ITEM_FIELDS = ["confirmation_code", "booking_source", "reminder_minutes_before", "reminder_sent_at"];

const WEATHER_CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours — Open-Meteo forecasts don't move fast enough to need fresher than this for a shared read-only view.
const WEATHER_DAYS = 6;

function jsonResponse(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function sha256Hex(s: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cityKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

// Falls back to a stale cache row (rather than failing the whole page) if
// Open-Meteo itself errors — a shared trip view showing yesterday's
// forecast is far better than one that 500s because a free weather API
// hiccupped.
async function fetchWeather(supabase: Json, lat: number, lon: number): Promise<Json | null> {
  const key = cityKey(lat, lon);
  const { data: cached } = await supabase.from("weather_share_cache").select("payload, fetched_at").eq("city_key", key).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < WEATHER_CACHE_TTL_MS) {
    return cached.payload;
  }
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&forecast_days=${WEATHER_DAYS}&timezone=auto`
    );
    if (!res.ok) return cached?.payload ?? null;
    const payload = await res.json();
    await supabase.from("weather_share_cache").upsert({ city_key: key, payload, fetched_at: new Date().toISOString() });
    return payload;
  } catch {
    return cached?.payload ?? null;
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let token: string | null = url.searchParams.get("token");
  let pin: string | null = url.searchParams.get("pin");
  if (req.method === "POST") {
    try {
      const body = await req.json();
      token = token ?? body?.token ?? null;
      pin = pin ?? body?.pin ?? null;
    } catch { /* query-string values (if any) stand */ }
  }

  if (!token) return jsonResponse({ error: "token is required" }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: link } = await supabase.from("trip_share_links").select("*").eq("token", token).maybeSingle();
  if (!link || !link.enabled) return jsonResponse({ error: "not_found" }, 404);

  if (link.pin_hash) {
    const suppliedHash = pin ? await sha256Hex(pin) : null;
    if (suppliedHash !== link.pin_hash) return jsonResponse({ pin_required: true });
  }

  const { data: trip, error: tripError } = await supabase
    .from("trips").select("id, name, type, start_date, end_date, cover_photo_id, destinations, latitude, longitude")
    .eq("id", link.trip_id).single();
  if (tripError || !trip) return jsonResponse({ error: "not_found" }, 404);

  const [{ data: days }, { data: itemsRaw }, { data: tripCities }, { data: routes }] = await Promise.all([
    supabase.from("days").select("id, trip_id, date, theme, color, sort_order, city_id, custom_city_name").eq("trip_id", link.trip_id).order("sort_order"),
    supabase.from("items").select("*").eq("trip_id", link.trip_id).eq("is_private", false).is("deleted_at", null).order("sort_order"),
    supabase.from("trip_cities").select("*, city:cities(*)").eq("trip_id", link.trip_id).order("sort_order"),
    supabase.from("map_routes").select("*").eq("trip_id", link.trip_id).is("deleted_at", null).order("sort_order"),
  ]);

  const items = (itemsRaw ?? []).map((it: Json) => {
    const clean = { ...it };
    for (const f of STRIPPED_ITEM_FIELDS) delete clean[f];
    return clean;
  });

  // One forecast per distinct real location among trip_cities — a picked
  // city uses its own lat/lon, a custom destination uses whatever lat/lon
  // was geocoded for it (see lib/cities.ts geocodeCustomDestination); rows
  // with neither (never geocoded) are silently skipped, same as the map.
  // country_code "ZZ" is "At Sea" (migration_036) — a placeholder (0,0)
  // location, not a real place to fetch a forecast for (same exclusion as
  // check-entry-requirements).
  const seenKeys = new Set<string>();
  const weather: Json[] = [];
  for (const tc of tripCities ?? []) {
    if (tc.city?.country_code === "ZZ") continue;
    const lat = tc.city?.latitude ?? tc.latitude;
    const lon = tc.city?.longitude ?? tc.longitude;
    if (lat == null || lon == null) continue;
    const key = cityKey(lat, lon);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const forecast = await fetchWeather(supabase, lat, lon);
    weather.push({ label: tc.city?.name ?? tc.custom_name, country: tc.city?.country ?? null, latitude: lat, longitude: lon, forecast });
  }

  const flightItemIds = items.filter((i: Json) => i.type === "flight").map((i: Json) => i.id);
  const { data: flightStatuses } = flightItemIds.length > 0
    ? await supabase.from("flight_status").select("*").in("item_id", flightItemIds)
    : { data: [] as Json[] };

  return jsonResponse({
    trip,
    days: days ?? [],
    items,
    trip_cities: tripCities ?? [],
    routes: routes ?? [],
    weather,
    flight_statuses: flightStatuses ?? [],
  });
});
