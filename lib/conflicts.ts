import { Item, Day } from "./types";

/** Items on the same day sharing an identical start time — a real
 * double-booking, not a fuzzy interval-overlap guess (most items have no
 * end time to compare against). */
export function findOverlappingItemIds(items: Item[]): Set<string> {
  const byTime = new Map<string, Item[]>();
  for (const item of items) {
    if (!item.time_start) continue;
    const list = byTime.get(item.time_start) ?? [];
    list.push(item);
    byTime.set(item.time_start, list);
  }
  const overlapping = new Set<string>();
  for (const list of byTime.values()) {
    if (list.length > 1) for (const item of list) overlapping.add(item.id);
  }
  return overlapping;
}

export function isLastTripDay(date: string, allDays: Pick<Day, "date">[]): boolean {
  const dated = allDays.filter((d): d is { date: string } => d.date !== null);
  if (dated.length === 0) return false;
  const maxDate = dated.reduce((max, d) => (d.date > max ? d.date : max), dated[0].date);
  return date === maxDate;
}

/** Every day in the trip (except the last — a departure day never needs a
 * night's lodging) not covered by any stay span's [start_date, end_date)
 * range. */
export function findLodgingGapDays(
  days: Pick<Day, "date">[],
  staySpans: Pick<Item, "start_date" | "end_date">[]
): string[] {
  const dated = days.filter((d): d is { date: string } => d.date !== null).map((d) => d.date);
  if (dated.length === 0) return [];
  const lastDate = dated.reduce((max, d) => (d > max ? d : max), dated[0]);

  const gaps: string[] = [];
  for (const date of dated) {
    if (date === lastDate) continue;
    const covered = staySpans.some((s) => s.start_date && s.end_date && s.start_date <= date && date < s.end_date);
    if (!covered) gaps.push(date);
  }
  return gaps.sort();
}
