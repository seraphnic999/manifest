// Doc Tracker: travel companions (people the user might travel with,
// including the user themself via is_self) — mirrors lib/photos.ts's
// private-bucket + signed-URL shape for profile/additional photos.
import { supabase } from "./supabase";
import { Companion, CompanionPhoto, Relationship } from "./types";

const BUCKET = "companion-photos";
const SIGNED_URL_TTL = 3600;

export const RELATIONSHIP_OPTIONS: { value: Relationship; label: string }[] = [
  { value: "mother", label: "Mother" },
  { value: "father", label: "Father" },
  { value: "brother", label: "Brother" },
  { value: "sister", label: "Sister" },
  { value: "wife", label: "Wife" },
  { value: "husband", label: "Husband" },
  { value: "son", label: "Son" },
  { value: "daughter", label: "Daughter" },
  { value: "friend", label: "Friend" },
  { value: "other", label: "Other" },
];

const FAMILY_RELATIONSHIPS: Relationship[] = [
  "mother", "father", "brother", "sister", "wife", "husband", "son", "daughter",
];

export function relationshipLabel(r: Relationship | null): string {
  if (!r) return "";
  return RELATIONSHIP_OPTIONS.find((o) => o.value === r)?.label ?? r;
}

export type CompanionGroup = "family" | "friends" | "others";

/** Which Doc Tracker list section a (non-self) companion belongs in. */
export function relationshipGroup(c: Pick<Companion, "relationship">): CompanionGroup {
  if (c.relationship && FAMILY_RELATIONSHIPS.includes(c.relationship)) return "family";
  if (c.relationship === "friend") return "friends";
  return "others";
}

export function companionFullName(c: Pick<Companion, "first_name" | "last_name">): string {
  return [c.first_name, c.last_name].filter(Boolean).join(" ");
}

export async function fetchCompanions(): Promise<Companion[]> {
  const { data, error } = await supabase
    .from("companions").select("*")
    .order("is_self", { ascending: false })
    .order("first_name");
  if (error) throw error;
  return (data ?? []) as Companion[];
}

export async function fetchCompanion(id: string): Promise<Companion> {
  const { data, error } = await supabase.from("companions").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Companion;
}

/** Creates the user's own "Me" companion row the first time Doc Tracker is
 * opened, if it doesn't exist yet — a placeholder name they can rename
 * straight away rather than a special-cased empty state in the list. */
export async function ensureSelfCompanion(): Promise<void> {
  const { data: existing } = await supabase.from("companions").select("id").eq("is_self", true).maybeSingle();
  if (existing) return;
  const { data: userData } = await supabase.auth.getUser();
  const emailName = userData.user?.email?.split("@")[0] ?? "Me";
  await supabase.from("companions").insert({
    is_self: true, first_name: emailName, last_name: "", relationship: null,
  });
}

export async function createCompanion(fields: {
  first_name: string; last_name: string; relationship: Relationship;
}): Promise<Companion> {
  const { data, error } = await supabase.from("companions").insert(fields).select().single();
  if (error) throw error;
  return data as Companion;
}

export async function saveCompanion(id: string, fields: Partial<Pick<Companion,
  "first_name" | "last_name" | "birth_date" | "relationship" | "notes"
>>): Promise<void> {
  const { error } = await supabase.from("companions").update(fields).eq("id", id);
  if (error) throw error;
}

export async function deleteCompanion(id: string): Promise<void> {
  const { error } = await supabase.from("companions").delete().eq("id", id);
  if (error) throw error;
}

function extensionFromAsset(asset: { uri: string; fileName?: string | null; mimeType?: string | null }): string {
  const fromName = asset.fileName?.match(/\.([a-zA-Z0-9]+)$/)?.[1];
  if (fromName) return fromName.toLowerCase();
  const fromMime = asset.mimeType?.split("/")[1];
  if (fromMime) return fromMime.toLowerCase().replace("jpeg", "jpg");
  const fromUri = asset.uri.split(".").pop()?.split("?")[0];
  if (fromUri && fromUri.length <= 5 && !/[:,;]/.test(fromUri)) return fromUri.toLowerCase();
  return "jpg";
}

async function uploadToCompanionBucket(
  companionId: string,
  asset: { uri: string; fileName?: string | null; mimeType?: string | null }
): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in");

  const ext = extensionFromAsset(asset);
  const path = `${userId}/${companionId}/${Date.now()}.${ext}`;
  const response = await fetch(asset.uri);
  const blob = await response.blob();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: asset.mimeType || blob.type || "application/octet-stream" });
  if (error) throw error;
  return path;
}

/** Replaces the companion's single profile photo (removing the old file, if any). */
export async function setCompanionProfilePhoto(
  companion: Pick<Companion, "id" | "profile_photo_path">,
  asset: { uri: string; fileName?: string | null; mimeType?: string | null }
): Promise<string> {
  const path = await uploadToCompanionBucket(companion.id, asset);
  if (companion.profile_photo_path) {
    await supabase.storage.from(BUCKET).remove([companion.profile_photo_path]);
  }
  const { error } = await supabase.from("companions").update({ profile_photo_path: path }).eq("id", companion.id);
  if (error) throw error;
  return path;
}

export async function addCompanionPhoto(
  companionId: string,
  asset: { uri: string; fileName?: string | null; mimeType?: string | null }
): Promise<void> {
  const path = await uploadToCompanionBucket(companionId, asset);
  const { data: existing } = await supabase
    .from("companion_photos").select("sort_order").eq("companion_id", companionId)
    .order("sort_order", { ascending: false }).limit(1);
  const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;
  const { error } = await supabase.from("companion_photos").insert({ companion_id: companionId, storage_path: path, sort_order: nextOrder });
  if (error) throw error;
}

export async function deleteCompanionPhoto(photo: CompanionPhoto): Promise<void> {
  await supabase.storage.from(BUCKET).remove([photo.storage_path]);
  await supabase.from("companion_photos").delete().eq("id", photo.id);
}

async function signedUrl(path: string): Promise<string> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  return data?.signedUrl ?? "";
}

export async function fetchCompanionProfileUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const url = await signedUrl(path);
  return url || null;
}

export async function fetchCompanionPhotosWithUrls(companionId: string): Promise<(CompanionPhoto & { url: string })[]> {
  const { data } = await supabase.from("companion_photos").select("*").eq("companion_id", companionId).order("sort_order");
  if (!data || data.length === 0) return [];
  const withUrls = await Promise.all(
    (data as CompanionPhoto[]).map(async (p) => ({ ...p, url: await signedUrl(p.storage_path) }))
  );
  return withUrls.filter((p) => p.url);
}
