import { useState, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Image } from "react-native";
import { Stack, useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import SubpageHeader from "@/components/SubpageHeader";
import Icon from "@/components/icons/Icon";
import Checkbox from "@/components/Checkbox";
import { colors, radius, fonts } from "@/lib/theme";
import { Alert } from "@/lib/alert";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";
import { TravelDocument } from "@/lib/types";
import {
  fetchCompanion, fetchCompanionProfileUrl, fetchCompanionPhotosWithUrls,
  companionFullName, relationshipLabel, deleteCompanion,
} from "@/lib/companions";
import { fetchDocumentsForCompanion, fetchDocumentPhotoUrl, documentTypeLabel, documentTypeIcon } from "@/lib/travelDocuments";
import { buildCompanionExportText, shareCompanionText } from "@/lib/companionExport";
import CompanionEditModal from "@/components/CompanionEditModal";
import TravelDocumentEditModal from "@/components/TravelDocumentEditModal";
import PhotoLightbox from "@/components/PhotoLightbox";

async function fetchDetail(companionId: string) {
  const companion = await fetchCompanion(companionId);
  const documents = await fetchDocumentsForCompanion(companionId);
  const [profileUrl, photos, docPhotoUrls] = await Promise.all([
    fetchCompanionProfileUrl(companion.profile_photo_path),
    fetchCompanionPhotosWithUrls(companionId),
    Promise.all(documents.map((d) => fetchDocumentPhotoUrl(d.photo_path))),
  ]);
  const docPhotoMap: Record<string, string | null> = {};
  documents.forEach((d, i) => { docPhotoMap[d.id] = docPhotoUrls[i]; });
  return { companion, documents, profileUrl, photos, docPhotoMap };
}

function CopyRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  async function copy() {
    await Clipboard.setStringAsync(value!);
  }
  return (
    <View style={styles.fieldRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValue}>{value}</Text>
      </View>
      <Pressable style={styles.copyBtn} onPress={copy} hitSlop={8}>
        <Icon name="duplicate" size={16} color={colors.blue} />
      </Pressable>
    </View>
  );
}

