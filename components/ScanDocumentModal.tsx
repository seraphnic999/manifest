import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, TextInput, ScrollView, Image, ActivityIndicator } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors, radius, fonts } from "@/lib/theme";
import Icon from "@/components/icons/Icon";
import { Alert } from "@/lib/alert";
import { Companion, DocumentType, Relationship } from "@/lib/types";
import {
  DOCUMENT_TYPE_OPTIONS, DocumentFields, DocumentScanResult,
  uploadPendingDocumentPhoto, deletePendingDocumentPhoto, scanDocument, createDocumentWithPhoto,
} from "@/lib/travelDocuments";
import {
  fetchCompanions, createCompanion, companionFullName, relationshipLabel,
  matchCompanionByName, guessNameSplit, RELATIONSHIP_OPTIONS,
} from "@/lib/companions";
import { DateField } from "@/components/DateTimeFields";

type Confidence = "high" | "medium" | "low" | "none";
const CONFIDENCE_COLOR: Record<Confidence, string> = {
  high: "#3E8E5A", medium: colors.gold, low: colors.coral, none: colors.inkSoft,
};

interface Props {
  visible: boolean;
  source: "camera" | "gallery";
  onClose: () => void;
  /** Fired once the document has actually been created — the caller
   * navigates to the companion it landed on. */
  onDone: (companionId: string) => void;
}

/** Doc Tracker's "scan a document from the main page" flow: pick a photo,
 * read it with parse-document before any companion is chosen, then use the
 * name it found to suggest (or let the user confirm/override) which
 * companion it belongs to — creating a new one if it's nobody on file yet.
 * The photo is uploaded once, to a pending path, and pointed at directly by
 * the real document row at the end rather than re-uploaded. */
