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
