-- ============================================================
-- Manifest — Migration 012: add items.google_maps_link
-- ============================================================
-- Optional, separate from the existing `link` field (which is the item's
-- own booking/info URL). Opens in a new tab on web, deep-links to the
-- Google Maps app on native — same Linking.openURL(url) call handles both,
-- see components/... item detail page.
-- ============================================================

alter table items add column google_maps_link text;
