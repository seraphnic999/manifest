import { supabase } from "./supabase";
import { ItemPhoto } from "./types";

const BUCKET = "item-photos";
const SIGNED_URL_TTL = 3600; // 1 hour — regenerated each time photos are loaded

/** Uploads a picked image (local URI) and records it against the item. */
export async function uploadItemPhoto(itemId: string, localUri: string, caption?: string) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in");

  const ext = localUri.split(".").pop()?.split("?")[0] || "jpg";
  const path = `${userId}/${itemId}/${Date.now()}.${ext}`;

  const response = await fetch(localUri);
  const blob = await response.blob();

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type || "image/jpeg" });
  if (uploadError) throw uploadError;

  const { data: existing } = await supabase
    .from("item_photos").select("sort_order").eq("item_id", itemId).order("sort_order", { ascending: false }).limit(1);
  const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { error: insertError } = await supabase.from("item_photos").insert({
    item_id: itemId, storage_path: path, caption: caption || null, sort_order: nextOrder,
  });
  if (insertError) throw insertError;
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
