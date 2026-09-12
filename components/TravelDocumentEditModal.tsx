import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, TextInput, ScrollView, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors, radius, fonts } from "@/lib/theme";
import Icon from "@/components/icons/Icon";
import { Alert } from "@/lib/alert";
import { DocumentType, TravelDocument } from "@/lib/types";
import {
  DOCUMENT_TYPE_OPTIONS, createDocument, saveDocument, deleteDocument,
  setDocumentPhoto, fetchDocumentPhotoUrl, DocumentFields,
} from "@/lib/travelDocuments";
import { DateField } from "@/components/DateTimeFields";
import PhotoLightbox from "@/components/PhotoLightbox";

interface Props {
  visible: boolean;
  onClose: () => void;
  companionId: string;
  document: TravelDocument | null; // null = create mode
  onSaved: () => void;
}

export default function TravelDocumentEditModal({ visible, onClose, companionId, document, onSaved }: Props) {
  const [type, setType] = useState<DocumentType>("passport");
  const [documentNumber, setDocumentNumber] = useState("");
  const [issuingCountry, setIssuingCountry] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setType(document?.type ?? "passport");
    setDocumentNumber(document?.document_number ?? "");
    setIssuingCountry(document?.issuing_country ?? "");
    setIssueDate(document?.issue_date ?? "");
    setExpiryDate(document?.expiry_date ?? "");
    setNotes(document?.notes ?? "");
    if (document?.photo_path) fetchDocumentPhotoUrl(document.photo_path).then(setPhotoUrl);
    else setPhotoUrl(null);
  }, [visible, document]);

  async function pickPhoto() {
    if (!document) {
      Alert.alert("Save first", "Save the document once before adding a photo.");
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access to pick a photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (result.canceled || result.assets.length === 0) return;
    await setDocumentPhoto(document, result.assets[0]);
    setPhotoUrl(result.assets[0].uri);
    onSaved();
  }

  async function save() {
    const fields: DocumentFields = {
      type,
      document_number: documentNumber.trim() || null,
      issuing_country: issuingCountry.trim() || null,
      issue_date: issueDate || null,
      expiry_date: expiryDate || null,
      notes: notes.trim() || null,
    };
    setSaving(true);
    try {
      if (document) await saveDocument(document.id, fields);
      else await createDocument(companionId, fields);
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert("Couldn't save", e.message ?? "Unknown error");
    }
    setSaving(false);
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
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{document ? "Edit document" : "Add document"}</Text>
          <Pressable onPress={onClose} hitSlop={10}><Text style={styles.cancel}>Cancel</Text></Pressable>
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
          <Pressable style={styles.photoBtn} onPress={pickPhoto}>
            <Icon name="camera" size={18} color={colors.blue} />
            <Text style={styles.photoBtnText}>{photoUrl ? "Replace photo" : "Add photo"}</Text>
          </Pressable>

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
  saveBtn: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 24 },
  saveBtnText: { color: colors.paper, fontWeight: "700", fontSize: 15 },
  deleteBtn: { alignItems: "center", padding: 12, marginTop: 6 },
  deleteBtnText: { color: colors.coral, fontWeight: "600", fontSize: 14 },
});
