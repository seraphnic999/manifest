import { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Modal } from "react-native";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";

interface PickableItem {
  id: string;
  title: string;
  type: string;
}

export default function ItemPickerModal({
  visible, onClose, onSelect, tripId,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (item: PickableItem) => void;
  tripId: string;
}) {
  const [allItems, setAllItems] = useState<PickableItem[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!visible || !tripId) return;
    supabase.from("items").select("id, title, type").eq("trip_id", tripId).is("deleted_at", null).order("title")
      .then(({ data }) => data && setAllItems(data as PickableItem[]));
  }, [visible, tripId]);

  const filtered = allItems.filter((i) => i.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Link to an item</Text>
          <TextInput
            style={styles.input}
            value={search}
            onChangeText={setSearch}
            placeholder="Search items\u2026"
            autoFocus
          />
          <ScrollView style={{ maxHeight: 320, marginTop: 10 }}>
            {filtered.map((i) => (
              <Pressable
                key={i.id}
                style={styles.row}
                onPress={() => { onSelect(i); setSearch(""); }}
              >
                <Text style={styles.rowType}>{i.type.toUpperCase()}</Text>
                <Text style={styles.rowTitle}>{i.title}</Text>
              </Pressable>
            ))}
            {filtered.length === 0 && <Text style={styles.empty}>No matching items.</Text>}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "80%" },
  title: { fontFamily: "Archivo_700Bold" as any, fontWeight: "800", fontSize: 18, color: colors.ink, marginBottom: 12 },
  input: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  rowType: { fontFamily: "IBMPlexMono_500Medium", fontSize: 9, color: colors.teal, fontWeight: "600", width: 70 },
  rowTitle: { color: colors.ink, fontSize: 14, flex: 1 },
  empty: { color: colors.inkSoft, textAlign: "center", marginTop: 20, fontSize: 13 },
});
