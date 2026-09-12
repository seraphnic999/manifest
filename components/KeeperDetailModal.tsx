import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, TextInput, ScrollView, Linking } from "react-native";
import { useRouter } from "expo-router";
import { colors, radius, fonts } from "@/lib/theme";
import Icon from "@/components/icons/Icon";
import { Alert } from "@/lib/alert";
import { Keeper, Trip } from "@/lib/types";
import { updateKeeper, deleteKeeper, fetchTripsForKeeper, KeeperTripLink } from "@/lib/keepers";
import { categoryForDbType } from "@/lib/itemTypeMeta";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";
import FutureTripPickerModal from "@/components/FutureTripPickerModal";

interface Props {
  visible: boolean;
  onClose: () => void;
  keeper: Keeper;
  onChanged: () => void;
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export default function KeeperDetailModal({ visible, onClose, keeper, onChanged }: Props) {
  const router = useRouter();
  const [rating, setRating] = useState(keeper.rating ?? 0);
  const [notes, setNotes] = useState(keeper.personal_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [trips, setTrips] = useState<KeeperTripLink[]>([]);
  const [tripPickerOpen, setTripPickerOpen] = useState(false);

  const loadTrips = useCallback(() => {
    fetchTripsForKeeper(keeper.id).then(setTrips).catch((e) => console.error("fetchTripsForKeeper failed", e));
  }, [keeper.id]);

  useEffect(() => {
    if (visible) {
      setRating(keeper.rating ?? 0);
      setNotes(keeper.personal_notes ?? "");
      loadTrips();
    }
  }, [visible, keeper, loadTrips]);

  async function save() {
    setSaving(true);
    try {
      await updateKeeper(keeper.id, { rating: rating || null, personal_notes: notes.trim() || null });
      onChanged();
      onClose();
    } catch (e: any) {
      Alert.alert("Couldn't save", e.message ?? "Unknown error");
    }
    setSaving(false);
  }

  function confirmDelete() {
    Alert.alert("Remove from Keepers", `Remove "${keeper.title}" from your Keepers?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          await deleteKeeper(keeper.id);
          onChanged();
          onClose();
        },
      },
    ]);
  }

  function openTripItem(link: KeeperTripLink) {
    onClose();
    router.push(`/item/${link.itemId}`);
  }

  function addToTrip(trip: Trip) {
    setTripPickerOpen(false);
    onClose();
    const category = categoryForDbType(keeper.item_type).key;
    router.push(`/item/new?tripId=${trip.id}&dayId=&date=&category=${category}&fromKeeperId=${keeper.id}`);
  }

  const categoryIcon = categoryForDbType(keeper.item_type).icon;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>{keeper.title}</Text>
          <Pressable onPress={onClose} hitSlop={10}><Text style={styles.cancel}>Close</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={styles.titleRow}>
            <Icon name={categoryIcon} size={24} color={colors.blue} />
            <Text style={styles.itemTitle}>{keeper.title}</Text>
          </View>
          <Text style={styles.citySub}>{keeper.city_label}{keeper.source_trip_name ? ` · First seen in ${keeper.source_trip_name}` : ""}</Text>

          <View style={styles.card}>
            <Field label="Address" value={keeper.address} />
            <Field label="Phone" value={keeper.phone} />
            <Field label="Vendor" value={keeper.vendor} />
          </View>

          {keeper.link && (
            <Pressable style={styles.linkBtn} onPress={() => Linking.openURL(keeper.link!)}>
              <Text style={styles.linkBtnText}>Open link</Text>
            </Pressable>
          )}
          {keeper.google_maps_link && (
            <Pressable style={styles.linkBtn} onPress={() => Linking.openURL(keeper.google_maps_link!)}>
              <Icon name="locate" size={18} color={colors.blue} />
              <Text style={styles.linkBtnText}>Open in Google Maps</Text>
            </Pressable>
          )}

          <Pressable style={styles.addToTripBtn} onPress={() => setTripPickerOpen(true)}>
            <Icon name="add" size={18} color="#fff" />
            <Text style={styles.addToTripBtnText}>Add to trip</Text>
          </Pressable>

          <Text style={styles.label}>Trips</Text>
          {trips.length === 0 && <Text style={styles.empty}>Not on any trip yet.</Text>}
          {trips.map((t) => (
            <Pressable key={t.itemId} style={styles.tripRow} onPress={() => openTripItem(t)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.tripRowName} numberOfLines={1}>{t.tripName}</Text>
                {t.startDate && <Text style={styles.tripRowDate}>{formatDateDDMMYYYY(t.startDate)}</Text>}
              </View>
              <Icon name="forward" size={18} color={colors.blue} />
            </Pressable>
          ))}

          <Text style={styles.label}>My rating</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n === rating ? 0 : n)} hitSlop={6}>
                <Icon name="star" size={30} color={n <= rating ? colors.gold : colors.line} />
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>My notes</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Why this is worth remembering…"
            placeholderTextColor={colors.inkSoft}
            multiline
          />

          <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save"}</Text>
          </Pressable>

          <Pressable style={styles.deleteBtn} onPress={confirmDelete}>
            <Icon name="trash" size={16} color={colors.coral} />
            <Text style={styles.deleteBtnText}>Remove from Keepers</Text>
          </Pressable>
        </ScrollView>
      </View>

      <FutureTripPickerModal
        visible={tripPickerOpen}
        onClose={() => setTripPickerOpen(false)}
        onSelect={addToTrip}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10,
    padding: 16, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.paperRaised,
  },
  headerTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, flex: 1 },
  cancel: { color: colors.blue, fontFamily: fonts.bodySemi, fontSize: 15 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  itemTitle: { fontFamily: fonts.display, fontSize: 19, color: colors.ink, flex: 1 },
  citySub: { color: colors.inkSoft, fontSize: 13, marginTop: 4, marginBottom: 14 },
  card: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 14, marginBottom: 12,
  },
  fieldRow: { paddingVertical: 6 },
  fieldLabel: { color: colors.inkSoft, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  fieldValue: { color: colors.ink, fontSize: 15, marginTop: 2 },
  linkBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  linkBtnText: { color: colors.blue, fontWeight: "600", fontSize: 14 },
  addToTripBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.ink, borderRadius: radius.md, padding: 12, marginTop: 6, marginBottom: 4,
  },
  addToTripBtnText: { color: colors.paper, fontWeight: "700", fontSize: 14.5 },
  label: {
    color: colors.inkSoft, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5,
    marginTop: 18, marginBottom: 8,
  },
  empty: { color: colors.inkSoft, fontStyle: "italic", fontSize: 13 },
  tripRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  tripRowName: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14.5 },
  tripRowDate: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
  starsRow: { flexDirection: "row", gap: 10 },
  notesInput: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
    minHeight: 80, textAlignVertical: "top",
  },
  saveBtn: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 20 },
  saveBtnText: { color: colors.paper, fontWeight: "700", fontSize: 15 },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, marginTop: 6 },
  deleteBtnText: { color: colors.coral, fontWeight: "600", fontSize: 14.5 },
});
