// Quick add: turns whatever was pasted or attached — a Google Maps link, a
// short natural-language sentence, any other URL, or a photo — into a real
// item, then hands it straight into the existing identify-item/research-item
// pipeline (via IdentifyCandidatesModal) exactly as if the user had typed
// the title into the normal new-item form.
import { supabase } from "./supabase";
import { computeInsertSortOrder } from "./reorder";
import { ItemType } from "./types";

const MAPS_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "maps.google.com"]);

/** Quick Add's single input has no mode tabs — this decides which of the
 * three text-based pipelines a pasted/typed value should go through.
 * Deliberately best-effort (e.g. only the common google.com/maps host
 * shapes, not every Google country-TLD variant) rather than exhaustive —
 * anything it misses just falls through to the "url"/"natural_language"
 * paths, which still work, just without the Maps-specific coordinate
 * extraction. Image input bypasses this entirely (its own picker button). */
export function detectQuickAddMode(value: string): "maps_link" | "url" | "natural_language" {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return "natural_language";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "natural_language";
  const host = url.hostname.replace(/^www\./, "");
  if (MAPS_HOSTS.has(host)) return "maps_link";
  if (host === "google.com" && url.pathname.startsWith("/maps")) return "maps_link";
  return "url";
}

export interface QuickAddMapsResult {
  title: string;
  latitude: number | null;
  longitude: number | null;
}

export interface QuickAddNLResult {
  title: string;
  item_type: ItemType;
  date: string | null;
  time: string | null;
}

export interface QuickAddUrlResult {
  title: string;
  /** The page's own stripped text — passed into identify-item as extra
   * context so a page that names the actual place a few paragraphs into
   * its own body still resolves correctly, not just whatever the page's
   * <title>/og:title happens to say. */
  pageText: string;
}

export async function parseMapsLink(url: string): Promise<{ result: QuickAddMapsResult | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("quick-add-parse", { body: { mode: "maps_link", url } });
  if (error) return { result: null, error: error.message ?? "Couldn't read that link." };
  if (data?.error) return { result: null, error: data.error };
  return { result: data as QuickAddMapsResult, error: null };
}

export async function parseNaturalLanguage(
  text: string, tripStart: string, tripEnd: string
): Promise<{ result: QuickAddNLResult | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("quick-add-parse", {
    body: { mode: "natural_language", text, trip_start: tripStart, trip_end: tripEnd },
  });
  if (error) return { result: null, error: error.message ?? "Couldn't parse that." };
  if (data?.error) return { result: null, error: data.error };
  return { result: data as QuickAddNLResult, error: null };
}

export async function parseUrl(url: string): Promise<{ result: QuickAddUrlResult | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("quick-add-parse", { body: { mode: "url", url } });
  if (error) return { result: null, error: error.message ?? "Couldn't read that link." };
  if (data?.error) return { result: null, error: data.error };
  return { result: { title: data.title, pageText: data.page_text }, error: null };
}

export async function parseImage(
  base64: string, mediaType: string
): Promise<{ result: QuickAddNLResult | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("quick-add-parse", {
    body: { mode: "image", base64, media_type: mediaType },
  });
  if (error) return { result: null, error: error.message ?? "Couldn't read that photo." };
  if (data?.error) return { result: null, error: data.error };
  return { result: data as QuickAddNLResult, error: null };
}

// Creates a minimal item row for a quick-add result. If a parsed date
// matches one of the trip's real days, the item lands there; otherwise it
// falls back to whichever day the user had open when they tapped Quick add
// (Proposals, from the trip overview FAB) — same default the plain add-item
// form uses, and just as reassignable afterward via its day picker.
export async function createQuickAddItem(params: {
  tripId: string;
  fallbackDayId: string;
  title: string;
  itemType: ItemType;
  date: string | null;
  time: string | null;
  latitude?: number | null;
  longitude?: number | null;
  origin: "google_link" | "natural_language" | "url" | "image";
}): Promise<{ id: string | null; error: string | null }> {
  let targetDayId = params.fallbackDayId;
  let startDate: string | null = null;

  if (params.date) {
    const { data: matchedDay } = await supabase
      .from("days").select("id, date").eq("trip_id", params.tripId).eq("date", params.date).maybeSingle();
    if (matchedDay) { targetDayId = matchedDay.id; startDate = matchedDay.date; }
  }
  if (startDate === null) {
    const { data: fallbackDay } = await supabase.from("days").select("date").eq("id", targetDayId).maybeSingle();
    startDate = fallbackDay?.date ?? null;
  }

  const { data: siblings } = await supabase
    .from("items").select("id, sort_order, time_start").eq("day_id", targetDayId).is("deleted_at", null);
  const sortOrder = computeInsertSortOrder(siblings ?? [], params.time || null);

  const { data: item, error } = await supabase.from("items").insert({
    trip_id: params.tripId,
    day_id: targetDayId,
    type: params.itemType,
    title: params.title,
    status: "planned",
    start_date: startDate,
    time_start: params.time || null,
    latitude: params.latitude ?? null,
    longitude: params.longitude ?? null,
    sort_order: sortOrder,
    custom_fields: { origin: params.origin },
  }).select().single();
  if (error || !item) return { id: null, error: error?.message ?? "Couldn't create the item." };
  return { id: item.id, error: null };
}
