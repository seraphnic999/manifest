// Shared types/helpers for the public /share/[token] route group — split
// out of the original single-file page so the Overview, Day-detail, and Map
// screens (and their shared _layout.tsx, which owns the one payload fetch)
// can all import the same shapes without re-declaring them.
import { Day, Trip, ItemType, ItemStatus, MapRoute } from "./types";
import { DestinationForecast } from "./weather";
import { FlightStatusRow } from "./flightStatus";
import { TripCityRow } from "./cities";

const SHARE_ENDPOINT = "https://yvqptrjxbptloucyuubm.supabase.co/functions/v1/share-trip-data";

// Same shape as Item, minus the four fields the Edge Function strips before
// this ever leaves the server (confirmation_code, booking_source, and the
// app-owner's own reminder settings) — see STRIPPED_ITEM_FIELDS there.
export interface PublicItem {
  id: string; day_id: string | null; trip_id: string; parent_item_id: string | null;
  type: ItemType; title: string; start_date: string | null; end_date: string | null;
  time_start: string | null; time_end: string | null; status: ItemStatus; is_stay_span: boolean;
  notes: string | null; address: string | null; phone: string | null; vendor: string | null;
  link: string | null; google_maps_link: string | null; sort_order: number;
  latitude: number | null; longitude: number | null; map_icon: string | null;
  custom_fields: Record<string, unknown>; keeper_id: string | null; is_private: boolean;
}

export interface WeatherEntry { label: string; country: string | null; latitude: number; longitude: number; forecast: any }

export interface SharePayload {
  trip: Trip;
  days: Day[];
  items: PublicItem[];
  trip_cities: TripCityRow[];
  routes: MapRoute[];
  weather: WeatherEntry[];
  flight_statuses: FlightStatusRow[];
}

export const STATUS_LABEL: Record<ItemStatus, string> = { planned: "Planned", booked: "Booked", optional: "Optional" };

export function transformForecasts(weather: WeatherEntry[]): DestinationForecast[] {
  return weather
    .filter((w) => w.forecast?.daily?.time)
    .map((w) => ({
      destination: w.label,
      days: w.forecast.daily.time.map((date: string, i: number) => ({
        date,
        weatherCode: w.forecast.daily.weathercode[i],
        tempMax: w.forecast.daily.temperature_2m_max[i],
        tempMin: w.forecast.daily.temperature_2m_min[i],
        precipProb: w.forecast.daily.precipitation_probability_max?.[i] ?? null,
      })),
    }));
}

function sessionPinKey(token: string) { return `manifest_share_pin_${token}`; }

// The one payload fetch for the whole /share/[token] route group — lives
// here (rather than duplicated per screen) so [token]/_layout.tsx can own
// it once and hand the result to every child screen via context.
export async function fetchSharePayload(
  token: string, pin?: string
): Promise<
  | { kind: "ok"; payload: SharePayload }
  | { kind: "pin_required"; wrongPin: boolean }
  | { kind: "not_found" }
> {
  try {
    const url = new URL(SHARE_ENDPOINT);
    url.searchParams.set("token", token);
    if (pin) url.searchParams.set("pin", pin);
    const res = await fetch(url.toString());
    const data = await res.json();
    if (data?.error) return { kind: "not_found" };
    if (data?.pin_required) return { kind: "pin_required", wrongPin: !!pin };
    if (pin) {
      try { window.sessionStorage?.setItem(sessionPinKey(token), pin); } catch { /* private browsing, etc. — just re-prompts next load */ }
    }
    return { kind: "ok", payload: data as SharePayload };
  } catch {
    return { kind: "not_found" };
  }
}

export function readStoredPin(token: string): string | undefined {
  try { return window.sessionStorage?.getItem(sessionPinKey(token)) ?? undefined; } catch { return undefined; }
}
