import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, TextInput } from "react-native";
import { supabase } from "@/lib/supabase";
import { colors, radius, fonts } from "@/lib/theme";
import Icon from "@/components/icons/Icon";
import { Alert } from "@/lib/alert";
import { Item, Day } from "@/lib/types";
import { fetchTripCities, resolveDayCityPick } from "@/lib/cities";
import { addKeeper, keeperFieldsFromItem } from "@/lib/keepers";

interface Props {
  visible: boolean;
  onClose: () => void;
  item: Item;
}

export default function AddToKeepersModal({ visible, onClose, item }: Props) {
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) { setRating(0); setNotes(""); }
  }, [visible]);

  async function save() {
    setSaving(true);
    try {
      const [{ data: day }, tripCities, { data: trip }] = await Promise.all([
        item.day_id
          ? supabase.from("days").select("city_id, custom_city_name").eq("id", item.day_id).single()
          : Promise.resolve({ data: null as Pick<Day, "city_id" | "custom_city_name"> | null }),
        fetchTripCities(item.trip_id),
        supabase.from("trips").select("name").eq("id", item.trip_id).single(),
      ]);
      const city = resolveDayCityPick(day ?? { city_id: null, custom_city_name: null }, tripCities);
      const fields = keeperFieldsFromItem(item, city, trip?.name ?? null, rating || null, notes.trim() || null);
      await addKeeper(fields);
      onClose();
    } catch (e: any) {
      Alert.alert("Couldn't save to Keepers", e.message ?? "Unknown error");
    }
    setSaving(false);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Add to Keepers</Text>
          <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>

          <Text style={styles.label}>Rating</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n === rating ? 0 : n)} hitSlop={6}>
                <Icon name="star" size={32} color={n <= rating ? colors.gold : colors.line} />
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Why this is worth remembering…"
            placeholderTextColor={colors.inkSoft}
            multiline
          />

          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(11,30,63,0.4)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: colors.paperRaised, borderRadius: radius.xl, padding: 20 },
  title: { fontFamily: fonts.display, fontSize: 19, color: colors.ink },
  itemTitle: { color: colors.inkSoft, fontSize: 14, marginTop: 4, marginBottom: 16 },
  label: {
    color: colors.inkSoft, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5,
    marginBottom: 8,
  },
  starsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  notesInput: {
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
    minHeight: 80, textAlignVertical: "top",
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, alignItems: "center", padding: 14 },
  cancelText: { color: colors.inkSoft, fontWeight: "600", fontSize: 15 },
  saveBtn: { flex: 1, backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center" },
  saveBtnText: { color: colors.paper, fontWeight: "700", fontSize: 15 },
});
