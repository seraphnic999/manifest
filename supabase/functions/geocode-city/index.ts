// Manifest — geocode-city Edge Function
//
// Looks up coordinates for a free-text destination name (a trip's
// custom-named city, not one of the built-in `cities` rows, which already
// carry their own lat/lng). Backs the travel-stats world map, which needs
// coordinates for every destination to place a pin.
//
// Uses OpenStreetMap's Nominatim — free, no API key, no billing — since this
// is a low-volume, best-effort lookup (a handful of custom names per trip
// edit), not a bulk geocoding workload. Their usage policy just asks for an
// identifying User-Agent and no more than ~1 request/second, both satisfied
// by how this is called (one name at a time, from the trip city picker).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Manifest-TravelApp/1.0 (+https://github.com/seraphnic999/manifest)";

Deno.serve(async (req) => {
  let name: string | undefined;
  try {
    const body = await req.json();
    name = body?.name;
  } catch { /* fall through */ }
  if (!name || typeof name !== "string" || !name.trim()) {
    return new Response(JSON.stringify({ error: "name is required" }), { status: 400 });
  }

  try {
    const url = `${NOMINATIM_URL}?q=${encodeURIComponent(name.trim())}&format=json&limit=1`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Nominatim ${res.status}` }), { status: 502 });
    }
    const results = await res.json();
    const hit = Array.isArray(results) ? results[0] : null;
    if (!hit) {
      return new Response(JSON.stringify({ latitude: null, longitude: null }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({ latitude: Number(hit.lat), longitude: Number(hit.lon) }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e instanceof Error ? e.message : e).slice(0, 300) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});
