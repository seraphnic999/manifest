import { Trip, tripStatus } from "./types";
import { localIsoDate } from "./dateFormat";

export interface BudgetProgress {
  budget: number;
  spentTotal: number;
  spentPreTrip: number;
  spentInTrip: number;
  percent: number;
  overBudget: boolean;
  /** Projected total spend by the trip's last day — only computed while
   * the trip is actually current, since "pace" has no meaning before or
   * after that. Extrapolates the in-trip daily rate across the full trip
   * length, on top of whatever was already spent before it started. */
  paceProjection: number | null;
}

function daysBetweenInclusive(startIso: string, endIso: string): number {
  const [y1, m1, d1] = startIso.split("-").map(Number);
  const [y2, m2, d2] = endIso.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000) + 1;
}

export function computeBudgetProgress(
  trip: Pick<Trip, "start_date" | "end_date" | "budget_amount">,
  expenses: { amount: number; currency_code: string; expense_date: string | null }[],
  rateFor: (code: string) => number
): BudgetProgress | null {
  if (trip.budget_amount == null) return null;
  const budget = trip.budget_amount;

  let spentPreTrip = 0;
  let spentInTrip = 0;
  for (const e of expenses) {
    const nis = e.amount * rateFor(e.currency_code);
    if (e.expense_date && e.expense_date < trip.start_date) spentPreTrip += nis;
    else spentInTrip += nis;
  }
  const spentTotal = spentPreTrip + spentInTrip;
  const percent = budget > 0 ? (spentTotal / budget) * 100 : 0;

  let paceProjection: number | null = null;
  if (tripStatus(trip) === "current") {
    const today = localIsoDate();
    const elapsedEnd = today < trip.end_date ? today : trip.end_date;
    const daysElapsed = daysBetweenInclusive(trip.start_date, elapsedEnd);
    const totalDays = daysBetweenInclusive(trip.start_date, trip.end_date);
    if (daysElapsed > 0) {
      const dailyPace = spentInTrip / daysElapsed;
      paceProjection = spentPreTrip + dailyPace * totalDays;
    }
  }

  return { budget, spentTotal, spentPreTrip, spentInTrip, percent, overBudget: spentTotal > budget, paceProjection };
}
