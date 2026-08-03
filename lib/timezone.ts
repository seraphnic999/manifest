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

export const COMMON_TIMEZONES = [
  "Asia/Jerusalem", "Europe/London", "Europe/Bucharest", "Europe/Madrid",
  "Europe/Rome", "Europe/Paris", "America/New_York", "Asia/Tokyo",
];

export const COMMON_CURRENCIES = ["EUR", "USD", "GBP", "RON", "TRY", "CHF", "THB", "JPY"];
