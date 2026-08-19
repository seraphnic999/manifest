import { supabase } from "./supabase";
import { ItemPhoto } from "./types";

const BUCKET = "item-photos";
const SIGNED_URL_TTL = 3600; // 1 hour — regenerated each time photos are loaded

// On web, expo-image-picker returns a base64 "data:image/jpeg;base64,...."
// URI (there's no real file path to read an extension from — a naive
// `uri.split(".").pop()` matches nothing-but-a-dot in that whole string, so
// it returned the ENTIRE base64 payload as the "extension", producing a
// path like ".../167123.data:image/png;base64,iVBORw0KG...". Small test
// images slipped under storage path-length limits and silently "worked"
// with a garbage path; any real-sized photo would blow past those limits
// and fail outright. Prefer the asset's real fileName/mimeType (present on
// both platforms) and only fall back to URI parsing for native's file://
// URIs, which do have a genuine extension.
function extensionFromAsset(asset: { uri: string; fileName?: string | null; mimeType?: string | null }): string {
  const fromName = asset.fileName?.match(/\.([a-zA-Z0-9]+)$/)?.[1];
  if (fromName) return fromName.toLowerCase();

  const fromMime = asset.mimeType?.split("/")[1];
  if (fromMime) return fromMime.toLowerCase().replace("jpeg", "jpg");

  const fromUri = asset.uri.split(".").pop()?.split("?")[0];
  if (fromUri && fromUri.length <= 5 && !/[:,;]/.test(fromUri)) return fromUri.toLowerCase();

  return "jpg";
}

/** Uploads a picked image (local URI) and records it against the item. */
export async function uploadItemPhoto(
  itemId: string,
  asset: { uri: string; fileName?: string | null; mimeType?: string | null },
  caption?: string
) {
  return uploadItemAttachment(itemId, {
    uri: asset.uri,
    fileName: asset.fileName ?? null,
    mimeType: asset.mimeType ?? null,
  }, caption);
}

/** Uploads a picked document (PDF etc., local URI) and records it against the item. */
export async function uploadItemDocument(
  itemId: string,
  asset: { uri: string; name?: string | null; mimeType?: string | null },
  caption?: string
) {
  return uploadItemAttachment(itemId, {
    uri: asset.uri,
    fileName: asset.name ?? null,
    mimeType: asset.mimeType ?? null,
  }, caption);
}

/** Shared upload path for any item attachment (photo or document). */
async function uploadItemAttachment(
  itemId: string,
  asset: { uri: string; fileName: string | null; mimeType: string | null },
  caption?: string
) {
  // The storage path is always prefixed with the trip OWNER's id, not the
  // uploader's — a shared collaborator uploading under their own id would
  // produce a path the storage RLS policy (which checks the trip owner via
  // that prefix) could never match for anyone else, including the owner.
  const { data: itemRow } = await supabase.from("items").select("trip_id").eq("id", itemId).single();
  const { data: tripRow } = itemRow
    ? await supabase.from("trips").select("user_id").eq("id", itemRow.trip_id).single()
    : { data: null };
  const ownerId = tripRow?.user_id;
  if (!ownerId) throw new Error("Couldn't resolve the trip for this item");

  const ext = extensionFromAsset({ uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType });
  const path = `${ownerId}/${itemId}/${Date.now()}.${ext}`;

  const response = await fetch(asset.uri);
  const blob = await response.blob();

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: asset.mimeType || blob.type || "application/octet-stream" });
  if (uploadError) throw uploadError;

  const { data: existing } = await supabase
    .from("item_photos").select("sort_order").eq("item_id", itemId).order("sort_order", { ascending: false }).limit(1);
  const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { error: insertError } = await supabase.from("item_photos").insert({
    item_id: itemId,
    storage_path: path,
    caption: caption || null,
    file_name: asset.fileName || null,
    mime_type: asset.mimeType || null,
    sort_order: nextOrder,
  });
  if (insertError) {
    // PGRST204 = PostgREST's schema cache has no such column: this project
    // hasn't run migration_002 yet, which adds file_name/mime_type to
    // item_photos. Fall back to the old column set so photo uploads
    // (already working before this feature) keep working unchanged until
    // the migration is applied.
    if (insertError.code === "PGRST204") {
      const { error: fallbackError } = await supabase.from("item_photos").insert({
        item_id: itemId, storage_path: path, caption: caption || null, sort_order: nextOrder,
      });
      if (fallbackError) throw fallbackError;
      return;
    }
    throw insertError;
  }
}

/** An attachment with a null/image mime_type is an image (every row before this feature existed is a photo). */
export function isImageAttachment(photo: Pick<ItemPhoto, "mime_type">): boolean {
  return !photo.mime_type || photo.mime_type.startsWith("image/");
}

/** Fetches an item's photos plus a temporary signed URL for each (bucket is private). */
export async function fetchItemPhotosWithUrls(itemId: string): Promise<(ItemPhoto & { url: string })[]> {
  const { data: photos } = await supabase
    .from("item_photos").select("*").eq("item_id", itemId).order("sort_order");
  if (!photos || photos.length === 0) return [];

  const withUrls = await Promise.all(
    (photos as ItemPhoto[]).map(async (p) => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(p.storage_path, SIGNED_URL_TTL);
      return { ...p, url: data?.signedUrl ?? "" };
    })
  );
  return withUrls.filter((p) => p.url);
}

export async function deleteItemPhoto(photo: ItemPhoto) {
  await supabase.storage.from(BUCKET).remove([photo.storage_path]);
  await supabase.from("item_photos").delete().eq("id", photo.id);
}
