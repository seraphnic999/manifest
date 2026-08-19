import { ItemType, ExpenseType } from "./types";

export const EXPENSE_TYPES: ExpenseType[] = ["flight", "lodging", "transport", "meals", "attractions", "shopping", "other"];

export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  flight: "Flight",
  lodging: "Lodging",
  transport: "Transport",
  meals: "Meals",
  attractions: "Attractions",
  shopping: "Shopping",
  other: "Other",
};

/** An item's DB type maps onto the smaller, fixed expense-type list; anything without an obvious match is "other". */
export function deriveExpenseTypeFromItemType(itemType: ItemType): ExpenseType {
  switch (itemType) {
    case "flight": return "flight";
    case "lodging": return "lodging";
    case "transfer":
    case "transport": return "transport";
    case "meal":
    case "bar": return "meals";
    case "activity":
    case "attraction":
    case "sightseeing": return "attractions";
    case "shopping": return "shopping";
    default: return "other";
  }
}
