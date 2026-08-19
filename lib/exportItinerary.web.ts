import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { formatDateDDMMYYYY } from "./dateFormat";
import { itemTypeLabel, itemTimeLabel, itemDetailLines, fetchItineraryData, ItineraryDay } from "./exportItineraryContent";
import { Item } from "./types";

(pdfMake as any).vfs = pdfFonts;

function itemNode(item: Item, notesByItem: Map<string, string[]>): Content {
  const time = itemTimeLabel(item);
  const details = itemDetailLines(item, notesByItem.get(item.id) ?? []);
  return {
    margin: [0, 0, 0, 8],
    stack: [
      {
        text: [
          ...(time ? [{ text: `${time}   `, style: "itemTime" }] : []),
          { text: `${itemTypeLabel(item).toUpperCase()}   `, style: "itemMeta" },
          { text: item.title, style: "itemTitle" },
        ],
      },
      ...(details.length ? [{ text: details.join("\n"), style: "itemDetails" }] : []),
    ],
  };
}

function dayNode(d: ItineraryDay, notesByItem: Map<string, string[]>): Content[] {
  return [
    {
      text: [
        { text: formatDateDDMMYYYY(d.day.date), style: "dayDate" },
        ...(d.day.theme ? [{ text: `   ${d.day.theme}`, style: "dayTheme" }] : []),
      ],
      margin: [0, 14, 0, 6],
      style: "dayHeader",
    },
    ...d.stays.map((s): Content => ({
      text: [{ text: "STAY   ", style: "stayLabel" }, { text: s.title, style: "stayTitle" }],
      margin: [0, 0, 0, 6],
    })),
    ...(d.items.length
      ? d.items.map((i) => itemNode(i, notesByItem))
      : [{ text: "Nothing planned.", style: "empty" } as Content]),
  ];
}

/**
 * Exports a trip's day-by-day itinerary (items only — no shopping list or
 * expenses) to a PDF on web. Built with pdfmake (a pure-JS, vector PDF
 * generator with no DOM/canvas rendering dependency — unlike jsPDF's
 * html() mode, which pulls in html2canvas and broke Metro's web bundling
 * here). Triggers a direct file download via a same-document <a download>
 * click rather than opening a new tab/window: blob: URLs are scoped to the
 * document that created them, so navigating a *different* browsing context
 * (a popup) to one silently fails in Chrome (stays on about:blank, no
 * error) — a same-document anchor click avoids that entirely and also
 * avoids any print dialog. See exportItinerary.ts for the native
 * implementation.
 */
export async function exportTripItineraryPdf(tripId: string): Promise<void> {
  const { trip, days, notesByItem } = await fetchItineraryData(tripId);
  const dateRange = `${formatDateDDMMYYYY(trip.start_date)} – ${formatDateDDMMYYYY(trip.end_date)}`;

  const docDefinition: TDocumentDefinitions = {
    pageMargins: [40, 40, 40, 40],
    content: [
      { text: trip.name, style: "header" },
      { text: dateRange, style: "subtitle" },
      ...days.flatMap((d) => dayNode(d, notesByItem)),
    ],
    styles: {
      header: { fontSize: 20, bold: true },
      subtitle: { fontSize: 11, color: "#666666", margin: [0, 2, 0, 4] },
      dayHeader: { margin: [0, 14, 0, 6] },
      dayDate: { fontSize: 14, bold: true },
      dayTheme: { fontSize: 11, italics: true, color: "#555555" },
      stayLabel: { fontSize: 9, bold: true, color: "#a07a2e" },
      stayTitle: { fontSize: 11, bold: true },
      itemTime: { fontSize: 10, bold: true },
      itemMeta: { fontSize: 8, color: "#888888" },
      itemTitle: { fontSize: 11, bold: true },
      itemDetails: { fontSize: 9, color: "#555555", lineHeight: 1.3 },
      empty: { fontSize: 10, italics: true, color: "#999999" },
    },
    defaultStyle: { fontSize: 10 },
  };

  const blob = await pdfMake.createPdf(docDefinition).getBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${trip.name}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
