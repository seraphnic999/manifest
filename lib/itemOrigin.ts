// How an item's current content actually got there — set once, at the
// moment that source produced the item's content, and never overwritten
// afterward (so e.g. a Quick-Add-from-a-Maps-link item that's later
// re-researched keeps "google_link", the more specific and informative of
// the two). A manually typed item with no such moment just has no origin —
// there's nothing more specific to say about it than "you typed it in".
//
// "keeper" isn't listed here: an item created from a Keeper already has a
// real `keeper_id` column recording that, so this doesn't duplicate it.
export type ItemOrigin = "google_link" | "natural_language" | "email" | "research";

export const ITEM_ORIGIN_LABEL: Record<ItemOrigin, string> = {
  google_link: "Added from a Maps link",
  natural_language: "Added via Quick Add",
  email: "Added from a forwarded email",
  research: "Filled in by research",
};

export function itemOrigin(customFields: Record<string, unknown> | null | undefined): ItemOrigin | null {
  const o = customFields?.origin;
  return o === "google_link" || o === "natural_language" || o === "email" || o === "research" ? o : null;
}
