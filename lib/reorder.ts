// sort_order is a plain integer column with gaps (we seed by 1000s), so
// most inserts can slot into the midpoint of two neighbors without
// touching any other row. renumberIfNeeded is the fallback for when two
// neighbors run out of room (adjacent integers).

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

  // Find the first item that is either untimed (marks the start of the
  // trailing untimed cluster) or timed-later-than-newTime — insert before it.
  const insertBeforeIdx = sorted.findIndex(
    (i) => i.time_start === null || i.time_start > newTime
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

/** Even 1000-apart sort_order values, preserving current relative order. */
export function renumberedOrders(existing: OrderableItem[]): { id: string; sort_order: number }[] {
  return [...existing]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item, idx) => ({ id: item.id, sort_order: (idx + 1) * GAP }));
}
