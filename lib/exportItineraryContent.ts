import { supabase } from "./supabase";
import { Trip, Day, Item } from "./types";
import { formatDateDDMMYYYY } from "./dateFormat";
import { normalizeTimeHHMM } from "./timeFormat";
import { categoryForDbType } from "./itemTypeMeta";

// Shared between the native (expo-print) and web (pdfmake) itinerary
// exporters — pulled into its own module (rather than living in
// lib/exportItinerary.ts) so that file can stay platform-split
// (exportItinerary.ts / exportItinerary.web.ts) without the .web.ts
// variant's relative import of "./exportItinerary" ambiguously resolving
// back to itself under Metro's platform-extension resolution.

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function itemTypeLabel(item: Item): string {
  const category = categoryForDbType(item.type);
  return category.subtypeLabels?.[item.type] ?? category.label;
}

function itemTimeLabel(item: Item): string {
  if (item.is_stay_span) {
    const start = [formatDateDDMMYYYY(item.start_date), normalizeTimeHHMM(item.time_start)].filter(Boolean).join(" ");
    const end = [formatDateDDMMYYYY(item.end_date), normalizeTimeHHMM(item.time_end)].filter(Boolean).join(" ");
    return [start, end].filter(Boolean).join(" → ");
  }
  return normalizeTimeHHMM(item.time_start) || "";
}

function itemDetailLines(item: Item, quickNotes: string[]): string[] {
  const lines: string[] = [];
  if (item.vendor) lines.push(`Vendor: ${item.vendor}`);
  const flightNumber = (item.custom_fields as any)?.flight_number as string | undefined;
  if (flightNumber) lines.push(`Flight: ${flightNumber}`);
  if (item.address) lines.push(`Address: ${item.address}`);
  if (item.phone) lines.push(`Phone: ${item.phone}`);
  if (item.confirmation_code) lines.push(`Confirmation: ${item.confirmation_code}`);
  if (item.booking_source) lines.push(`Booked via: ${item.booking_source}`);
  if (item.link) lines.push(`Link: ${item.link}`);
  for (const note of quickNotes) {
    if (note.trim()) lines.push(`Note: ${note}`);
  }
  return lines;
}

export interface ItineraryDay {
  day: Day;
  stays: Item[];   // lodging spans covering this day, shown pinned above the timeline
  items: Item[];
}

export interface ItineraryData {
  trip: Trip;
  days: ItineraryDay[];
  notesByItem: Map<string, string[]>;
}

export async function fetchItineraryData(tripId: string): Promise<ItineraryData> {
  const { data: trip } = await supabase.from("trips").select("*").eq("id", tripId).single();
  const { data: days } = await supabase.from("days").select("*").eq("trip_id", tripId).order("sort_order");
  const { data: items } = await supabase
    .from("items").select("*").eq("trip_id", tripId).is("deleted_at", null).order("sort_order");
  if (!trip) throw new Error("Trip not found");

  const itemList = (items ?? []) as Item[];
  const notesByItem = new Map<string, string[]>();
  if (itemList.length > 0) {
    const { data: quickNotes } = await supabase
      .from("item_quick_notes").select("item_id, text, sort_order")
      .in("item_id", itemList.map((i) => i.id)).order("sort_order");
    for (const n of quickNotes ?? []) {
      const bucket = notesByItem.get(n.item_id) ?? [];
      bucket.push(n.text);
      notesByItem.set(n.item_id, bucket);
    }
  }

  const itemsByDay = new Map<string, Item[]>();
  const lodgingSpans: Item[] = [];
  for (const item of itemList) {
    if (item.is_stay_span) { lodgingSpans.push(item); continue; }
    if (!item.day_id) continue;
    const bucket = itemsByDay.get(item.day_id) ?? [];
    bucket.push(item);
    itemsByDay.set(item.day_id, bucket);
  }

  // The "Proposals" day (date === null) is an undated holding pen, not a
  // real part of the trip — never printed on the itinerary.
  const itineraryDays: ItineraryDay[] = ((days ?? []) as Day[])
    .filter((day) => day.date !== null)
    .map((day) => ({
      day,
      // Same rule the day view itself uses: a lodging stay "covers" this day
      // if the day's date falls within [start_date, end_date] — shown pinned
      // above the day's ordered items, not as its own timeline entry.
      stays: lodgingSpans.filter((s) => s.start_date && s.end_date && day.date && s.start_date <= day.date && day.date <= s.end_date),
      items: itemsByDay.get(day.id) ?? [],
    }));

  return { trip: trip as Trip, days: itineraryDays, notesByItem };
}

export { itemTypeLabel, itemTimeLabel, itemDetailLines };
