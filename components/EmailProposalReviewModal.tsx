import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, TextInput, ScrollView } from "react-native";
import { colors, radius, fonts } from "@/lib/theme";
import Icon from "@/components/icons/Icon";
import { Alert } from "@/lib/alert";
import { FieldConfidence, ProposedField, Trip, Item } from "@/lib/types";
import {
  EmailProposalResolved, EmailProposalDraft, draftFromEmailProposal, applyEmailProposal,
  rejectEmailProposal, deleteEmailProposal, fetchAllTrips,
} from "@/lib/emailProposals";
import { DateField, TimeField } from "@/components/DateTimeFields";
import { categoryForDbType, categoryByKey } from "@/lib/itemTypeMeta";
import ItemTypePickerModal from "@/components/ItemTypePickerModal";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";
import { supabase } from "@/lib/supabase";

const CONFIDENCE: Record<FieldConfidence, { label: string; color: string; background: string }> = {
  high: { label: "Found", color: colors.blue, background: colors.blueSoft },
  medium: { label: "Likely", color: colors.lightBlue, background: colors.lightBlueSoft },
  low: { label: "Guessed", color: colors.gold, background: colors.goldSoft },
  none: { label: "Blank", color: colors.inkSoft, background: colors.line },
};

function Field({
  label, meta, value, onChange, placeholder, multiline,
}: {
  label: string; meta?: ProposedField<any>; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean;
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
      {!!meta?.basis && <Text style={styles.basis}>{meta.basis}</Text>}
    </View>
  );
}

interface Props {
  visible: boolean;
  onClose: () => void;
  proposal: EmailProposalResolved;
  onChanged: () => void;
}

