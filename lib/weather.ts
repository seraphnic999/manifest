// Weather forecast via Open-Meteo — free, keyless, no signup (geocoding and
// forecast are two separate free endpoints from the same provider). Cached
// locally through TanStack Query's normal staleTime mechanism (see
// components/WeatherCarousel.tsx) rather than anything bespoke here.

export interface DayForecast {
  date: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipProb: number | null;
}

export interface DestinationForecast {
  destination: string;
  days: DayForecast[];
}

interface WeatherMeta {
  icon: string; // Ionicons name
  label: string;
}

// Same WMO code ranges as weatherMeta below, mapped to the generated icon
// set's own 7 weather glyphs instead of an Ionicons name.
export function weatherIconName(code: number): "weatherSunny" | "weatherPartlyCloudy" | "weatherCloudy" | "weatherWindy" | "weatherRainy" | "weatherSnowy" | "weatherThunderstorm" {
  if (code === 0) return "weatherSunny";
  if (code <= 2) return "weatherPartlyCloudy";
  if (code === 3 || code === 45 || code === 48) return "weatherCloudy";
  if (code >= 51 && code <= 67) return "weatherRainy";
  if (code >= 80 && code <= 82) return "weatherRainy";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "weatherSnowy";
  if (code >= 95) return "weatherThunderstorm";
  return "weatherPartlyCloudy";
}

// WMO weather codes, as returned by Open-Meteo's `weathercode` field.
export function weatherMeta(code: number): WeatherMeta {
  if (code === 0) return { icon: "sunny-outline", label: "Clear" };
  if (code <= 2) return { icon: "partly-sunny-outline", label: "Partly cloudy" };
  if (code === 3) return { icon: "cloudy-outline", label: "Overcast" };
  if (code === 45 || code === 48) return { icon: "cloud-outline", label: "Fog" };
  if (code >= 51 && code <= 57) return { icon: "rainy-outline", label: "Drizzle" };
  if (code >= 61 && code <= 67) return { icon: "rainy-outline", label: "Rain" };
  if (code >= 80 && code <= 82) return { icon: "rainy-outline", label: "Showers" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: "snow-outline", label: "Snow" };
  if (code >= 95) return { icon: "thunderstorm-outline", label: "Thunderstorm" };
  return { icon: "partly-sunny-outline", label: "—" };
}

async function geocodeDestination(name: string): Promise<{ lat: number; lon: number } | null> {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1`);
  if (!res.ok) return null;
  const data = await res.json();
  const first = data?.results?.[0];
  if (!first) return null;
  return { lat: first.latitude, lon: first.longitude };
}

/** Today plus the next 3 days for one destination. Returns null (rather than
 * throwing) if the destination can't be geocoded or the forecast fails —
 * one bad destination string shouldn't break the whole carousel. */
export async function fetchDestinationForecast(destination: string): Promise<DestinationForecast | null> {
  try {
    const coords = await geocodeDestination(destination);
    if (!coords) return null;

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
      `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=4`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const daily = data?.daily;
    if (!daily?.time) return null;

    const days: DayForecast[] = daily.time.map((date: string, i: number) => ({
      date,
      weatherCode: daily.weathercode[i],
      tempMax: daily.temperature_2m_max[i],
      tempMin: daily.temperature_2m_min[i],
      precipProb: daily.precipitation_probability_max?.[i] ?? null,
    }));

    return { destination, days };
  } catch {
    return null;
  }
}

export async function fetchTripForecasts(destinations: string[]): Promise<DestinationForecast[]> {
  const results = await Promise.all(destinations.map(fetchDestinationForecast));
  return results.filter((r): r is DestinationForecast => r !== null);
}
