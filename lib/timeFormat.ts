// Times are edited as "HH:MM" but Postgres' `time` column always echoes
// back "HH:MM:SS" on read — this strips a trailing :SS if present so every
// display and re-edit is a plain 24-hour "HH:MM", never seconds or AM/PM.
export function normalizeTimeHHMM(t: string | null | undefined): string {
  if (!t) return "";
  return t.slice(0, 5);
}
