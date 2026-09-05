// Dates are stored/passed around internally as ISO "YYYY-MM-DD" strings
// (sorting, day-matching, and lodging-span logic all depend on that form).
// These helpers only affect what's rendered to the user — always dd/mm/yyyy,
// regardless of browser/OS locale. Plain string split, not a Date round-trip,
// so there's no timezone-shift risk on the display side.

export function formatDateDDMMYYYY(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

// Compact form (no year) for tight spaces like the day-picker pill strip.
export function formatDateDDMM(iso: string | null | undefined): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  if (!m || !d) return iso;
  return `${d}/${m}`;
}

// "Today" as the device's own local calendar date — NOT
// `new Date().toISOString().slice(0, 10)`, which is UTC and rolls back to
// the previous day for several hours after local midnight anywhere east of
// UTC (e.g. until ~03:00 in Israel). A traveler's phone tracks local time
// for wherever they actually are, so local components are what "today"
// should mean here.
export function localIsoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
