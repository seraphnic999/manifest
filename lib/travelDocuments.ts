// Doc Tracker: travel documents (passport/ID/visa/etc.) attached to a
// companion — mirrors lib/companions.ts's private-bucket photo pattern,
// one photo per document instead of a list.
import { supabase } from "./supabase";
import { DocumentType, TravelDocument } from "./types";
import { IconName } from "@/components/icons/Icon";
import { readUriAsArrayBuffer } from "./fileBytes";

const BUCKET = "travel-documents";
const SIGNED_URL_TTL = 3600;

export const DOCUMENT_TYPE_OPTIONS: { value: DocumentType; label: string; icon: IconName }[] = [
  { value: "passport", label: "Passport", icon: "document" },
  { value: "national_id", label: "National ID", icon: "user" },
  { value: "visa", label: "Visa", icon: "flag" },
  { value: "drivers_license", label: "Driver's License", icon: "carRental" },
  { value: "other", label: "Other", icon: "document" },
];

export function documentTypeLabel(t: DocumentType): string {
  return DOCUMENT_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

export function documentTypeIcon(t: DocumentType): IconName {
  return DOCUMENT_TYPE_OPTIONS.find((o) => o.value === t)?.icon ?? "document";
}

export async function fetchDocumentsForCompanion(companionId: string): Promise<TravelDocument[]> {
  const { data, error } = await supabase
    .from("travel_documents").select("*").eq("companion_id", companionId).order("sort_order");
  if (error) throw error;
  return (data ?? []) as TravelDocument[];
}

export type DocumentFields = Pick<TravelDocument,
  "type" | "document_number" | "issuing_country" | "issue_date" | "expiry_date" | "notes"
>;

export async function createDocument(companionId: string, fields: DocumentFields): Promise<TravelDocument> {
  const { data: existing } = await supabase
    .from("travel_documents").select("sort_order").eq("companion_id", companionId)
    .order("sort_order", { ascending: false }).limit(1);
  const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;
  const { data, error } = await supabase
    .from("travel_documents").insert({ companion_id: companionId, sort_order: nextOrder, ...fields }).select().single();
  if (error) throw error;
  return data as TravelDocument;
}

export async function saveDocument(id: string, fields: DocumentFields): Promise<void> {
  const { error } = await supabase.from("travel_documents").update(fields).eq("id", id);
  if (error) throw error;
}

export async function deleteDocument(doc: Pick<TravelDocument, "id" | "photo_path">): Promise<void> {
  if (doc.photo_path) await supabase.storage.from(BUCKET).remove([doc.photo_path]);
  const { error } = await supabase.from("travel_documents").delete().eq("id", doc.id);
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

/** Replaces the document's photo (removing the old file, if any). */
export async function setDocumentPhoto(
  doc: Pick<TravelDocument, "id" | "photo_path">,
  asset: { uri: string; fileName?: string | null; mimeType?: string | null }
): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in");

  const ext = extensionFromAsset(asset);
  const path = `${userId}/${doc.id}/${Date.now()}.${ext}`;
  const bytes = await readUriAsArrayBuffer(asset.uri);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET).upload(path, bytes, { contentType: asset.mimeType || "application/octet-stream" });
  if (uploadError) throw uploadError;

  if (doc.photo_path) await supabase.storage.from(BUCKET).remove([doc.photo_path]);
  const { error } = await supabase.from("travel_documents").update({ photo_path: path }).eq("id", doc.id);
  if (error) throw error;
  return path;
}

export async function fetchDocumentPhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  return data?.signedUrl ?? null;
}
