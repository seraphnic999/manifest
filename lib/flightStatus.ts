// Live flight status via AeroDataBox (RapidAPI free tier). One lookup per
// manual refresh — this app has no background server component to poll on
// its own, so a stale-until-refreshed card is the deliberate design, not a
// missing feature.
//
// Note: EXPO_PUBLIC_* vars are bundled into the client and are visible to
// anyone who decompiles the APK, same as the existing Supabase anon key.
// That's an acceptable tradeoff for a low-value, quota-limited free-tier
// key on a single-user app; it would not be for a paid/high-value key.

const RAPIDAPI_HOST = "aerodatabox.p.rapidapi.com";
const API_KEY = process.env.EXPO_PUBLIC_AERODATABOX_KEY;

export interface FlightStatusTime {
  utc: string | null;
  local: string | null;
}

export interface FlightStatus {
  flightNumber: string;
  status: string | null; // e.g. "Scheduled", "EnRoute", "Landed", "Cancelled"
  departure: {
    airport: string | null;
    scheduled: FlightStatusTime;
    revised: FlightStatusTime | null;
    terminal: string | null;
    gate: string | null;
  };
  arrival: {
    airport: string | null;
    scheduled: FlightStatusTime;
    revised: FlightStatusTime | null;
    terminal: string | null;
    gate: string | null;
  };
}

function parseTime(t: any): FlightStatusTime {
  return { utc: t?.utc ?? null, local: t?.local ?? null };
}

// AeroDataBox names the "revised" time differently depending on how
// confirmed it is — actualTime once landed/departed, revisedTime once a
// gate-level update exists, predictedTime as an earlier estimate — and
// which of these is present varies per flight. Falls back through all
// three rather than assuming one name, since a real response can use
// either "revisedTime" (seen on departure) or "predictedTime" (seen on
// arrival) for what's conceptually the same "updated time" concept.
function parseBestTime(leg: any): FlightStatusTime | null {
  const t = leg?.actualTime ?? leg?.revisedTime ?? leg?.predictedTime;
  return t ? parseTime(t) : null;
}

/**
 * Looks up a flight by IATA/ICAO number and local departure date
 * (YYYY-MM-DD). Throws if no API key is configured, the flight isn't
 * found, or the request fails.
 */
export async function fetchFlightStatus(flightNumber: string, dateIso: string): Promise<FlightStatus> {
  if (!API_KEY) {
    throw new Error("No AeroDataBox API key configured (EXPO_PUBLIC_AERODATABOX_KEY).");
  }

  const cleaned = flightNumber.replace(/\s+/g, "");
  const url = `https://${RAPIDAPI_HOST}/flights/number/${encodeURIComponent(cleaned)}/${dateIso}`;

  const res = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": API_KEY,
      "X-RapidAPI-Host": RAPIDAPI_HOST,
    },
  });

  if (res.status === 204) {
    throw new Error(`No flight found for ${cleaned} on ${dateIso}.`);
  }
  if (!res.ok) {
    throw new Error(`Flight status lookup failed (${res.status}).`);
  }

  const data = await res.json();
  const flights = Array.isArray(data) ? data : [];
  if (flights.length === 0) {
    throw new Error(`No flight found for ${cleaned} on ${dateIso}.`);
  }

  // Multiple legs can share a flight number across different days /
  // codeshares — take the first, which AeroDataBox orders by relevance.
  const f = flights[0];

  return {
    flightNumber: cleaned,
    status: f.status ?? null,
    departure: {
      airport: f.departure?.airport?.iata ?? f.departure?.airport?.name ?? null,
      scheduled: parseTime(f.departure?.scheduledTime),
      revised: parseBestTime(f.departure),
      terminal: f.departure?.terminal ?? null,
      gate: f.departure?.gate ?? null,
    },
    arrival: {
      airport: f.arrival?.airport?.iata ?? f.arrival?.airport?.name ?? null,
      scheduled: parseTime(f.arrival?.scheduledTime),
      revised: parseBestTime(f.arrival),
      terminal: f.arrival?.terminal ?? null,
      gate: f.arrival?.gate ?? null,
    },
  };
}

export function isFlightStatusConfigured(): boolean {
  return !!API_KEY;
}
