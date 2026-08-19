export type ExpenseTiming = "pre-trip" | "in-trip";

/**
 * Whether an expense falls before the trip started or during/after it.
 * Derived purely from dates (no stored field) — post-trip counts as
 * in-trip, so this is a two-way split, not three.
 */
export function classifyExpenseTiming(expenseDate: string | null, tripStartDate: string): ExpenseTiming {
  if (!expenseDate) return "in-trip";
  return expenseDate < tripStartDate ? "pre-trip" : "in-trip";
}
