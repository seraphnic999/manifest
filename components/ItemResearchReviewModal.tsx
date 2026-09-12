import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, TextInput, ScrollView, Linking } from "react-native";
import { colors, radius, fonts } from "@/lib/theme";
import Icon from "@/components/icons/Icon";
import { Alert } from "@/lib/alert";
import { FieldConfidence, ItemResearchJob, ProposedField } from "@/lib/types";
import { ResearchDraft, acceptResearchJob, draftFromProposal, rejectResearchJob, deleteResearchJob } from "@/lib/itemResearch";

// Confidence shown as a word, not a fake percentage — "Guessed" tells you
// what to do about a field, "82%" would just imply a precision the agent
// doesn't have.
const CONFIDENCE: Record<FieldConfidence, { label: string; color: string; background: string }> = {
  high: { label: "Found", color: colors.blue, background: colors.blueSoft },
  medium: { label: "Likely", color: colors.lightBlue, background: colors.lightBlueSoft },
  low: { label: "Guessed", color: colors.gold, background: colors.goldSoft },
  none: { label: "Blank", color: colors.inkSoft, background: colors.line },
};

function Field({
  label, meta, value, onChange, placeholder, multiline,
}: {
  label: string;
  meta?: ProposedField<any>;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const c = meta ? CONFIDENCE[meta.confidence] : null;
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {!!c && (
          <View style={[styles.conf, { backgroundColor: c.background }]}>
            <Text style={[styles.confText, { color: c.color }]}>{c.label}</Text>
          </View>
        )}
      </View>
      <TextInput
        style={[styles.input, multiline && styles.inputMulti]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.inkSoft}
        multiline={multiline}
      />
      {/* Where the answer came from, verbatim — the whole point of this
          screen is that you can see this before you accept it. */}
      {!!meta?.basis && <Text style={styles.basis}>{meta.basis}</Text>}
      {!!meta?.source && (
        <Pressable onPress={() => Linking.openURL(meta.source!)}>
          <Text style={styles.source} numberOfLines={1}>{meta.source}</Text>
        </Pressable>
      )}
    </View>
  );
}

interface Props {
  visible: boolean;
  onClose: () => void;
  job: ItemResearchJob;
  onChanged: () => void;
}

export default function ItemResearchReviewModal({ visible, onClose, job, onChanged }: Props) {
  const [draft, setDraft] = useState<ResearchDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setDraft(draftFromProposal(job.proposal));
  }, [visible, job]);

  if (!draft) return null;
  const p = job.proposal;
  const set = (k: keyof ResearchDraft) => (v: string) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  async function onApply() {
    if (!draft) return;
    setSaving(true);
    const { error } = await acceptResearchJob(job, draft);
    setSaving(false);
    if (error) {
      Alert.alert("Couldn't apply", error);
      return;
    }
    onChanged();
    onClose();
  }

  function onDiscard() {
    Alert.alert("Discard this research?", "The item will be left exactly as it is.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Discard", style: "destructive",
        onPress: async () => {
          await rejectResearchJob(job.id);
          onChanged();
          onClose();
        },
      },
    ]);
  }

  function onDelete() {
    Alert.alert("Remove this failed research?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => { await deleteResearchJob(job.id); onChanged(); onClose(); },
      },
    ]);
  }

  if (job.status === "failed") {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={styles.root}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Research failed</Text>
            <Pressable onPress={onClose} hitSlop={10}><Text style={styles.cancel}>Close</Text></Pressable>
          </View>
          <View style={{ padding: 16 }}>
            <Text style={styles.errorText}>{job.error ?? "Unknown error."}</Text>
            <Pressable style={styles.deleteBtn} onPress={onDelete}>
              <Icon name="trash" size={16} color={colors.coral} />
              <Text style={styles.deleteBtnText}>Remove</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>Research: {job.identified_name ?? p?.name?.value ?? ""}</Text>
          <Pressable onPress={onClose} hitSlop={10}><Text style={styles.cancel}>Close</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {!!p?.unresolved && (
            <View style={styles.unresolved}>
              <Text style={styles.unresolvedLabel}>Could not establish</Text>
              <Text style={styles.unresolvedText}>{p.unresolved}</Text>
            </View>
          )}

          <Field label="Address" meta={p?.address} value={draft.address} onChange={set("address")} placeholder="Not found" />
          <Field label="Phone" meta={p?.phone} value={draft.phone} onChange={set("phone")} placeholder="Not found" />
          <Field label="Website" meta={p?.website} value={draft.website} onChange={set("website")} placeholder="Not found" />
          <Field label="Google Maps link" meta={p?.google_maps_link} value={draft.google_maps_link} onChange={set("google_maps_link")} placeholder="Not built" />
          <Field label="Opening hours" meta={p?.opening_hours} value={draft.opening_hours} onChange={set("opening_hours")} placeholder="Not found" multiline />
          <Field label="Reservation lead time" meta={p?.reservation_lead_time} value={draft.reservation_lead_time} onChange={set("reservation_lead_time")} placeholder="Not applicable" />
          <Field label="Price range" meta={p?.price_range} value={draft.price_range} onChange={set("price_range")} placeholder="Not applicable" />

          {job.cost_usd != null && (
            <Text style={styles.costLine}>Research cost ${job.cost_usd.toFixed(3)}</Text>
          )}

          <Pressable style={[styles.applyBtn, saving && { opacity: 0.6 }]} onPress={onApply} disabled={saving}>
            <Text style={styles.applyBtnText}>{saving ? "Applying…" : "Apply to item"}</Text>
          </Pressable>
          <Pressable style={styles.discardBtn} onPress={onDiscard} disabled={saving}>
            <Text style={styles.discardBtnText}>Discard</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10,
    padding: 16, paddingTop: 54, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.paperRaised,
  },
  headerTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.ink, flex: 1 },
  cancel: { color: colors.blue, fontFamily: fonts.bodySemi, fontSize: 15 },
  unresolved: {
    backgroundColor: colors.goldSoft, borderRadius: radius.md, padding: 12, marginBottom: 16,
  },
  unresolvedLabel: { color: colors.ink, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  unresolvedText: { color: colors.ink, fontSize: 13, lineHeight: 18 },
  field: { marginBottom: 16 },
  fieldHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  fieldLabel: { color: colors.inkSoft, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  conf: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 },
  confText: { fontSize: 11, fontWeight: "700" },
  input: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
  },
  inputMulti: { minHeight: 60, textAlignVertical: "top" },
  basis: { color: colors.inkSoft, fontSize: 12, marginTop: 4, fontStyle: "italic" },
  source: { color: colors.lightBlue, fontSize: 11.5, marginTop: 2 },
  costLine: { color: colors.inkSoft, fontSize: 11.5, textAlign: "center", marginTop: 4, marginBottom: 8 },
  applyBtn: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 12 },
  applyBtnText: { color: colors.paper, fontWeight: "700", fontSize: 15 },
  discardBtn: { alignItems: "center", padding: 12, marginTop: 4 },
  discardBtnText: { color: colors.coral, fontWeight: "600", fontSize: 14 },
  errorText: { color: colors.coral, fontSize: 14, lineHeight: 20 },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, marginTop: 16 },
  deleteBtnText: { color: colors.coral, fontWeight: "600", fontSize: 14.5 },
});
