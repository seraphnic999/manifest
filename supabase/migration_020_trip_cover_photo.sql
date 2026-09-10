-- v19 redesign: a trip's cover photo is one of a bundled, app-shipped set of
-- destination photos (see lib/destinationPhotos.ts), picked at trip
-- create/edit time — not a user upload, so this is just an id reference, not
-- a storage path. Null means "no photo chosen" and the app falls back to a
-- generic placeholder image (also bundled), not an error state.
alter table trips add column cover_photo_id text;
