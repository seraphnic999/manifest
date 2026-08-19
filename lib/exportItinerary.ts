import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { formatDateDDMMYYYY } from "./dateFormat";
import { escapeHtml, itemTypeLabel, itemTimeLabel, itemDetailLines, fetchItineraryData, ItineraryDay } from "./exportItineraryContent";
import { Item } from "./types";

function renderItem(item: Item, notesByItem: Map<string, string[]>): string {
  const time = itemTimeLabel(item);
  const details = itemDetailLines(item, notesByItem.get(item.id) ?? []);
  return `
    <div class="item">
      <div class="item-head">
        ${time ? `<span class="item-time">${escapeHtml(time)}</span>` : ""}
        <span class="item-type">${escapeHtml(itemTypeLabel(item))}</span>
        <span class="item-title">${escapeHtml(item.title)}</span>
      </div>
      ${details.length ? `<div class="item-details">${details.map((l) => escapeHtml(l)).join("<br/>")}</div>` : ""}
    </div>`;
}

function renderStayBanner(item: Item): string {
  return `
    <div class="stay-banner">
      <span class="stay-label">STAY</span>
      <span class="stay-title">${escapeHtml(item.title)}</span>
    </div>`;
}

function renderDay(d: ItineraryDay, notesByItem: Map<string, string[]>): string {
  return `
    <div class="day">
      <div class="day-header">
        <span class="day-date">${escapeHtml(formatDateDDMMYYYY(d.day.date))}</span>
        ${d.day.theme ? `<span class="day-theme">${escapeHtml(d.day.theme)}</span>` : ""}
      </div>
      ${d.stays.map(renderStayBanner).join("")}
      ${d.items.length ? d.items.map((i) => renderItem(i, notesByItem)).join("") : `<div class="empty">Nothing planned.</div>`}
    </div>`;
}

/**
 * Exports a trip's day-by-day itinerary (items only — no shopping list or
 * expenses) to a PDF saved on the user's device, via expo-print + the OS
 * share sheet (the standard Expo pattern, also used for attachment
 * downloads). See exportItinerary.web.ts for the web implementation.
 */
export async function exportTripItineraryPdf(tripId: string): Promise<void> {
  const { trip, days, notesByItem } = await fetchItineraryData(tripId);
  const dateRange = `${formatDateDDMMYYYY(trip.start_date)} – ${formatDateDDMMYYYY(trip.end_date)}`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(trip.name)}</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #2b2b2b; margin: 32px; }
  h1 { font-size: 24px; margin-bottom: 2px; }
  .subtitle { color: #666; font-size: 13px; margin-bottom: 24px; }
  .day { margin-bottom: 22px; page-break-inside: avoid; }
  .day-header { border-bottom: 2px solid #2b2b2b; padding-bottom: 4px; margin-bottom: 10px; display: flex; align-items: baseline; gap: 10px; }
  .day-date { font-size: 16px; font-weight: 700; }
  .day-theme { font-size: 13px; color: #555; font-style: italic; }
  .stay-banner { background: #f0ece0; border-radius: 6px; padding: 6px 10px; margin-bottom: 10px; display: flex; gap: 8px; align-items: baseline; }
  .stay-label { font-size: 10px; font-weight: 700; letter-spacing: 0.5px; color: #a07a2e; }
  .stay-title { font-size: 13px; font-weight: 600; }
  .item { margin-bottom: 10px; padding-left: 4px; border-left: 3px solid #ddd; padding: 4px 0 4px 10px; }
  .item-head { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .item-time { font-family: monospace; font-weight: 700; font-size: 12px; min-width: 42px; }
  .item-type { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; }
  .item-title { font-size: 14px; font-weight: 600; }
  .item-details { font-size: 11px; color: #555; margin-top: 2px; line-height: 1.5; }
  .empty { font-size: 12px; color: #999; font-style: italic; }
</style>
</head>
<body>
  <h1>${escapeHtml(trip.name)}</h1>
  <div class="subtitle">${escapeHtml(dateRange)}</div>
  ${days.map((d) => renderDay(d, notesByItem)).join("")}
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
  }
}
