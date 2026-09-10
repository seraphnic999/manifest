import { ImageSourcePropType } from "react-native";

// Bundled destination cover photos. Metro needs static `require(...)` calls
// (no dynamic paths), so every photo that ships in assets/destinations has
// to be listed explicitly here — this is also the full list the cover-photo
// picker shows. Only 10 of the eventual ~100 (see
// design/destination-photo-prompts.json for the rest of the planned set)
// exist so far; add a require() line here each time a new one is dropped
// into assets/destinations.
export const DEFAULT_COVER_PHOTO_ID = "_fallback";

export interface DestinationPhoto {
  id: string;
  city: string;
  country: string;
  source: ImageSourcePropType;
}

export const DESTINATION_PHOTOS: DestinationPhoto[] = [
  { id: "paris", city: "Paris", country: "France", source: require("../assets/destinations/paris.jpg") },
  { id: "tokyo", city: "Tokyo", country: "Japan", source: require("../assets/destinations/tokyo.jpg") },
  { id: "kyoto", city: "Kyoto", country: "Japan", source: require("../assets/destinations/kyoto.jpg") },
  { id: "santorini", city: "Santorini", country: "Greece", source: require("../assets/destinations/santorini.jpg") },
  { id: "venice", city: "Venice", country: "Italy", source: require("../assets/destinations/venice.jpg") },
  { id: "reykjavik", city: "Reykjavik", country: "Iceland", source: require("../assets/destinations/reykjavik.jpg") },
  { id: "new-york-city", city: "New York City", country: "United States", source: require("../assets/destinations/new-york-city.jpg") },
  { id: "grand-canyon", city: "Grand Canyon", country: "United States", source: require("../assets/destinations/grand-canyon.jpg") },
  { id: "cappadocia", city: "Cappadocia", country: "Turkey", source: require("../assets/destinations/cappadocia.jpg") },
  { id: "ha-long-bay", city: "Ha Long Bay", country: "Vietnam", source: require("../assets/destinations/ha-long-bay.jpg") },
];

export const FALLBACK_COVER_PHOTO: ImageSourcePropType = require("../assets/destinations/_fallback.jpg");

/** Resolves a trip's stored cover_photo_id to an actual image source, falling
 * back to the generic placeholder if unset or if that photo no longer exists
 * (e.g. the set gets pruned/renamed later). */
export function coverPhotoSource(coverPhotoId: string | null | undefined): ImageSourcePropType {
  const match = coverPhotoId ? DESTINATION_PHOTOS.find((p) => p.id === coverPhotoId) : undefined;
  return match ? match.source : FALLBACK_COVER_PHOTO;
}

export function searchDestinationPhotos(query: string): DestinationPhoto[] {
  const q = query.trim().toLowerCase();
  if (!q) return DESTINATION_PHOTOS;
  return DESTINATION_PHOTOS.filter(
    (p) => p.city.toLowerCase().includes(q) || p.country.toLowerCase().includes(q)
  );
}
