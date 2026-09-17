// Doc Tracker: travel documents (passport/ID/visa/etc.) attached to a
// companion — mirrors lib/companions.ts's private-bucket photo pattern,
// one photo per document instead of a list.
import { supabase } from "./supabase";
import { DocumentType, TravelDocument } from "./types";
import { IconName } from "@/components/icons/Icon";
import { readUriAsArrayBuffer } from "./fileBytes";

const BUCKET = "travel-documents";
const SIGNED_URL_TTL = 3600;

type Confidence = "high" | "medium" | "low" | "none";

export interface DocumentScanResult {
  document_type: DocumentType;
  document_type_confidence: Confidence;
  document_number: string | null;
  document_number_confidence: Confidence;
  full_name: string | null;
  full_name_confidence: Confidence;
  issuing_country: string | null;
  issuing_country_confidence: Confidence;
  issue_date: string | null;
  issue_date_confidence: Confidence;
  expiry_date: string | null;
  expiry_date_confidence: Confidence;
  used_mrz: boolean;
  unresolved: string | null;
}

/** Reads a document photo with parse-document — either an existing
 * document's own photo (documentId) or a not-yet-attached one sitting at a
 * pending path (photoPath, see uploadPendingDocumentPhoto). Exactly one of
 * the two should be passed. */
export async function scanDocument(target: { documentId: string } | { photoPath: string }): Promise<DocumentScanResult> {
  const body = "documentId" in target ? { document_id: target.documentId } : { photo_path: target.photoPath };
  const { data, error } = await supabase.functions.invoke("parse-document", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.extracted as DocumentScanResult;
}

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

/** Uploads a document photo before any travel_documents row exists yet —
 * the Doc Tracker main-page "Add document" flow scans a photo to identify
 * which companion it belongs to (or whether a new one is needed) before a
 * document (or companion) id is available to hang a normal upload off of.
 * The path is still scoped under the owner's own folder (the only thing
 * this bucket's RLS actually checks), just with a placeholder "_pending"
 * segment instead of a real document id. */
export async function uploadPendingDocumentPhoto(
  asset: { uri: string; fileName?: string | null; mimeType?: string | null }
): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in");

  const ext = extensionFromAsset(asset);
  const path = `${userId}/_pending/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const bytes = await readUriAsArrayBuffer(asset.uri);
  const { error } = await supabase.storage
    .from(BUCKET).upload(path, bytes, { contentType: asset.mimeType || "application/octet-stream" });
  if (error) throw error;
  return path;
}

/** Cleans up a pending photo the user never turned into a real document
 * (cancelled the scan, discarded the review, etc.). */
export async function deletePendingDocumentPhoto(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}

/** Creates a document already pointing at a photo that's been uploaded —
 * the pending-photo counterpart to createDocument() + setDocumentPhoto():
 * the photo is already sitting in storage (from uploadPendingDocumentPhoto),
 * so this just points the new row at it directly instead of uploading a
 * second time. */
export async function createDocumentWithPhoto(companionId: string, fields: DocumentFields, photoPath: string): Promise<TravelDocument> {
  const { data: existing } = await supabase
    .from("travel_documents").select("sort_order").eq("companion_id", companionId)
    .order("sort_order", { ascending: false }).limit(1);
  const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;
  const { data, error } = await supabase
    .from("travel_documents")
    .insert({ companion_id: companionId, sort_order: nextOrder, photo_path: photoPath, ...fields })
    .select().single();
  if (error) throw error;
  return data as TravelDocument;
}

export async function fetchDocumentPhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  return data?.signedUrl ?? null;
}
