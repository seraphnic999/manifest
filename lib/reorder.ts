// sort_order is a plain integer column with gaps (we seed by 1000s), so
// most inserts can slot into the midpoint of two neighbors without
// touching any other row. renumberIfNeeded is the fallback for when two
// neighbors run out of room (adjacent integers).
import { normalizeTimeHHMM } from "./timeFormat";

interface OrderableItem {
  id: string;
  sort_order: number;
  time_start: string | null;
}

const GAP = 1000;

/** Where a new item should land among existing (already day-scoped) items. */
export function computeInsertSortOrder(existing: OrderableItem[], newTime: string | null): number {
  if (existing.length === 0) return GAP;

  const sorted = [...existing].sort((a, b) => a.sort_order - b.sort_order);

  if (!newTime) {
    // Untimed items always append to the very end.
    return sorted[sorted.length - 1].sort_order + GAP;
  }

  // Postgres' `time` column always echoes back "HH:MM:SS", while newTime is
  // the freshly-typed "HH:MM" — normalize both to the same "HH:MM" form
  // before comparing, since e.g. "14:30:00" > "14:30" is true as plain
  // strings (the longer one "wins") even though the times are equal.
  const newTimeNorm = normalizeTimeHHMM(newTime);

  // Untimed items (e.g. "Dunkin Donuts", no clock time) are interspersed
  // between timed ones by design — they represent "sometime after the last
  // known time, before the next one", not "after everything timed". So each
  // untimed item inherits the effective time of the most recent preceding
  // timed item (carry-forward), rather than being treated as an automatic
  // boundary. Without this, a new 18:00 item would insert right after the
  // first untimed item following the 05:25 flight, landing near the start
  // of the day instead of near the other evening items.
  let carried: string | null = null;
  const effectiveTimes = sorted.map((i) => {
    const t = normalizeTimeHHMM(i.time_start);
    if (t) carried = t;
    return carried;
  });

  // Find the first item whose effective time is later than newTime (or has
  // no effective time yet — untimed items before anything timed has
  // happened) — insert before it.
  const insertBeforeIdx = effectiveTimes.findIndex(
    (t) => t === null || t > newTimeNorm
  );

  if (insertBeforeIdx === -1) {
    // Every existing item is timed and <= newTime — append after all of them.
    return sorted[sorted.length - 1].sort_order + GAP;
  }
  if (insertBeforeIdx === 0) {
    return sorted[0].sort_order - GAP > 0 ? sorted[0].sort_order - GAP : sorted[0].sort_order / 2;
  }

  const prev = sorted[insertBeforeIdx - 1].sort_order;
  const next = sorted[insertBeforeIdx].sort_order;
  const mid = Math.floor((prev + next) / 2);
  return mid > prev ? mid : prev + 1; // needsRenumber() should be checked by the caller when this collides
}

/** True if inserting between these two would leave no integer room. */
export function needsRenumber(prev: number, next: number): boolean {
  return next - prev <= 1;
}

// Even 1000-apart sort_order values, preserving the ARRAY's order — the
// caller (post-drag) already has the items in the desired new order, each
// still carrying its OLD sort_order field. Sorting by that stale field here
// would silently discard the drag and regenerate the original order, which
// is exactly what was happening: a drag looked like it worked (optimistic
// local state), but reloading the day reverted it, because this function
// was the one writing to the database.
export function renumberedOrders(existing: OrderableItem[]): { id: string; sort_order: number }[] {
  return existing.map((item, idx) => ({ id: item.id, sort_order: (idx + 1) * GAP }));
}
