import { localIsoDate } from "./dateFormat";

export type TripType = "business" | "pleasure" | "mixed";
export type TripStatus = "future" | "current" | "past"; // derived, not stored

export type ItemType =
  | "flight" | "transfer" | "transport" | "lodging" | "activity"
  | "meal" | "bar" | "sightseeing" | "attraction" | "shopping" | "work" | "other";

export type ItemStatus = "booked" | "optional" | "planned";

export interface Trip {
  id: string;
  user_id: string;
  name: string;
  start_date: string;
  end_date: string;
  type: TripType;
  destinations: string[];
  default_timezone: string;
  custom_fields: Record<string, unknown>;
  budget_amount: number | null; // NIS — matches the app's existing NIS-normalized reporting
  cover_photo_id: string | null; // see lib/destinationPhotos.ts — id into the bundled photo set, or null for the fallback
  latitude: number | null;  // map default-focus point, derived from the trip's primary picked city — see lib/cities.ts
  longitude: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface City {
  id: string;
  name: string;
  country: string;
  country_code: string;
  timezone: string;
  currency_code: string;
  latitude: number;
  longitude: number;
  cover_photo_id: string | null;
  created_at: string;
}

export interface TripCity {
  id: string;
  trip_id: string;
  city_id: string | null;
  custom_name: string | null; // set only when city_id is null — a destination not in the cities dataset
  sort_order: number; // lowest = the trip's primary city, drives cover/timezone/map-focus auto-fill
  created_at: string;
}

export interface Day {
  id: string;
  trip_id: string;
  date: string | null; // null only for the trip's one special "Proposals" day
  theme: string | null;
  sort_order: number;
  color: string | null; // map color override; null falls back to the index-based/Proposals default
  city_id: string | null; // this day's city override; both null falls back to the trip's primary city
  custom_city_name: string | null; // set only when city_id is null and the day has a free-text city override
}

export interface Item {
  id: string;
  day_id: string | null;
  trip_id: string;
  parent_item_id: string | null;
  alt_group_id: string | null;
  type: ItemType;
  title: string;
  start_date: string | null;
  end_date: string | null;
  time_start: string | null;
  time_end: string | null;
  timezone_start: string | null;
  timezone_end: string | null;
  status: ItemStatus;
  is_stay_span: boolean;
  notes: string | null;
  confirmation_code: string | null;
  booking_source: string | null;
  address: string | null;
  phone: string | null;
  vendor: string | null;
  link: string | null;
  google_maps_link: string | null;
  sort_order: number;
  latitude: number | null;
  longitude: number | null;
  map_icon: string | null; // IconName override for the map marker; falls back to the item type's category icon
  reminder_minutes_before: number | null;
  reminder_sent_at: string | null;
  custom_fields: Record<string, unknown>;
  deleted_at: string | null;
}

export interface ItemPhoto {
  id: string;
  item_id: string;
  storage_path: string;
  caption: string | null;
  file_name: string | null;
  mime_type: string | null;
  sort_order: number;
}

export interface ItemLink {
  id: string;
  item_id_a: string;
  item_id_b: string;
}

export interface TripParty {
  id: string;
  trip_id: string;
  name: string;
  is_work: boolean;
}

export interface TripCurrency {
  id: string;
  trip_id: string;
  code: string;
  rate_to_nis: number;
  is_default: boolean;
}

export interface ShoppingListItem {
  id: string;
  trip_id: string;
  item_id: string | null;
  name: string;
  quantity: number;
  note: string | null;
}

export type ExpenseType = "flight" | "lodging" | "transport" | "meals" | "attractions" | "shopping" | "other";

export interface Expense {
  id: string;
  trip_id: string;
  item_id: string | null;
  currency_code: string;
  amount: number;
  expense_date: string | null;
  note: string | null;
  type: ExpenseType;
  refund_amount: number | null;   // optional; same currency as this expense; not part of the split
  refund_company: string | null; // e.g. "Global Blue"
}

export interface Allocation {
  id: string;
  expense_id: string;
  amount: number;
  shopping_list_item_id: string | null;
  party_id: string | null;
  note: string | null;
}

export interface PackingItem {
  id: string;
  trip_id: string;
  name: string;
  category: string | null;
  packed: boolean;
  sort_order: number;
}

export interface PackingTemplate {
  id: string;
  user_id: string;
  name: string;
}

export interface PackingTemplateItem {
  id: string;
  template_id: string;
  name: string;
  category: string | null;
  sort_order: number;
}

export interface MapRoute {
  id: string;
  trip_id: string;
  day_id: string | null;
  name: string;
  color: string | null;
  geometry: { type: "LineString"; coordinates: [number, number][] };
  sort_order: number;
}

export type Relationship =
  | "mother" | "father" | "brother" | "sister" | "wife" | "husband"
  | "son" | "daughter" | "friend" | "other";

export interface Companion {
  id: string;
  user_id: string;
  is_self: boolean;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  relationship: Relationship | null; // null only for the self row
  profile_photo_path: string | null;
  notes: string | null;
  israeli_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TripCompanion {
  id: string;
  trip_id: string;
  companion_id: string;
  sort_order: number;
  created_at: string;
}

export interface CompanionPhoto {
  id: string;
  companion_id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

export type DocumentType = "passport" | "national_id" | "visa" | "drivers_license" | "other";

export interface TravelDocument {
  id: string;
  companion_id: string;
  type: DocumentType;
  document_number: string | null;
  issuing_country: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  photo_path: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Keeper {
  id: string;
  user_id: string;
  city_id: string | null;
  custom_city_name: string | null;
  city_label: string;
  item_type: ItemType;
  title: string;
  start_date: string | null;
  end_date: string | null;
  time_start: string | null;
  time_end: string | null;
  timezone_start: string | null;
  timezone_end: string | null;
  notes: string | null;
  confirmation_code: string | null;
  booking_source: string | null;
  address: string | null;
  phone: string | null;
  vendor: string | null;
  link: string | null;
  google_maps_link: string | null;
  latitude: number | null;
  longitude: number | null;
  map_icon: string | null;
  source_trip_name: string | null;
  rating: number | null;
  personal_notes: string | null;
  created_at: string;
}

export type FieldConfidence = "high" | "medium" | "low" | "none";

export interface ProposedField<T> {
  value: T | null;
  confidence: FieldConfidence;
  basis: string | null;
  source: string | null;
}

export interface ItemResearchProposal {
  name: ProposedField<string>;
  address: ProposedField<string>;
  phone: ProposedField<string>;
  website: ProposedField<string>;
  google_maps_link: ProposedField<string>;
  opening_hours: ProposedField<string>;
  reservation_lead_time: ProposedField<string>;
  price_range: ProposedField<string>;
  latitude: ProposedField<number>;
  longitude: ProposedField<number>;
  unresolved: string | null;
}

export type ItemResearchStatus = "queued" | "researching" | "ready" | "accepted" | "rejected" | "failed";

export interface ItemResearchJob {
  id: string;
  item_id: string;
  trip_id: string;
  status: ItemResearchStatus;
  identified_name: string | null;
  identified_context: Record<string, unknown> | null;
  proposal: ItemResearchProposal | null;
  accepted: Record<string, unknown> | null;
  error: string | null;
  cost_usd: number | null;
  usage: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  reviewed_at: string | null;
}

export interface IdentifyCandidate {
  name: string;
  area_hint: string | null;
  confidence: FieldConfidence;
  reasoning: string;
}

export function tripStatus(trip: Pick<Trip, "start_date" | "end_date">): TripStatus {
  const today = localIsoDate();
  if (today < trip.start_date) return "future";
  if (today > trip.end_date) return "past";
  return "current";
}
