import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, TextInput, ScrollView, Linking } from "react-native";
import { radius, fonts, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import Icon from "@/components/icons/Icon";
import { Alert } from "@/lib/alert";
import { supabase } from "@/lib/supabase";
import { FieldConfidence, ItemResearchJob, ProposedField, ItemType, Day } from "@/lib/types";
import { ResearchDraft, acceptResearchJob, draftFromProposal, rejectResearchJob, deleteResearchJob } from "@/lib/itemResearch";
import { categoryForDbType, categoryByKey, CONVERTIBLE_CATEGORIES, isConvertibleType } from "@/lib/itemTypeMeta";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";
import ItemTypePickerModal from "@/components/ItemTypePickerModal";
import TripDayPickerModal from "@/components/TripDayPickerModal";
import { TimeField } from "@/components/DateTimeFields";

// Confidence shown as a word, not a fake percentage — "Guessed" tells you
// what to do about a field, "82%" would just imply a precision the agent
// doesn't have.
const CONFIDENCE = (colors: ColorTokens): Record<FieldConfidence, { label: string; color: string; background: string }> => ({
  high: { label: "Found", color: colors.blue, background: colors.blueSoft },
  medium: { label: "Likely", color: colors.lightBlue, background: colors.lightBlueSoft },
  low: { label: "Guessed", color: colors.gold, background: colors.goldSoft },
  none: { label: "Blank", color: colors.inkSoft, background: colors.line },
});

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
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const c = meta ? CONFIDENCE(colors)[meta.confidence] : null;
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

interface ItemMeta { type: ItemType; day_id: string | null; start_date: string | null; time_start: string | null; trip_id: string }

export default function ItemResearchReviewModal({ visible, onClose, job, onChanged }: Props) {
  const [draft, setDraft] = useState<ResearchDraft | null>(null);
  const [saving, setSaving] = useState(false);
  // The proposal below only ever carries place-detail fields (address,
  // hours, ratings, ...) — never touches the item's own type or day (see
  // acceptResearchJob). For an item that came in with neither set yet (a
  // Quick Add from a Google Maps link at the trip level, say — created as
  // a plain "Other" sitting in Proposals with no date) that left "what
  // does Apply actually do" genuinely ambiguous. This card shows — and
  // lets you fix — those two independently of the proposal, so there's
  // never a mystery about where the item itself is headed.
  const [itemMeta, setItemMeta] = useState<ItemMeta | null>(null);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [dayPickerOpen, setDayPickerOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDraft(draftFromProposal(job.proposal));
    supabase.from("items").select("type, day_id, start_date, time_start, trip_id").eq("id", job.item_id).single()
      .then(({ data }) => setItemMeta((data as ItemMeta) ?? null));
  }, [visible, job]);

  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  async function handlePickType(categoryKey: string) {
    setTypePickerOpen(false);
    const newType = categoryByKey(categoryKey).dbTypes[0];
    const { error } = await supabase.from("items").update({ type: newType }).eq("id", job.item_id);
    if (error) { Alert.alert("Couldn't change type", error.message); return; }
    setItemMeta((m) => (m ? { ...m, type: newType } : m));
    onChanged();
  }

  async function handlePickDay(day: Day) {
    setDayPickerOpen(false);
    const { error } = await supabase.from("items").update({ day_id: day.id, start_date: day.date }).eq("id", job.item_id);
    if (error) { Alert.alert("Couldn't change day", error.message); return; }
    setItemMeta((m) => (m ? { ...m, day_id: day.id, start_date: day.date } : m));
    onChanged();
  }

  async function handleSetTime(time: string) {
    const { error } = await supabase.from("items").update({ time_start: time || null }).eq("id", job.item_id);
    if (error) { Alert.alert("Couldn't set time", error.message); return; }
    setItemMeta((m) => (m ? { ...m, time_start: time || null } : m));
    onChanged();
  }

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
          {itemMeta && (
            <View style={styles.destinationCard}>
              <Text style={styles.destinationLabel}>Where this item will land</Text>
              <Pressable
                style={styles.destinationRow}
                onPress={() => isConvertibleType(itemMeta.type) && setTypePickerOpen(true)}
                disabled={!isConvertibleType(itemMeta.type)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.destinationRowLabel}>Type</Text>
                  <Text style={styles.destinationRowValue}>{categoryForDbType(itemMeta.type).label}</Text>
                </View>
                {isConvertibleType(itemMeta.type) && <Text style={styles.destinationChange}>Change</Text>}
              </Pressable>
              <Pressable style={styles.destinationRow} onPress={() => setDayPickerOpen(true)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.destinationRowLabel}>Day</Text>
                  <Text style={styles.destinationRowValue}>
                    {itemMeta.start_date ? formatDateDDMMYYYY(itemMeta.start_date) : "Proposals — not scheduled yet"}
                  </Text>
                </View>
                <Text style={styles.destinationChange}>Change</Text>
              </Pressable>
              <View style={styles.destinationTimeField}>
                <TimeField label="Time (optional)" value={itemMeta.time_start ?? ""} onChange={handleSetTime} />
              </View>
            </View>
          )}

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
          <View style={styles.ratingRow}>
            <View style={styles.ratingField}>
              <Field label="Lead days (min)" meta={p?.reservation_lead_days_min} value={draft.reservation_lead_days_min} onChange={set("reservation_lead_days_min")} placeholder="e.g. 14" />
            </View>
            <View style={styles.ratingField}>
              <Field label="Lead days (max)" meta={p?.reservation_lead_days_max} value={draft.reservation_lead_days_max} onChange={set("reservation_lead_days_max")} placeholder="e.g. 21" />
            </View>
          </View>
          <Field label="Booking link" meta={p?.booking_link} value={draft.booking_link} onChange={set("booking_link")} placeholder="Not found" />
          <Field label="Price range" meta={p?.price_range} value={draft.price_range} onChange={set("price_range")} placeholder="Not applicable" />

          <Text style={styles.subheading}>Ratings & reviews</Text>
          <Field label="Short description" meta={p?.short_description} value={draft.short_description} onChange={set("short_description")} placeholder="Not found" multiline />
          <View style={styles.ratingRow}>
            <View style={styles.ratingField}>
              <Field label="Google rating" meta={p?.google_rating} value={draft.google_rating} onChange={set("google_rating")} placeholder="e.g. 4.4" />
            </View>
            <View style={styles.ratingField}>
              <Field label="Rating count" meta={p?.google_rating_count} value={draft.google_rating_count} onChange={set("google_rating_count")} placeholder="e.g. 2992" />
            </View>
          </View>
          <Field
            label="Review highlights"
            meta={p?.review_highlights}
            value={draft.review_highlights}
            onChange={set("review_highlights")}
            placeholder="Not found — one per line"
            multiline
          />
          <Field
            label="Award badges"
            meta={p?.award_badges}
            value={draft.award_badges}
            onChange={set("award_badges")}
            placeholder="Not applicable — one per line"
            multiline
          />

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

      <ItemTypePickerModal
        visible={typePickerOpen}
        onClose={() => setTypePickerOpen(false)}
        onSelect={handlePickType}
        categories={CONVERTIBLE_CATEGORIES}
        title="Change type"
      />
      {itemMeta && (
        <TripDayPickerModal
          visible={dayPickerOpen}
          onClose={() => setDayPickerOpen(false)}
          tripId={itemMeta.trip_id}
          onSelect={handlePickDay}
          includeProposals
          selectedDayId={itemMeta.day_id}
        />
      )}
    </Modal>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
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
  destinationCard: {
    backgroundColor: colors.blueSoft, borderRadius: radius.md, padding: 12, marginBottom: 16,
  },
  destinationLabel: {
    color: colors.ink, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5,
    marginBottom: 8,
  },
  destinationRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.paperRaised, borderRadius: radius.sm, padding: 10, marginTop: 6,
  },
  destinationRowLabel: { color: colors.inkSoft, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5 },
  destinationRowValue: { color: colors.ink, fontFamily: fonts.bodySemi, fontSize: 14, marginTop: 2 },
  destinationChange: { color: colors.blue, fontFamily: fonts.bodySemi, fontSize: 13 },
  destinationTimeField: { marginTop: 2 },
  subheading: {
    fontFamily: fonts.bodySemi, fontSize: 13, color: colors.inkSoft,
    textTransform: "uppercase", letterSpacing: 0.5,
    marginTop: 4, marginBottom: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line,
  },
  ratingRow: { flexDirection: "row", gap: 12 },
  ratingField: { flex: 1 },
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
