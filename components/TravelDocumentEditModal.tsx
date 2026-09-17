import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, TextInput, ScrollView, Image, ActivityIndicator } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors, radius, fonts } from "@/lib/theme";
import Icon from "@/components/icons/Icon";
import Checkbox from "@/components/Checkbox";
import { Alert } from "@/lib/alert";
import { DocumentType, TravelDocument } from "@/lib/types";
import {
  DOCUMENT_TYPE_OPTIONS, createDocument, saveDocument, deleteDocument,
  setDocumentPhoto, fetchDocumentPhotoUrl, DocumentFields, documentTypeLabel,
  scanDocument, DocumentScanResult,
} from "@/lib/travelDocuments";
import { DateField } from "@/components/DateTimeFields";
import PhotoLightbox from "@/components/PhotoLightbox";

type Confidence = "high" | "medium" | "low" | "none";
type ScanResult = DocumentScanResult;

type ScanFieldKey = "document_type" | "document_number" | "issuing_country" | "issue_date" | "expiry_date";

const CONFIDENCE_COLOR: Record<Confidence, string> = {
  high: "#3E8E5A", medium: colors.gold, low: colors.coral, none: colors.inkSoft,
};

function scanFieldDisplay(key: ScanFieldKey, value: unknown): string {
  if (value === null || value === undefined || value === "") return "(not found)";
  return key === "document_type" ? documentTypeLabel(value as DocumentType) : String(value);
}

interface Props {
  visible: boolean;
  onClose: () => void;
  companionId: string;
  document: TravelDocument | null; // null = create mode
  onSaved: () => void;
  /** Set when this modal was opened via the "Scan from gallery/camera"
   * option on the add-document sheet (create mode only) — on open, goes
   * straight into picking a photo from that source and scanning it, instead
   * of waiting for the user to press "Add photo" then "Scan with AI"
   * themselves. Manual entry (the default) leaves this unset. */
  initialAction?: "gallery" | "camera";
}