export default function EmailProposalReviewModal({ visible, onClose, proposal, onChanged }: Props) {
  const [draft, setDraft] = useState<EmailProposalDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripPickerOpen, setTripPickerOpen] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [suggestedItem, setSuggestedItem] = useState<Pick<Item, "id" | "title"> | null>(null);
  const [applyMode, setApplyMode] = useState<"create" | "update">("create");

  useEffect(() => {
    if (!visible) return;
    setDraft(draftFromEmailProposal(proposal.proposal));
    setSelectedTripId(proposal.trip_id);
    setApplyMode(proposal.suggested_item_id ? "update" : "create");
    fetchAllTrips().then(setTrips);
    if (proposal.suggested_item_id) {
      supabase.from("items").select("id, title").eq("id", proposal.suggested_item_id).maybeSingle()
        .then(({ data }) => setSuggestedItem(data));
    } else {
      setSuggestedItem(null);
    }
  }, [visible, proposal]);

  if (!draft) return null;
  const p = proposal.proposal;
  const set = (k: keyof EmailProposalDraft) => (v: string) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  if (proposal.status === "failed") {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={styles.root}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Couldn't process this email</Text>
            <Pressable onPress={onClose} hitSlop={10}><Text style={styles.cancel}>Close</Text></Pressable>
          </View>
          <View style={{ padding: 16 }}>
            <Text style={styles.errorText}>{proposal.error ?? "Unknown error."}</Text>
            {!!proposal.raw_subject && <Text style={styles.rawMeta}>Subject: {proposal.raw_subject}</Text>}
            <Pressable style={styles.deleteBtn} onPress={() => deleteEmailProposal(proposal.id).then(() => { onChanged(); onClose(); })}>
              <Icon name="trash" size={16} color={colors.coral} />
              <Text style={styles.deleteBtnText}>Remove</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  async function onApply() {
    if (!draft) return;
    if (applyMode === "update") {
      if (!suggestedItem) { Alert.alert("No item selected", "Pick an existing item to update, or switch to Create new."); return; }
      setSaving(true);
      const { error } = await applyEmailProposal(proposal, draft, { kind: "update", itemId: suggestedItem.id });
      setSaving(false);
      if (error) { Alert.alert("Couldn't apply", error); return; }
    } else {
      if (!selectedTripId) { Alert.alert("Pick a trip", "Choose which trip this item belongs to."); return; }
      setSaving(true);
      const { error } = await applyEmailProposal(proposal, draft, { kind: "create", tripId: selectedTripId });
      setSaving(false);
      if (error) { Alert.alert("Couldn't apply", error); return; }
    }
    onChanged();
    onClose();
  }

  function onReject() {
    Alert.alert("Discard this proposal?", "The email's suggestion will be dismissed — nothing else changes.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Discard", style: "destructive",
        onPress: async () => { await rejectEmailProposal(proposal.id); onChanged(); onClose(); },
      },
    ]);
  }

  const selectedTrip = trips.find((t) => t.id === selectedTripId) ?? null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>Review booking</Text>
          <Pressable onPress={onClose} hitSlop={10}><Text style={styles.cancel}>Close</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {!!proposal.raw_subject && (
            <Text style={styles.rawMeta} numberOfLines={2}>
              From: {proposal.raw_from || "unknown"} · "{proposal.raw_subject}"
            </Text>
          )}

          {p?.is_update_or_cancellation && (
            <View style={styles.updateBanner}>
              <Text style={styles.updateBannerLabel}>This looks like a change to an existing booking</Text>
              {!!p.change_summary && <Text style={styles.updateBannerText}>{p.change_summary}</Text>}
            </View>
          )}

          <Text style={styles.subheading}>Where it goes</Text>
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeChip, applyMode === "update" && styles.modeChipActive]}
              onPress={() => setApplyMode("update")}
              disabled={!suggestedItem}
            >
              <Text style={[styles.modeChipText, applyMode === "update" && styles.modeChipTextActive]}>
                {suggestedItem ? `Update "${suggestedItem.title}"` : "No existing match found"}
              </Text>
            </Pressable>
            <Pressable style={[styles.modeChip, applyMode === "create" && styles.modeChipActive]} onPress={() => setApplyMode("create")}>
              <Text style={[styles.modeChipText, applyMode === "create" && styles.modeChipTextActive]}>Create new item</Text>
            </Pressable>
          </View>
          {!!proposal.match_reasoning && applyMode === "update" && (
            <Text style={styles.basis}>{proposal.match_reasoning}</Text>
          )}

          {applyMode === "create" && (
            <>
              <Text style={styles.fieldLabel}>Trip</Text>
              <Pressable style={styles.tripRow} onPress={() => setTripPickerOpen(true)}>
                <Text style={styles.tripRowText}>{selectedTrip ? selectedTrip.name : "Pick a trip…"}</Text>
                <Icon name="edit" size={14} color={colors.blue} />
              </Pressable>
              {tripPickerOpen && (
                <View style={styles.tripList}>
                  {trips.map((t) => (
                    <Pressable key={t.id} style={styles.tripListRow} onPress={() => { setSelectedTripId(t.id); setTripPickerOpen(false); }}>
                      <Text style={styles.tripListRowText} numberOfLines={1}>{t.name}</Text>
                      <Text style={styles.tripListRowDate}>{formatDateDDMMYYYY(t.start_date)}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}

          <Text style={styles.subheading}>Details</Text>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Type</Text>
            <Pressable style={styles.tripRow} onPress={() => setTypePickerOpen(true)}>
              <Text style={styles.tripRowText}>{categoryForDbType(draft.type).label}</Text>
              <Icon name="edit" size={14} color={colors.blue} />
            </Pressable>
          </View>

          <Field label="Title" meta={p?.title} value={draft.title} onChange={set("title")} placeholder="Title" />

          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}><DateField label="Date" value={draft.start_date} onChange={set("start_date")} /></View>
            <View style={{ width: 10 }} />
            <View style={{ flex: 1 }}><TimeField label="Time" value={draft.time_start} onChange={set("time_start")} /></View>
          </View>
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}><DateField label="End date (optional)" value={draft.end_date} onChange={set("end_date")} /></View>
            <View style={{ width: 10 }} />
            <View style={{ flex: 1 }}><TimeField label="End time (optional)" value={draft.time_end} onChange={set("time_end")} /></View>
          </View>

          <Field label="Address" meta={p?.address} value={draft.address} onChange={set("address")} placeholder="Not found" />
          <Field label="Phone" meta={p?.phone} value={draft.phone} onChange={set("phone")} placeholder="Not found" />
          <Field label="Vendor" meta={p?.vendor} value={draft.vendor} onChange={set("vendor")} placeholder="Not found" />
          <Field label="Booking source" meta={p?.booking_source} value={draft.booking_source} onChange={set("booking_source")} placeholder="Not found" />
          <Field label="Confirmation code" meta={p?.confirmation_code} value={draft.confirmation_code} onChange={set("confirmation_code")} placeholder="Not found" />
          <Field label="Link" meta={p?.link} value={draft.link} onChange={set("link")} placeholder="Not found" />
          <Field label="Notes" meta={p?.notes} value={draft.notes} onChange={set("notes")} placeholder="—" multiline />

          {proposal.cost_usd != null && (
            <Text style={styles.costLine}>Extraction cost ${proposal.cost_usd.toFixed(3)}</Text>
          )}

          <Pressable style={[styles.applyBtn, saving && { opacity: 0.6 }]} onPress={onApply} disabled={saving}>
            <Text style={styles.applyBtnText}>{saving ? "Applying…" : applyMode === "update" ? "Apply update" : "Create item"}</Text>
          </Pressable>
          <Pressable style={styles.discardBtn} onPress={onReject} disabled={saving}>
            <Text style={styles.discardBtnText}>Discard</Text>
          </Pressable>
        </ScrollView>
      </View>

      <ItemTypePickerModal
        visible={typePickerOpen}
        onClose={() => setTypePickerOpen(false)}
        onSelect={(key) => { const picked = categoryByKey(key); setDraft((d) => (d ? { ...d, type: picked.dbTypes[0] } : d)); setTypePickerOpen(false); }}
        title="Item type"
      />
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
  rawMeta: { color: colors.inkSoft, fontSize: 12, marginBottom: 12, fontStyle: "italic" },
  updateBanner: { backgroundColor: colors.goldSoft, borderRadius: radius.md, padding: 12, marginBottom: 16 },
  updateBannerLabel: { color: colors.ink, fontSize: 12.5, fontWeight: "700", marginBottom: 3 },
  updateBannerText: { color: colors.ink, fontSize: 13, lineHeight: 18 },
  subheading: {
    fontFamily: fonts.bodySemi, fontSize: 13, color: colors.inkSoft,
    textTransform: "uppercase", letterSpacing: 0.5,
    marginTop: 4, marginBottom: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line,
  },
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
  modeChip: {
    flex: 1, alignItems: "center", paddingVertical: 10, paddingHorizontal: 8, borderRadius: radius.md,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
  },
  modeChipActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  modeChipText: { color: colors.inkSoft, fontFamily: fonts.bodySemi, fontSize: 12.5, textAlign: "center" },
  modeChipTextActive: { color: "#fff" },
  tripRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, marginBottom: 10,
  },
  tripRowText: { color: colors.ink, fontSize: 15 },
  tripList: { marginBottom: 10, maxHeight: 220 },
  tripListRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 10, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  tripListRowText: { color: colors.ink, fontSize: 14, flex: 1 },
  tripListRowDate: { color: colors.inkSoft, fontSize: 12, fontFamily: fonts.mono },
  field: { marginBottom: 16 },
  fieldHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  fieldLabel: { color: colors.inkSoft, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  conf: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 },
  confText: { fontSize: 11, fontWeight: "700" },
  input: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
  },
  inputMulti: { minHeight: 60, textAlignVertical: "top" },
  basis: { color: colors.inkSoft, fontSize: 12, marginTop: 4, marginBottom: 10, fontStyle: "italic" },
  dateRow: { flexDirection: "row", marginBottom: 4 },
  costLine: { color: colors.inkSoft, fontSize: 11.5, textAlign: "center", marginTop: 4, marginBottom: 8 },
  applyBtn: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 12 },
  applyBtnText: { color: colors.paper, fontWeight: "700", fontSize: 15 },
  discardBtn: { alignItems: "center", padding: 12, marginTop: 4 },
  discardBtnText: { color: colors.coral, fontWeight: "600", fontSize: 14 },
  errorText: { color: colors.coral, fontSize: 14, lineHeight: 20 },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, marginTop: 16 },
  deleteBtnText: { color: colors.coral, fontWeight: "600", fontSize: 14.5 },
});
