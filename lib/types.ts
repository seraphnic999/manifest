export type TripType = "business" | "pleasure" | "mixed";
export type TripStatus = "future" | "current" | "past"; // derived, not stored

export type ItemType =
  | "flight" | "transfer" | "transport" | "lodging" | "activity"
  | "meal" | "bar" | "sightseeing" | "shopping" | "work" | "other";

export type ItemStatus = "booked" | "optional" | "idea" | "pending";

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
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Day {
  id: string;
  trip_id: string;
  date: string;
  theme: string | null;
  sort_order: number;
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
  sort_order: number;
  custom_fields: Record<string, unknown>;
  deleted_at: string | null;
}

export interface ItemPhoto {
  id: string;
  item_id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
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

export interface Expense {
  id: string;
  trip_id: string;
  item_id: string | null;
  currency_code: string;
  amount: number;
  expense_date: string | null;
  note: string | null;
}

export interface Allocation {
  id: string;
  expense_id: string;
  amount: number;
  shopping_list_item_id: string | null;
  party_id: string | null;
}

export function tripStatus(trip: Pick<Trip, "start_date" | "end_date">): TripStatus {
  const today = new Date().toISOString().slice(0, 10);
  if (today < trip.start_date) return "future";
  if (today > trip.end_date) return "past";
  return "current";
}