export default function TravelDocumentEditModal({ visible, onClose, companionId, document, onSaved, initialAction }: Props) {
  const [type, setType] = useState<DocumentType>("passport");
  const [documentNumber, setDocumentNumber] = useState("");
  const [issuingCountry, setIssuingCountry] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // Tracks the row backing this modal once one exists — either passed in
  // (edit mode) or created implicitly the first time a photo is picked
  // before the user has pressed Save (create mode used to hard-block photo
  // picking until an explicit save; now it silently creates the row instead).
  const [docId, setDocId] = useState<string | null>(document?.id ?? null);
  const [photoStoragePath, setPhotoStoragePath] = useState<string | null>(document?.photo_path ?? null);
  // True only when THIS modal session created the row (vs. it already
  // existing) — Cancel needs to know whether to undo that creation.
  const [implicitlyCreated, setImplicitlyCreated] = useState(false);
  const [photoChanged, setPhotoChanged] = useState(false);
  const initialSnapshotRef = useRef("");

  // AI scan (parse-document): proposes fields for review, same "never write
  // until a human applies it" shape as item research — this only ever calls
  // the setters below, never the DB directly. Committing still goes through
  // the normal Save button once the reviewed values are sitting in the form.
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanSelected, setScanSelected] = useState<Record<ScanFieldKey, boolean>>({
    document_type: false, document_number: false, issuing_country: false, issue_date: false, expiry_date: false,
  });

  function fieldsSnapshot() {
    return JSON.stringify({ type, documentNumber, issuingCountry, issueDate, expiryDate, notes });
  }

  useEffect(() => {
    if (!visible) return;
    setType(document?.type ?? "passport");
    setDocumentNumber(document?.document_number ?? "");
    setIssuingCountry(document?.issuing_country ?? "");
    setIssueDate(document?.issue_date ?? "");
    setExpiryDate(document?.expiry_date ?? "");
    setNotes(document?.notes ?? "");
    setDocId(document?.id ?? null);
    setPhotoStoragePath(document?.photo_path ?? null);
    setImplicitlyCreated(false);
    setPhotoChanged(false);
    setScanResult(null);
    setScanning(false);
    if (document?.photo_path) fetchDocumentPhotoUrl(document.photo_path).then(setPhotoUrl);
    else setPhotoUrl(null);
    // Runs after the state above is queued, so it captures this document's
    // own values, not whatever the modal last showed.
    initialSnapshotRef.current = JSON.stringify({
      type: document?.type ?? "passport",
      documentNumber: document?.document_number ?? "",
      issuingCountry: document?.issuing_country ?? "",
      issueDate: document?.issue_date ?? "",
      expiryDate: document?.expiry_date ?? "",
      notes: document?.notes ?? "",
    });
  }, [visible, document]);

  function currentFields(): DocumentFields {
    return {
      type,
      document_number: documentNumber.trim() || null,
      issuing_country: issuingCountry.trim() || null,
      issue_date: issueDate || null,
      expiry_date: expiryDate || null,
      notes: notes.trim() || null,
    };
  }

  function isDirty(): boolean {
    return fieldsSnapshot() !== initialSnapshotRef.current || photoChanged;
  }

  // Returns the document id the photo ended up attached to, or null if the
  // user cancelled/it failed — callers that chain into scanWithAI need the
  // real id up front rather than reading the `docId` state right back,
  // since setDocId(id) above it hasn't necessarily committed yet.
  async function pickPhoto(source: "gallery" | "camera" = "gallery"): Promise<string | null> {
    try {
      const perm = source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", source === "camera" ? "Allow camera access to take a photo." : "Allow photo library access to pick a photo.");
        return null;
      }
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
      if (result.canceled || result.assets.length === 0) return null;

      let id = docId;
      if (!id) {
        const created = await createDocument(companionId, currentFields());
        id = created.id;
        setDocId(id);
        setImplicitlyCreated(true);
      }
      const path = await setDocumentPhoto({ id, photo_path: photoStoragePath }, result.assets[0]);
      setPhotoStoragePath(path);
      setPhotoUrl(result.assets[0].uri);
      setPhotoChanged(true);
      setScanResult(null); // a replaced photo invalidates whatever the old one scanned to
      onSaved();
      return id;
    } catch (e: any) {
      Alert.alert("Couldn't add photo", e.message ?? "Unknown error");
      return null;
    }
  }

  async function scanWithAI(idOverride?: string) {
    const id = idOverride ?? docId;
    if (!id) return;
    setScanning(true);
    setScanResult(null);
    try {
      const extracted = await scanDocument({ documentId: id });
      setScanResult(extracted);
      setScanSelected({
        document_type: extracted.document_type_confidence === "high" || extracted.document_type_confidence === "medium",
        document_number: extracted.document_number_confidence === "high" || extracted.document_number_confidence === "medium",
        issuing_country: extracted.issuing_country_confidence === "high" || extracted.issuing_country_confidence === "medium",
        issue_date: extracted.issue_date_confidence === "high" || extracted.issue_date_confidence === "medium",
        expiry_date: extracted.expiry_date_confidence === "high" || extracted.expiry_date_confidence === "medium",
      });
    } catch (e: any) {
      Alert.alert("Couldn't scan this document", e.message ?? "Unknown error");
    }
    setScanning(false);
  }

  // Drives the "Scan from gallery/camera" entry point: goes straight into
  // the photo source and, once a photo lands, straight into the scan — no
  // extra taps on "Add photo" / "Scan with AI" needed. Runs once per modal
  // open (guarded by the ref, since `visible` alone doesn't change again
  // while the sheet stays open).
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (!visible) { autoRanRef.current = false; return; }
    if (!initialAction || document || autoRanRef.current) return;
    autoRanRef.current = true;
    (async () => {
      const id = await pickPhoto(initialAction);
      if (id) await scanWithAI(id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialAction, document]);

  function applyScan() {
    if (!scanResult) return;
    if (scanSelected.document_type) setType(scanResult.document_type);
    if (scanSelected.document_number) setDocumentNumber(scanResult.document_number ?? "");
    if (scanSelected.issuing_country) setIssuingCountry(scanResult.issuing_country ?? "");
    if (scanSelected.issue_date) setIssueDate(scanResult.issue_date ?? "");
    if (scanSelected.expiry_date) setExpiryDate(scanResult.expiry_date ?? "");
    setScanResult(null);
  }

  async function save() {
    setSaving(true);
    try {
      if (docId) await saveDocument(docId, currentFields());
      else await createDocument(companionId, currentFields());
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert("Couldn't save", e.message ?? "Unknown error");
    }
    setSaving(false);
  }

  // Cancel (button or hardware back) — if this session implicitly created
  // the document (picking a photo before ever pressing Save) or edited
  // fields/replaced the photo, confirm before discarding rather than
  // silently leaving that half-finished document behind.
  function handleCancel() {
    if (!isDirty()) { onClose(); return; }
    Alert.alert(
      "Discard changes?",
      implicitlyCreated
        ? "This document and its photo haven't been saved yet."
        : "Your changes to this document haven't been saved.",
      [
        { text: "Keep editing", style: "cancel" },
        {
          text: "Discard", style: "destructive",
          onPress: async () => {
            if (implicitlyCreated && docId) {
              await deleteDocument({ id: docId, photo_path: photoStoragePath });
            }
            onSaved();
            onClose();
          },
        },
      ]
    );
  }

  function confirmDelete() {
    if (!document) return;
    Alert.alert("Delete document", "Remove this document permanently?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          await deleteDocument(document);
          onSaved();
          onClose();
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleCancel}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{document ? "Edit document" : "Add document"}</Text>
          <Pressable onPress={handleCancel} hitSlop={10}><Text style={styles.cancel}>Cancel</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text style={styles.label}>Type</Text>
          <View style={styles.chipRow}>
            {DOCUMENT_TYPE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[styles.chip, type === opt.value && styles.chipActive]}
                onPress={() => setType(opt.value)}
              >
                <Text style={[styles.chipText, type === opt.value && styles.chipTextActive]}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Document number</Text>
          <TextInput style={styles.input} value={documentNumber} onChangeText={setDocumentNumber} placeholder="e.g. 12345678" autoCapitalize="characters" />

          <Text style={styles.label}>Issuing country</Text>
          <TextInput style={styles.input} value={issuingCountry} onChangeText={setIssuingCountry} placeholder="e.g. Israel" />

          <View style={styles.dateRow}>
            <DateField label="Issue date" value={issueDate} onChange={setIssueDate} />
            <View style={{ width: 12 }} />
            <DateField label="Expiry date" value={expiryDate} onChange={setExpiryDate} />
          </View>

          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional notes…"
            multiline
          />

          <Text style={styles.label}>Photo</Text>
          {photoUrl ? (
            <Pressable onPress={() => setLightboxOpen(true)}>
              <Image source={{ uri: photoUrl }} style={styles.photo} />
            </Pressable>
          ) : null}
          <Pressable style={styles.photoBtn} onPress={() => pickPhoto()}>
            <Icon name="camera" size={18} color={colors.blue} />
            <Text style={styles.photoBtnText}>{photoUrl ? "Replace photo" : "Add photo"}</Text>
          </Pressable>

          {photoUrl && !scanResult && (
            <Pressable style={[styles.scanBtn, scanning && { opacity: 0.6 }]} onPress={() => scanWithAI()} disabled={scanning}>
              {scanning ? <ActivityIndicator color={colors.blue} /> : <Icon name="research" size={18} color={colors.blue} />}
              <Text style={styles.scanBtnText}>{scanning ? "Reading photo…" : "Scan with AI"}</Text>
            </Pressable>
          )}

          {scanResult && (
            <View style={styles.scanCard}>
              <Text style={styles.scanCardTitle}>Scanned from the photo — review before applying</Text>
              {(["document_type", "document_number", "issuing_country", "issue_date", "expiry_date"] as ScanFieldKey[]).map((key) => {
                const confidence = scanResult[`${key}_confidence` as const] as Confidence;
                const value = scanResult[key];
                return (
                  <Pressable
                    key={key}
                    style={styles.scanFieldRow}
                    onPress={() => setScanSelected((prev) => ({ ...prev, [key]: !prev[key] }))}
                  >
                    <Checkbox checked={scanSelected[key]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.scanFieldLabel}>
                        {key === "document_type" ? "Type" : key === "document_number" ? "Number" : key === "issuing_country" ? "Issuing country" : key === "issue_date" ? "Issue date" : "Expiry date"}
                      </Text>
                      <Text style={styles.scanFieldValue}>{scanFieldDisplay(key, value)}</Text>
                    </View>
                    <Text style={[styles.scanConfidence, { color: CONFIDENCE_COLOR[confidence] }]}>{confidence}</Text>
                  </Pressable>
                );
              })}
              {scanResult.full_name && (
                <Text style={styles.scanFullName}>Name on document: {scanResult.full_name}</Text>
              )}
              {scanResult.unresolved && (
                <Text style={styles.scanUnresolved}>{scanResult.unresolved}</Text>
              )}
              <View style={styles.scanActions}>
                <Pressable style={styles.scanDismissBtn} onPress={() => setScanResult(null)}>
                  <Text style={styles.scanDismissBtnText}>Dismiss</Text>
                </Pressable>
                <Pressable style={styles.scanApplyBtn} onPress={applyScan}>
                  <Text style={styles.scanApplyBtnText}>Apply selected</Text>
                </Pressable>
              </View>
            </View>
          )}

          <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save"}</Text>
          </Pressable>

          {document && (
            <Pressable style={styles.deleteBtn} onPress={confirmDelete}>
              <Text style={styles.deleteBtnText}>Delete document</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>

      {photoUrl && (
        <PhotoLightbox urls={[photoUrl]} visible={lightboxOpen} onClose={() => setLightboxOpen(false)} />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 16, paddingTop: 54, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.paperRaised,
  },
  headerTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  cancel: { color: colors.blue, fontFamily: fonts.bodySemi, fontSize: 15 },
  label: {
    color: colors.inkSoft, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5,
    marginTop: 14, marginBottom: 6,
  },
  input: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12,
  },
  chipActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { color: colors.ink, fontSize: 12.5, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  dateRow: { flexDirection: "row", marginTop: 4 },
  photo: { width: "100%", height: 180, borderRadius: radius.md, marginBottom: 10, backgroundColor: colors.paperRaised },
  photoBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12,
  },
  photoBtnText: { color: colors.blue, fontWeight: "600", fontSize: 14 },
  scanBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.blueSoft, borderWidth: 1, borderColor: colors.blue,
    borderRadius: radius.md, padding: 12, marginTop: 8,
  },
  scanBtnText: { color: colors.blue, fontWeight: "700", fontSize: 14 },
  scanCard: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 14, marginTop: 10,
  },
  scanCardTitle: { color: colors.ink, fontWeight: "700", fontSize: 13.5, marginBottom: 8 },
  scanFieldRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  scanFieldLabel: { color: colors.inkSoft, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  scanFieldValue: { color: colors.ink, fontSize: 14.5, marginTop: 2 },
  scanConfidence: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  scanFullName: { color: colors.inkSoft, fontSize: 12.5, marginTop: 6, fontStyle: "italic" },
  scanUnresolved: { color: colors.coral, fontSize: 12.5, marginTop: 8, lineHeight: 17 },
  scanActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  scanDismissBtn: { flex: 1, alignItems: "center", padding: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  scanDismissBtnText: { color: colors.inkSoft, fontWeight: "600", fontSize: 14 },
  scanApplyBtn: { flex: 1, alignItems: "center", padding: 11, borderRadius: radius.md, backgroundColor: colors.blue },
  scanApplyBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  saveBtn: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 24 },
  saveBtnText: { color: colors.paper, fontWeight: "700", fontSize: 15 },
  deleteBtn: { alignItems: "center", padding: 12, marginTop: 6 },
  deleteBtnText: { color: colors.coral, fontWeight: "600", fontSize: 14 },
});
