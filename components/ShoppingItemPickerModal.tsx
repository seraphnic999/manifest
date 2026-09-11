import { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Modal, ActivityIndicator } from "react-native";
import { Alert } from "@/lib/alert";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";

interface PickableShoppingItem {
  id: string;
  name: string;
  quantity: number;
}

export default function ShoppingItemPickerModal({
  visible, onClose, onSelect, tripId,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (item: PickableShoppingItem | null) => void;
  tripId: string;
}) {
  const [allItems, setAllItems] = useState<PickableShoppingItem[]>([]);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!visible || !tripId) return;
    supabase.from("shopping_list_items").select("id, name, quantity").eq("trip_id", tripId).order("name")
      .then(({ data }) => data && setAllItems(data as PickableShoppingItem[]));
  }, [visible, tripId]);

  const filtered = allItems.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
  const trimmedSearch = search.trim();
  const hasExactMatch = allItems.some((i) => i.name.toLowerCase() === trimmedSearch.toLowerCase());

  async function createAndSelect() {
    if (!trimmedSearch || creating) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("shopping_list_items").insert({ trip_id: tripId, name: trimmedSearch, quantity: 1 }).select().single();
    setCreating(false);
    if (error || !data) {
      Alert.alert("Couldn't create item", error?.message ?? "Unknown error");
      return;
    }
    onSelect(data as PickableShoppingItem);
    setSearch("");
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Link to a shopping item</Text>
          <TextInput
            style={styles.input}
            value={search}
            onChangeText={setSearch}
            placeholder={"Search shopping list…"}
            autoFocus
          />
          <ScrollView style={{ maxHeight: 320, marginTop: 10 }}>
            <Pressable style={styles.row} onPress={() => { onSelect(null); setSearch(""); }}>
              <Text style={styles.rowTitle}>None</Text>
            </Pressable>
            {filtered.map((i) => (
              <Pressable
                key={i.id}
                style={styles.row}
                onPress={() => { onSelect(i); setSearch(""); }}
              >
                <Text style={styles.rowTitle}>{i.name}{i.quantity > 1 ? ` ×${i.quantity}` : ""}</Text>
              </Pressable>
            ))}
            {filtered.length === 0 && <Text style={styles.empty}>No matching shopping list items.</Text>}
            {trimmedSearch.length > 0 && !hasExactMatch && (
              <Pressable style={styles.createRow} onPress={createAndSelect} disabled={creating}>
                {creating
                  ? <ActivityIndicator size="small" color={colors.lightBlue} />
                  : <Text style={styles.createRowText}>{`+ Create "${trimmedSearch}"`}</Text>}
              </Pressable>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "80%",
    width: "100%", maxWidth: 480, alignSelf: "center",
  },
  title: { fontFamily: "Poppins_700Bold" as any, fontWeight: "800", fontSize: 18, color: colors.ink, marginBottom: 12 },
  input: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
  },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  rowTitle: { color: colors.ink, fontSize: 14 },
  empty: { color: colors.inkSoft, textAlign: "center", marginTop: 20, fontSize: 13 },
  createRow: { paddingVertical: 12, alignItems: "center" },
  createRowText: { color: colors.lightBlue, fontWeight: "700", fontSize: 13 },
});