export default function CompanionDetail() {
  const { companionId } = useLocalSearchParams<{ companionId: string }>();
  const router = useRouter();
  const { data, refetch } = useQuery({ queryKey: ["companionDetail", companionId], queryFn: () => fetchDetail(companionId) });

  const [editOpen, setEditOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<TravelDocument | null>(null);
  const [exportMode, setExportMode] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  if (!data) return null;
  const { companion, documents, profileUrl, photos, docPhotoMap } = data;
  const galleryUrls = [profileUrl, ...photos.map((p) => p.url)].filter((u): u is string => !!u);

  function toggleDocSelected(id: string) {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openDocument(doc: TravelDocument) {
    if (exportMode) { toggleDocSelected(doc.id); return; }
    setEditingDoc(doc);
    setDocModalOpen(true);
  }

  function confirmDeleteCompanion() {
    Alert.alert(
      "Delete companion",
      `Remove ${companionFullName(companion)} and all of their documents permanently?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive", onPress: async () => {
            await deleteCompanion(companion.id);
            router.back();
          },
        },
      ]
    );
  }

  async function doExport() {
    // Zero documents selected is a valid export — just the companion's own
    // info (name, birth date, Israeli ID#, etc.), no document blocks.
    const selected = documents.filter((d) => selectedDocIds.has(d.id));
    const text = buildCompanionExportText(companion, selected);
    await shareCompanionText(text);
    setExportMode(false);
    setSelectedDocIds(new Set());
  }

  const headerRight = exportMode ? (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <Pressable onPress={() => { setExportMode(false); setSelectedDocIds(new Set()); }}>
        <Text style={styles.headerActionMuted}>Cancel</Text>
      </Pressable>
      <Pressable onPress={doExport}>
        <Text style={styles.headerAction}>Share ({selectedDocIds.size})</Text>
      </Pressable>
    </View>
  ) : (
    <Pressable onPress={() => { if (documents.length > 0) setExportMode(true); else doExport(); }}>
      <Text style={styles.headerAction}>Export</Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SubpageHeader title={companionFullName(companion)} right={headerRight} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Pressable style={styles.card} onPress={() => setEditOpen(true)}>
          <Pressable
            style={styles.profileRow}
            onPress={() => galleryUrls.length > 0 && setLightbox({ urls: galleryUrls, index: 0 })}
          >
            {profileUrl ? (
              <Image source={{ uri: profileUrl }} style={styles.profileImg} />
            ) : (
              <View style={styles.profilePlaceholder}><Icon name="user" size={30} color={colors.inkSoft} /></View>
            )}
          </Pressable>

          <CopyRow label="First name" value={companion.first_name} />
          <CopyRow label="Last name" value={companion.last_name} />
          {!companion.is_self && <CopyRow label="Relationship" value={relationshipLabel(companion.relationship)} />}
          <CopyRow label="Birth date" value={companion.birth_date ? formatDateDDMMYYYY(companion.birth_date) : null} />
          <CopyRow label="Israeli ID#" value={companion.israeli_id} />
          <CopyRow label="Notes" value={companion.notes} />
          <View style={styles.editHint}>
            <Icon name="edit" size={14} color={colors.blue} />
            <Text style={styles.editHintText}>Tap to edit</Text>
          </View>
        </Pressable>

        {photos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
            {photos.map((p, i) => (
              <Pressable key={p.id} onPress={() => setLightbox({ urls: galleryUrls, index: i + (profileUrl ? 1 : 0) })}>
                <Image source={{ uri: p.url }} style={styles.smallPhoto} />
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>Travel Documents</Text>
          <Pressable onPress={() => { setEditingDoc(null); setDocModalOpen(true); }}>
            <Text style={styles.addDocText}>+ Add document</Text>
          </Pressable>
        </View>

        {documents.length === 0 && <Text style={styles.empty}>No documents added yet.</Text>}

        {documents.map((doc) => {
          const photoUrl = docPhotoMap[doc.id];
          const checked = selectedDocIds.has(doc.id);
          return (
            <Pressable key={doc.id} style={[styles.docCard, exportMode && checked && styles.docCardSelected]} onPress={() => openDocument(doc)}>
              <View style={styles.docHeaderRow}>
                {exportMode && <Checkbox checked={checked} />}
                <Icon name={documentTypeIcon(doc.type)} size={20} color={colors.blue} />
                <Text style={styles.docType}>{documentTypeLabel(doc.type)}</Text>
              </View>
              <CopyRow label="Number" value={doc.document_number} />
              <CopyRow label="Issuing country" value={doc.issuing_country} />
              <CopyRow label="Issued" value={doc.issue_date ? formatDateDDMMYYYY(doc.issue_date) : null} />
              <CopyRow label="Expires" value={doc.expiry_date ? formatDateDDMMYYYY(doc.expiry_date) : null} />
              <CopyRow label="Notes" value={doc.notes} />
              {photoUrl && (
                <Pressable onPress={(e) => { e.stopPropagation(); setLightbox({ urls: [photoUrl], index: 0 }); }}>
                  <Image source={{ uri: photoUrl }} style={styles.docThumb} />
                </Pressable>
              )}
            </Pressable>
          );
        })}

        {!companion.is_self && (
          <Pressable style={styles.deleteBtn} onPress={confirmDeleteCompanion}>
            <Icon name="trash" size={16} color={colors.coral} />
            <Text style={styles.deleteBtnText}>Delete companion</Text>
          </Pressable>
        )}
      </ScrollView>

      <CompanionEditModal visible={editOpen} onClose={() => setEditOpen(false)} companion={companion} onSaved={refetch} />
      <TravelDocumentEditModal
        visible={docModalOpen}
        onClose={() => setDocModalOpen(false)}
        companionId={companion.id}
        document={editingDoc}
        onSaved={refetch}
      />
      {lightbox && (
        <PhotoLightbox urls={lightbox.urls} initialIndex={lightbox.index} visible onClose={() => setLightbox(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  headerAction: { color: colors.blue, fontFamily: fonts.bodySemi, fontSize: 14 },
  headerActionMuted: { color: colors.inkSoft, fontFamily: fonts.bodySemi, fontSize: 14 },
  profileRow: { alignItems: "center", marginBottom: 16 },
  profileImg: { width: 96, height: 96, borderRadius: 48 },
  profilePlaceholder: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center",
  },
  card: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 14,
  },
  editHint: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  editHintText: { color: colors.blue, fontSize: 12, fontWeight: "600" },
  fieldRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  fieldLabel: { color: colors.inkSoft, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  fieldValue: { color: colors.ink, fontSize: 15, marginTop: 2 },
  copyBtn: { padding: 6 },
  smallPhoto: { width: 64, height: 64, borderRadius: radius.md, marginRight: 8 },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 22, marginBottom: 8 },
  sectionLabel: { color: colors.inkSoft, fontFamily: fonts.bodyBold, fontSize: 11.5, textTransform: "uppercase", letterSpacing: 1 },
  addDocText: { color: colors.blue, fontSize: 13, fontWeight: "700" },
  empty: { color: colors.inkSoft, fontStyle: "italic", fontSize: 13, textAlign: "center", marginTop: 12 },
  docCard: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 14, marginBottom: 10,
  },
  docCardSelected: { borderColor: colors.blue, borderWidth: 2 },
  docHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  docType: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14 },
  docThumb: { width: "100%", height: 140, borderRadius: radius.md, marginTop: 8, backgroundColor: colors.paper },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, marginTop: 18 },
  deleteBtnText: { color: colors.coral, fontWeight: "600", fontSize: 14.5 },
});
