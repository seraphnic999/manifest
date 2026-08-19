// Duration is derived at display time from start/end date+time, never
// stored — same pattern as NIS conversion and shopping "bought" status.
import { normalizeTimeHHMM } from "./timeFormat";

export function computeDurationMinutes(
  startDate: string | null | undefined,
  startTime: string | null | undefined,
  endDate: string | null | undefined,
  endTime: string | null | undefined
): number | null {
  if (!startDate || !startTime || !endDate || !endTime) return null;
  // Postgres' `time` column echoes back "HH:MM:SS" — normalize before
  // building the Date string, since "${startTime}:00" would otherwise
  // double up the seconds (e.g. "14:30:00:00", an invalid Date).
  const start = new Date(`${startDate}T${normalizeTimeHHMM(startTime)}:00`);
  const end = new Date(`${endDate}T${normalizeTimeHHMM(endTime)}:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
