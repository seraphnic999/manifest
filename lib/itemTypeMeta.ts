import { ItemType } from "./types";

export type FieldKey =
  | "time" | "address" | "phone" | "vendor" | "bookingSource"
  | "confirmationCode" | "link" | "notes" | "lodgingDates" | "flightNumber";

export interface ItemCategory {
  key: string;               // UI key, may map to >1 db item_type
  label: string;
  icon: string;               // Ionicons name
  tileColor: string;          // icon accent color on the dark tile
  dbTypes: ItemType[];        // 1 entry = fixed type; 2 = user picks a subtype
  subtypeLabels?: Record<string, string>;
  fields: FieldKey[];
}

export const ITEM_CATEGORIES: ItemCategory[] = [
  {
    key: "flight", label: "Flight", icon: "airplane", tileColor: "#5B9BD5",
    dbTypes: ["flight"],
    fields: ["time", "vendor", "flightNumber", "confirmationCode", "bookingSource", "notes"],
  },
  {
    key: "transfer", label: "Transfer", icon: "car-sport", tileColor: "#E0623C",
    dbTypes: ["transfer"],
    fields: ["time", "vendor", "address", "phone", "confirmationCode", "notes"],
  },
  {
    key: "transport", label: "Transport", icon: "bus", tileColor: "#3B6E71",
    dbTypes: ["transport"],
    fields: ["time", "notes"],
  },
  {
    key: "lodging", label: "Lodging", icon: "bed", tileColor: "#C98A2E",
    dbTypes: ["lodging"],
    fields: ["lodgingDates", "address", "phone", "confirmationCode", "bookingSource", "link", "notes"],
  },
  {
    key: "dining", label: "Food & Drink", icon: "restaurant", tileColor: "#E07A3C",
    dbTypes: ["meal", "bar"], subtypeLabels: { meal: "Restaurant", bar: "Bar" },
    fields: ["time", "address", "phone", "bookingSource", "confirmationCode", "link", "notes"],
  },
  {
    key: "activity", label: "Activity", icon: "walk", tileColor: "#4C9A6A",
    dbTypes: ["activity", "sightseeing"], subtypeLabels: { activity: "Activity", sightseeing: "Attraction" },
    fields: ["time", "address", "bookingSource", "confirmationCode", "link", "notes"],
  },
  {
    key: "shopping", label: "Shopping", icon: "cart", tileColor: "#9A6FC9",
    dbTypes: ["shopping"],
    fields: ["time", "address", "link", "notes"],
  },
  {
    key: "work", label: "Work", icon: "briefcase", tileColor: "#6B7C8F",
    dbTypes: ["work"],
    fields: ["time", "notes"],
  },
  {
    key: "other", label: "Other", icon: "ellipsis-horizontal", tileColor: "#8C8577",
    dbTypes: ["other"],
    fields: ["time", "address", "phone", "vendor", "bookingSource", "confirmationCode", "link", "notes"],
  },
];

export function categoryByKey(key: string) {
  return ITEM_CATEGORIES.find((c) => c.key === key) ?? ITEM_CATEGORIES[ITEM_CATEGORIES.length - 1];
}

/** Reverse lookup: which UI category owns a given DB item_type (for editing). */
export function categoryForDbType(type: ItemType) {
  return ITEM_CATEGORIES.find((c) => c.dbTypes.includes(type)) ?? ITEM_CATEGORIES[ITEM_CATEGORIES.length - 1];
}