export default function ScanDocumentModal({ visible, source, onClose, onDone }: Props) {
  const [stage, setStage] = useState<"scanning" | "review" | "saving">("scanning");
  const [pendingPhotoPath, setPendingPhotoPath] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<DocumentScanResult | null>(null);

  // Document fields — pre-filled from the scan, directly editable (unlike
  // the per-field checkbox "apply" step on an existing document, there's
  // nothing to merge against yet, so the scan result just becomes the draft).
  const [type, setType] = useState<DocumentType>("passport");
  const [documentNumber, setDocumentNumber] = useState("");
  const [issuingCountry, setIssuingCountry] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");

  // Companion match — mode "existing" (a real companionId) or "new" (fresh
  // first/last/relationship, pre-guessed from the scanned name).
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [selectedCompanionId, setSelectedCompanionId] = useState<string | null>(null);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newRelationship, setNewRelationship] = useState<Relationship>("other");

  const ranRef = useRef(false);

  useEffect(() => {
    if (!visible) { ranRef.current = false; return; }
    if (ranRef.current) return;
    ranRef.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function run() {
    setStage("scanning");
    setScanError(null);
    try {
      const perm = source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", source === "camera" ? "Allow camera access to take a photo." : "Allow photo library access to pick a photo.");
        onClose();
        return;
      }
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
      if (result.canceled || result.assets.length === 0) { onClose(); return; }
      const asset = result.assets[0];
      setPhotoUri(asset.uri);

      const [path, allCompanions] = await Promise.all([
        uploadPendingDocumentPhoto(asset),
        fetchCompanions(),
      ]);
      setPendingPhotoPath(path);
      setCompanions(allCompanions);

      const extracted = await scanDocument({ photoPath: path });
      setScanResult(extracted);
      setType(extracted.document_type);
      setDocumentNumber(extracted.document_number ?? "");
      setIssuingCountry(extracted.issuing_country ?? "");
      setIssueDate(extracted.issue_date ?? "");
      setExpiryDate(extracted.expiry_date ?? "");

      const match = matchCompanionByName(extracted.full_name, allCompanions);
      if (match) {
        setMode("existing");
        setSelectedCompanionId(match.id);
      } else {
        setMode("new");
        const { firstName, lastName } = guessNameSplit(extracted.full_name);
        setNewFirstName(firstName);
        setNewLastName(lastName);
      }
      setStage("review");
    } catch (e: any) {
      setScanError(e.message ?? "Couldn't scan this document.");
      setStage("review");
    }
  }

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

  async function handleClose() {
    if (pendingPhotoPath && stage !== "saving") {
      await deletePendingDocumentPhoto(pendingPhotoPath).catch(() => {});
    }
    onClose();
  }

  async function confirm() {
    if (mode === "new" && !newFirstName.trim()) {
      Alert.alert("Missing info", "Enter at least a first name for the new companion.");
      return;
    }
    if (mode === "existing" && !selectedCompanionId) {
      Alert.alert("Pick a companion", "Choose who this document belongs to, or add a new companion.");
      return;
    }
    if (!pendingPhotoPath) return;

    setStage("saving");
    try {
      const companionId = mode === "existing"
        ? selectedCompanionId!
        : (await createCompanion({ first_name: newFirstName.trim(), last_name: newLastName.trim(), relationship: newRelationship })).id;

      await createDocumentWithPhoto(companionId, currentFields(), pendingPhotoPath);
      onDone(companionId);
    } catch (e: any) {
      setStage("review");
      Alert.alert("Couldn't save", e.message ?? "Unknown error");
    }
  }

  const scanFields: { key: keyof DocumentScanResult & string; confKey: keyof DocumentScanResult & string; label: string }[] = [
    { key: "document_type", confKey: "document_type_confidence", label: "Type" },
    { key: "document_number", confKey: "document_number_confidence", label: "Number" },
    { key: "issuing_country", confKey: "issuing_country_confidence", label: "Issuing country" },
    { key: "issue_date", confKey: "issue_date_confidence", label: "Issue date" },
    { key: "expiry_date", confKey: "expiry_date_confidence", label: "Expiry date" },
  ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Scan document</Text>
          <Pressable onPress={handleClose} hitSlop={10}><Text style={styles.cancel}>Cancel</Text></Pressable>
        </View>

        {stage === "scanning" && (
          <View style={styles.centerFill}>
            <ActivityIndicator color={colors.blue} size="large" />
            <Text style={styles.scanningText}>Reading the document…</Text>
          </View>
        )}

        {stage !== "scanning" && (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {photoUri && <Image source={{ uri: photoUri }} style={styles.photo} />}

            {scanError ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{scanError}</Text>
                <Pressable style={styles.retryBtn} onPress={run}>
                  <Text style={styles.retryBtnText}>Try again</Text>
                </Pressable>
              </View>
            ) : (
              <>
                {scanResult?.unresolved && <Text style={styles.unresolved}>{scanResult.unresolved}</Text>}

                <Text style={styles.sectionLabel}>Document</Text>
                <Text style={styles.label}>Type</Text>
                <View style={styles.chipRow}>
                  {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                    <Pressable key={opt.value} style={[styles.chip, type === opt.value && styles.chipActive]} onPress={() => setType(opt.value)}>
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
                  style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]}
                  value={notes} onChangeText={setNotes} placeholder="Optional notes…" multiline
                />

                {scanResult && (
                  <View style={styles.confidenceRow}>
                    {scanFields.map((f) => {
                      const conf = scanResult[f.confKey] as Confidence;
                      return (
                        <Text key={f.key} style={[styles.confidenceTag, { color: CONFIDENCE_COLOR[conf] }]}>
                          {f.label}: {conf}
                        </Text>
                      );
                    })}
                  </View>
                )}

                <Text style={styles.sectionLabel}>Whose document is this?</Text>
                {scanResult?.full_name && (
                  <Text style={styles.detectedName}>
                    Name on document: {scanResult.full_name}
                    {mode === "existing" && selectedCompanionId && " — matched below, change it if that's wrong."}
                  </Text>
                )}

                {companions.map((c) => (
                  <Pressable
                    key={c.id}
                    style={[styles.companionRow, mode === "existing" && selectedCompanionId === c.id && styles.companionRowSelected]}
                    onPress={() => { setMode("existing"); setSelectedCompanionId(c.id); }}
                  >
                    <Icon
                      name={mode === "existing" && selectedCompanionId === c.id ? "check" : "user"}
                      size={18}
                      color={mode === "existing" && selectedCompanionId === c.id ? colors.blue : colors.inkSoft}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.companionName}>{companionFullName(c)}</Text>
                      <Text style={styles.companionSub}>{c.is_self ? "Me" : relationshipLabel(c.relationship)}</Text>
                    </View>
                  </Pressable>
                ))}

                <Pressable
                  style={[styles.companionRow, mode === "new" && styles.companionRowSelected]}
                  onPress={() => setMode("new")}
                >
                  <Icon name={mode === "new" ? "check" : "add"} size={18} color={mode === "new" ? colors.blue : colors.inkSoft} />
                  <Text style={styles.companionName}>New companion</Text>
                </Pressable>

                {mode === "new" && (
                  <View style={styles.newCompanionCard}>
                    <Text style={styles.label}>First name</Text>
                    <TextInput style={styles.input} value={newFirstName} onChangeText={setNewFirstName} placeholder="First name" />
                    <Text style={styles.label}>Last name</Text>
                    <TextInput style={styles.input} value={newLastName} onChangeText={setNewLastName} placeholder="Last name" />
                    <Text style={styles.label}>Relationship</Text>
                    <View style={styles.chipRow}>
                      {RELATIONSHIP_OPTIONS.map((opt) => (
                        <Pressable
                          key={opt.value}
                          style={[styles.chip, newRelationship === opt.value && styles.chipActive]}
                          onPress={() => setNewRelationship(opt.value)}
                        >
                          <Text style={[styles.chipText, newRelationship === opt.value && styles.chipTextActive]}>{opt.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}

                <Pressable style={[styles.saveBtn, stage === "saving" && { opacity: 0.6 }]} onPress={confirm} disabled={stage === "saving"}>
                  <Text style={styles.saveBtnText}>{stage === "saving" ? "Saving…" : "Add document"}</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        )}
      </View>
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
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  scanningText: { color: colors.inkSoft, fontSize: 14 },
  photo: { width: "100%", height: 200, borderRadius: radius.md, marginBottom: 14, backgroundColor: colors.paperRaised },
  errorCard: {
    backgroundColor: colors.coralSoft, borderWidth: 1, borderColor: colors.coral,
    borderRadius: radius.lg, padding: 16, alignItems: "center", gap: 12,
  },
  errorText: { color: colors.ink, fontSize: 14, textAlign: "center" },
  retryBtn: { backgroundColor: colors.ink, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 20 },
  retryBtnText: { color: colors.paper, fontWeight: "700" },
  unresolved: { color: colors.coral, fontSize: 12.5, marginBottom: 10, lineHeight: 17, fontStyle: "italic" },
  sectionLabel: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14, marginTop: 18, marginBottom: 6 },
  label: {
    color: colors.inkSoft, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5,
    marginTop: 12, marginBottom: 6,
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
  confidenceRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  confidenceTag: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  detectedName: { color: colors.inkSoft, fontSize: 12.5, marginBottom: 10, fontStyle: "italic" },
  companionRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  companionRowSelected: { borderColor: colors.blue, borderWidth: 2 },
  companionName: { color: colors.ink, fontFamily: fonts.bodySemi, fontSize: 14.5 },
  companionSub: { color: colors.inkSoft, fontSize: 12, marginTop: 1 },
  newCompanionCard: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 14, marginTop: 4,
  },
  saveBtn: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 24 },
  saveBtnText: { color: colors.paper, fontWeight: "700", fontSize: 15 },
});
