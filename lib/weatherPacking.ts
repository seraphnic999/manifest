// Weather-aware packing suggestions — pure threshold rules over the same
// Open-Meteo forecast the trip overview's WeatherCarousel already fetches
// (see lib/weather.ts). No LLM call: this is a lookup table, not research.
//
// Open-Meteo's free forecast only reaches ~4 days ahead, so this is only
// ever "available" once a trip's date range actually overlaps that window —
// for anything further out there's simply no forecast to suggest from yet.
import { DayForecast, DestinationForecast } from "./weather";

export interface WeatherPackingSuggestion {
  name: string;
  category: string;
  reason: string;
}

export interface WeatherPackingResult {
  available: boolean;
  unavailableReason: string | null;
  suggestions: WeatherPackingSuggestion[];
  summary: string | null;
}

const SNOW_CODES = new Set([71, 72, 73, 74, 75, 76, 77, 85, 86]);

export function computeWeatherPackingSuggestions(
  trip: { start_date: string | null; end_date: string | null },
  forecasts: DestinationForecast[]
): WeatherPackingResult {
  if (!trip.start_date || !trip.end_date) {
    return { available: false, unavailableReason: "This trip doesn't have dates set yet.", suggestions: [], summary: null };
  }

  const overlapping: DayForecast[] = [];
  for (const dest of forecasts) {
    for (const day of dest.days) {
      if (day.date >= trip.start_date && day.date <= trip.end_date) overlapping.push(day);
    }
  }
  if (overlapping.length === 0) {
    return {
      available: false,
      unavailableReason: "Weather forecasts only reach a few days ahead — check back closer to your trip.",
      suggestions: [],
      summary: null,
    };
  }

  const minTempMin = Math.min(...overlapping.map((d) => d.tempMin));
  const maxTempMax = Math.max(...overlapping.map((d) => d.tempMax));
  const maxPrecipProb = Math.max(...overlapping.map((d) => d.precipProb ?? 0));
  const hasSnow = overlapping.some((d) => SNOW_CODES.has(d.weatherCode));

  const suggestions: WeatherPackingSuggestion[] = [];
  const add = (name: string, category: string, reason: string) => suggestions.push({ name, category, reason });

  const coldReason = hasSnow ? "Snow expected" : `Lows around ${Math.round(minTempMin)}°C`;
  if (minTempMin < 2 || hasSnow) {
    add("Gloves", "Clothing", coldReason);
    add("Winter hat", "Clothing", coldReason);
    add("Thermal base layers", "Clothing", coldReason);
    add("Waterproof boots", "Clothing", coldReason);
  }
  if (minTempMin < 10) {
    add("Warm jacket", "Clothing", `Lows around ${Math.round(minTempMin)}°C`);
    add("Warm layers / sweater", "Clothing", `Lows around ${Math.round(minTempMin)}°C`);
  }
  if (maxTempMax > 27) {
    const hotReason = `Highs around ${Math.round(maxTempMax)}°C`;
    add("Sunscreen", "Toiletries", hotReason);
    add("Sunglasses", "Other", hotReason);
    add("Hat / cap", "Clothing", hotReason);
    add("Light, breathable clothing", "Clothing", hotReason);
  }
  if (maxPrecipProb > 40) {
    const rainReason = `Up to ${Math.round(maxPrecipProb)}% chance of rain`;
    add("Umbrella", "Other", rainReason);
    add("Rain jacket", "Clothing", rainReason);
  }

  const summary =
    `${Math.round(minTempMin)}°C–${Math.round(maxTempMax)}°C` +
    (maxPrecipProb > 0 ? `, up to ${Math.round(maxPrecipProb)}% chance of rain` : "");

  return { available: true, unavailableReason: null, suggestions, summary };
}
