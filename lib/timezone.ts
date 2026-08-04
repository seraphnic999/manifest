// Live UTC-offset label for an IANA timezone, e.g. "UTC+3" — computed
// from the current date so it's always correct across DST changes,
// rather than a hardcoded static offset.
export function tzOffsetLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    // Intl gives "GMT+3" / "GMT" — normalize to "UTC+3" / "UTC+0"
    return raw.replace("GMT", "UTC").replace(/^UTC$/, "UTC+0");
  } catch {
    return "";
  }
}

// Numeric offset in minutes (e.g. UTC+3 -> 180), for sorting — the display
// label above is derived separately since Intl gives us a formatted string,
// not a number, and re-parsing that string is more fragile than asking
// Intl for the numeric offset directly via a second, explicit computation.
export function tzOffsetMinutes(tz: string): number {
  try {
    const now = new Date();
    const utcDate = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
    const tzDate = new Date(now.toLocaleString("en-US", { timeZone: tz }));
    return Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
  } catch {
    return 0;
  }
}

export function sortedByOffsetDesc(zones: string[]): string[] {
  return [...zones].sort((a, b) => tzOffsetMinutes(b) - tzOffsetMinutes(a));
}

export const COMMON_TIMEZONES = [
  "Asia/Jerusalem", "Europe/London", "Europe/Paris", "Europe/Madrid",
  "Europe/Rome", "Europe/Bucharest", "Europe/Athens", "Europe/Berlin",
  "Europe/Amsterdam", "Europe/Lisbon", "Europe/Istanbul", "Europe/Moscow",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Toronto", "America/Mexico_City", "America/Sao_Paulo",
  "Asia/Tokyo", "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Singapore",
  "Asia/Bangkok", "Asia/Dubai", "Asia/Kolkata",
  "Australia/Sydney", "Pacific/Auckland",
];

export const COMMON_CURRENCIES = ["EUR", "USD", "GBP", "RON", "TRY", "CHF", "THB", "JPY"];
