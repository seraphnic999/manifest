import { ItemType } from "./types";
import { IconName } from "@/components/icons/Icon";

export type FieldKey =
  | "time" | "address" | "phone" | "vendor" | "bookingSource"
  | "confirmationCode" | "link" | "notes" | "lodgingDates" | "flightNumber"
  | "flightTimes";

export interface ItemCategory {
  key: string;               // UI key, may map to >1 db item_type
  label: string;
  icon: IconName;
  tileColor: string;          // icon accent color on the dark tile
  dbTypes: ItemType[];        // 1 entry = fixed type; 2+ = user picks a subtype
  subtypeLabels?: Record<string, string>;
  /** Per-subtype icon override for the day view/map (mapIconForItem) —
   * subtypes not listed here just show the category's own icon. */
  subtypeIcons?: Partial<Record<ItemType, IconName>>;
  fields: FieldKey[];
}

export const ITEM_CATEGORIES: ItemCategory[] = [
  {
    key: "flight", label: "Flight", icon: "flight", tileColor: "#5B9BD5",
    dbTypes: ["flight"],
    fields: ["flightTimes", "vendor", "flightNumber", "confirmationCode", "bookingSource", "notes"],
  },
  {
    key: "transfer", label: "Transfer", icon: "transfer", tileColor: "#E0623C",
    dbTypes: ["transfer"],
    fields: ["time", "vendor", "address", "phone", "confirmationCode", "notes"],
  },
  {
    key: "transport", label: "Transport", icon: "transport", tileColor: "#3B6E71",
    dbTypes: ["transport"],
    fields: ["time", "notes"],
  },
  {
    key: "lodging", label: "Lodging", icon: "lodging", tileColor: "#C98A2E",
    dbTypes: ["lodging"],
    fields: ["lodgingDates", "address", "phone", "confirmationCode", "bookingSource", "link", "notes"],
  },
  {
    key: "dining", label: "Food & Drink", icon: "dining", tileColor: "#E07A3C",
    dbTypes: ["meal", "bar", "cafe", "bakery", "ice_cream"],
    subtypeLabels: { meal: "Restaurant", bar: "Bar", cafe: "Cafe", bakery: "Bakery", ice_cream: "Ice Cream" },
    subtypeIcons: { cafe: "cafe", bakery: "croissant", ice_cream: "iceCream" },
    fields: ["time", "address", "phone", "bookingSource", "confirmationCode", "link", "notes"],
  },
  {
    key: "activity", label: "Activity", icon: "flag", tileColor: "#4C9A6A",
    dbTypes: ["activity", "attraction", "sightseeing"],
    subtypeLabels: { activity: "Activity", attraction: "Attraction", sightseeing: "Sightseeing" },
    fields: ["time", "address", "bookingSource", "confirmationCode", "link", "notes"],
  },
  {
    key: "shopping", label: "Shopping", icon: "shopping", tileColor: "#9A6FC9",
    dbTypes: ["shopping"],
    fields: ["time", "address", "link", "notes"],
  },
  {
    key: "work", label: "Work", icon: "work", tileColor: "#6B7C8F",
    dbTypes: ["work"],
    fields: ["time", "notes"],
  },
  {
    key: "other", label: "Other", icon: "other", tileColor: "#8C8577",
    dbTypes: ["other"],
    fields: ["time", "address", "phone", "vendor", "bookingSource", "confirmationCode", "link", "notes"],
  },
];

export function categoryByKey(key: string) {
  return ITEM_CATEGORIES.find((c) => c.key === key) ?? ITEM_CATEGORIES[ITEM_CATEGORIES.length - 1];
}

// Flight and lodging carry structural behavior a plain type change can't
// carry over (flight duration/status lookups, the stay-span + auto-created
// check-in/out children) — every other category is just a title plus a
// handful of optional fields, so converting between them is safe.
export const CONVERTIBLE_CATEGORIES = ITEM_CATEGORIES.filter(
  (c) => c.key !== "flight" && c.key !== "lodging"
);

export function isConvertibleType(type: ItemType): boolean {
  return type !== "flight" && categoryForDbType(type).key !== "lodging";
}

/** A DB item_type as a display tag (e.g. for the day view's small uppercase
 * label) — underscores in a multi-word type like "ice_cream" read as a
 * literal underscore once uppercased ("ICE_CREAM"), so this swaps them for
 * spaces first ("ICE CREAM"). */
export function itemTypeTag(type: string): string {
  return type.replace(/_/g, " ").toUpperCase();
}

/** Reverse lookup: which UI category owns a given DB item_type (for editing). */
export function categoryForDbType(type: ItemType) {
  return ITEM_CATEGORIES.find((c) => c.dbTypes.includes(type)) ?? ITEM_CATEGORIES[ITEM_CATEGORIES.length - 1];
}

/** An item's effective icon (day view + map) — its own override if it has
 * one, else its subtype's icon if its category defines one, else its
 * category's shared default. */
export function mapIconForItem(item: { type: ItemType; map_icon?: string | null }): IconName {
  if (item.map_icon) return item.map_icon as IconName;
  const cat = categoryForDbType(item.type);
  return cat.subtypeIcons?.[item.type] ?? cat.icon;
}
