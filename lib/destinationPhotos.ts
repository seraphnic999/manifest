import { ImageSourcePropType } from "react-native";

// Bundled destination cover photos (Travel_Highlights_001-102 set). Metro
// needs static `require(...)` calls (no dynamic paths), so every photo has
// to be listed explicitly here — this is also the full list the cover-photo
// picker shows. Regenerate this file (see the id/city/country mapping in
// design/destination-photo-prompts.json) if the photo set changes.
export const DEFAULT_COVER_PHOTO_ID = "_fallback";

export interface DestinationPhoto {
  id: string;
  city: string;
  country: string;
  source: ImageSourcePropType;
}

export const DESTINATION_PHOTOS: DestinationPhoto[] = [
  { id: "paris", city: "Paris", country: "France", source: require("../assets/destinations/paris.jpg") },
  { id: "london", city: "London", country: "United Kingdom", source: require("../assets/destinations/london.jpg") },
  { id: "rome", city: "Rome", country: "Italy", source: require("../assets/destinations/rome.jpg") },
  { id: "venice", city: "Venice", country: "Italy", source: require("../assets/destinations/venice.jpg") },
  { id: "florence", city: "Florence", country: "Italy", source: require("../assets/destinations/florence.jpg") },
  { id: "milan", city: "Milan", country: "Italy", source: require("../assets/destinations/milan.jpg") },
  { id: "naples", city: "Naples", country: "Italy", source: require("../assets/destinations/naples.jpg") },
  { id: "cinque-terre", city: "Cinque Terre", country: "Italy", source: require("../assets/destinations/cinque-terre.jpg") },
  { id: "amalfi-coast", city: "Amalfi Coast", country: "Italy", source: require("../assets/destinations/amalfi-coast.jpg") },
  { id: "barcelona", city: "Barcelona", country: "Spain", source: require("../assets/destinations/barcelona.jpg") },
  { id: "madrid", city: "Madrid", country: "Spain", source: require("../assets/destinations/madrid.jpg") },
  { id: "seville", city: "Seville", country: "Spain", source: require("../assets/destinations/seville.jpg") },
  { id: "valencia", city: "Valencia", country: "Spain", source: require("../assets/destinations/valencia.jpg") },
  { id: "palma-de-mallorca", city: "Palma de Mallorca", country: "Spain", source: require("../assets/destinations/palma-de-mallorca.jpg") },
  { id: "ibiza", city: "Ibiza", country: "Spain", source: require("../assets/destinations/ibiza.jpg") },
  { id: "lisbon", city: "Lisbon", country: "Portugal", source: require("../assets/destinations/lisbon.jpg") },
  { id: "porto", city: "Porto", country: "Portugal", source: require("../assets/destinations/porto.jpg") },
  { id: "berlin", city: "Berlin", country: "Germany", source: require("../assets/destinations/berlin.jpg") },
  { id: "munich", city: "Munich", country: "Germany", source: require("../assets/destinations/munich.jpg") },
  { id: "hamburg", city: "Hamburg", country: "Germany", source: require("../assets/destinations/hamburg.jpg") },
  { id: "cologne", city: "Cologne", country: "Germany", source: require("../assets/destinations/cologne.jpg") },
  { id: "frankfurt", city: "Frankfurt", country: "Germany", source: require("../assets/destinations/frankfurt.jpg") },
  { id: "amsterdam", city: "Amsterdam", country: "Netherlands", source: require("../assets/destinations/amsterdam.jpg") },
  { id: "rotterdam", city: "Rotterdam", country: "Netherlands", source: require("../assets/destinations/rotterdam.jpg") },
  { id: "brussels", city: "Brussels", country: "Belgium", source: require("../assets/destinations/brussels.jpg") },
  { id: "bruges", city: "Bruges", country: "Belgium", source: require("../assets/destinations/bruges.jpg") },
  { id: "vienna", city: "Vienna", country: "Austria", source: require("../assets/destinations/vienna.jpg") },
  { id: "salzburg", city: "Salzburg", country: "Austria", source: require("../assets/destinations/salzburg.jpg") },
  { id: "innsbruck", city: "Innsbruck", country: "Austria", source: require("../assets/destinations/innsbruck.jpg") },
  { id: "zurich", city: "Zurich", country: "Switzerland", source: require("../assets/destinations/zurich.jpg") },
  { id: "geneva", city: "Geneva", country: "Switzerland", source: require("../assets/destinations/geneva.jpg") },
  { id: "prague", city: "Prague", country: "Czech Republic", source: require("../assets/destinations/prague.jpg") },
  { id: "budapest", city: "Budapest", country: "Hungary", source: require("../assets/destinations/budapest.jpg") },
  { id: "warsaw", city: "Warsaw", country: "Poland", source: require("../assets/destinations/warsaw.jpg") },
  { id: "krakow", city: "Krakow", country: "Poland", source: require("../assets/destinations/krakow.jpg") },
  { id: "vilnius", city: "Vilnius", country: "Lithuania", source: require("../assets/destinations/vilnius.jpg") },
  { id: "riga", city: "Riga", country: "Latvia", source: require("../assets/destinations/riga.jpg") },
  { id: "tallinn", city: "Tallinn", country: "Estonia", source: require("../assets/destinations/tallinn.jpg") },
  { id: "copenhagen", city: "Copenhagen", country: "Denmark", source: require("../assets/destinations/copenhagen.jpg") },
  { id: "stockholm", city: "Stockholm", country: "Sweden", source: require("../assets/destinations/stockholm.jpg") },
  { id: "gothenburg", city: "Gothenburg", country: "Sweden", source: require("../assets/destinations/gothenburg.jpg") },
  { id: "oslo", city: "Oslo", country: "Norway", source: require("../assets/destinations/oslo.jpg") },
  { id: "bergen", city: "Bergen", country: "Norway", source: require("../assets/destinations/bergen.jpg") },
  { id: "helsinki", city: "Helsinki", country: "Finland", source: require("../assets/destinations/helsinki.jpg") },
  { id: "reykjavik", city: "Reykjavik", country: "Iceland", source: require("../assets/destinations/reykjavik.jpg") },
  { id: "dublin", city: "Dublin", country: "Ireland", source: require("../assets/destinations/dublin.jpg") },
  { id: "edinburgh", city: "Edinburgh", country: "United Kingdom", source: require("../assets/destinations/edinburgh.jpg") },
  { id: "athens", city: "Athens", country: "Greece", source: require("../assets/destinations/athens.jpg") },
  { id: "santorini", city: "Santorini", country: "Greece", source: require("../assets/destinations/santorini.jpg") },
  { id: "mykonos", city: "Mykonos", country: "Greece", source: require("../assets/destinations/mykonos.jpg") },
  { id: "dubrovnik", city: "Dubrovnik", country: "Croatia", source: require("../assets/destinations/dubrovnik.jpg") },
  { id: "split", city: "Split", country: "Croatia", source: require("../assets/destinations/split.jpg") },
  { id: "ljubljana", city: "Ljubljana", country: "Slovenia", source: require("../assets/destinations/ljubljana.jpg") },
  { id: "zagreb", city: "Zagreb", country: "Croatia", source: require("../assets/destinations/zagreb.jpg") },
  { id: "belgrade", city: "Belgrade", country: "Serbia", source: require("../assets/destinations/belgrade.jpg") },
  { id: "bucharest", city: "Bucharest", country: "Romania", source: require("../assets/destinations/bucharest.jpg") },
  { id: "sofia", city: "Sofia", country: "Bulgaria", source: require("../assets/destinations/sofia.jpg") },
  { id: "istanbul", city: "Istanbul", country: "Turkey", source: require("../assets/destinations/istanbul.jpg") },
  { id: "antalya", city: "Antalya", country: "Turkey", source: require("../assets/destinations/antalya.jpg") },
  { id: "cappadocia", city: "Cappadocia", country: "Turkey", source: require("../assets/destinations/cappadocia.jpg") },
  { id: "valletta", city: "Valletta", country: "Malta", source: require("../assets/destinations/valletta.jpg") },
  { id: "nice", city: "Nice", country: "France", source: require("../assets/destinations/nice.jpg") },
  { id: "new-york-city", city: "New York City", country: "United States", source: require("../assets/destinations/new-york-city.jpg") },
  { id: "los-angeles", city: "Los Angeles", country: "United States", source: require("../assets/destinations/los-angeles.jpg") },
  { id: "san-francisco", city: "San Francisco", country: "United States", source: require("../assets/destinations/san-francisco.jpg") },
  { id: "las-vegas", city: "Las Vegas", country: "United States", source: require("../assets/destinations/las-vegas.jpg") },
  { id: "miami", city: "Miami", country: "United States", source: require("../assets/destinations/miami.jpg") },
  { id: "chicago", city: "Chicago", country: "United States", source: require("../assets/destinations/chicago.jpg") },
  { id: "washington-dc", city: "Washington DC", country: "United States", source: require("../assets/destinations/washington-dc.jpg") },
  { id: "boston", city: "Boston", country: "United States", source: require("../assets/destinations/boston.jpg") },
  { id: "seattle", city: "Seattle", country: "United States", source: require("../assets/destinations/seattle.jpg") },
  { id: "orlando", city: "Orlando", country: "United States", source: require("../assets/destinations/orlando.jpg") },
  { id: "new-orleans", city: "New Orleans", country: "United States", source: require("../assets/destinations/new-orleans.jpg") },
  { id: "honolulu", city: "Honolulu", country: "United States", source: require("../assets/destinations/honolulu.jpg") },
  { id: "san-diego", city: "San Diego", country: "United States", source: require("../assets/destinations/san-diego.jpg") },
  { id: "nashville", city: "Nashville", country: "United States", source: require("../assets/destinations/nashville.jpg") },
  { id: "grand-canyon", city: "Grand Canyon", country: "United States", source: require("../assets/destinations/grand-canyon.jpg") },
  { id: "tokyo", city: "Tokyo", country: "Japan", source: require("../assets/destinations/tokyo.jpg") },
  { id: "kyoto", city: "Kyoto", country: "Japan", source: require("../assets/destinations/kyoto.jpg") },
  { id: "osaka", city: "Osaka", country: "Japan", source: require("../assets/destinations/osaka.jpg") },
  { id: "hakone", city: "Hakone", country: "Japan", source: require("../assets/destinations/hakone.jpg") },
  { id: "sapporo", city: "Sapporo", country: "Japan", source: require("../assets/destinations/sapporo.jpg") },
  { id: "nara", city: "Nara", country: "Japan", source: require("../assets/destinations/nara.jpg") },
  { id: "hiroshima", city: "Hiroshima", country: "Japan", source: require("../assets/destinations/hiroshima.jpg") },
  { id: "beijing", city: "Beijing", country: "China", source: require("../assets/destinations/beijing.jpg") },
  { id: "shanghai", city: "Shanghai", country: "China", source: require("../assets/destinations/shanghai.jpg") },
  { id: "hong-kong", city: "Hong Kong", country: "China", source: require("../assets/destinations/hong-kong.jpg") },
  { id: "guilin", city: "Guilin", country: "China", source: require("../assets/destinations/guilin.jpg") },
  { id: "xi-an", city: "Xi'an", country: "China", source: require("../assets/destinations/xi-an.jpg") },
  { id: "chengdu", city: "Chengdu", country: "China", source: require("../assets/destinations/chengdu.jpg") },
  { id: "bangkok", city: "Bangkok", country: "Thailand", source: require("../assets/destinations/bangkok.jpg") },
  { id: "phuket", city: "Phuket", country: "Thailand", source: require("../assets/destinations/phuket.jpg") },
  { id: "chiang-mai", city: "Chiang Mai", country: "Thailand", source: require("../assets/destinations/chiang-mai.jpg") },
  { id: "krabi", city: "Krabi", country: "Thailand", source: require("../assets/destinations/krabi.jpg") },
  { id: "koh-samui", city: "Koh Samui", country: "Thailand", source: require("../assets/destinations/koh-samui.jpg") },
  { id: "singapore", city: "Singapore", country: "Singapore", source: require("../assets/destinations/singapore.jpg") },
  { id: "seoul", city: "Seoul", country: "South Korea", source: require("../assets/destinations/seoul.jpg") },
  { id: "bali", city: "Bali", country: "Indonesia", source: require("../assets/destinations/bali.jpg") },
  { id: "dubai", city: "Dubai", country: "United Arab Emirates", source: require("../assets/destinations/dubai.jpg") },
  { id: "ha-long-bay", city: "Ha Long Bay", country: "Vietnam", source: require("../assets/destinations/ha-long-bay.jpg") },
  { id: "lyon", city: "Lyon", country: "France", source: require("../assets/destinations/lyon.jpg") },
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
