import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useFocusEffect } from "expo-router";
import { Alert } from "@/lib/alert";
import Icon from "@/components/icons/Icon";
import { colors, radius } from "@/lib/theme";
import { fetchQuickNotes, addQuickNote, updateQuickNoteText, deleteQuickNote, QuickNote } from "@/lib/itemQuickNotes";

/**
 * A list of short, standalone notes on an item — each its own box, added
 * and removed in one tap, no edit-mode round trip. Self-contained (loads
 * and persists its own data) so the exact same component works unchanged
 * on both the item details page and the item edit page.
 */
export default function QuickNotesList({ itemId }: { itemId: string }) {
  const [notes, setNotes] = useState<QuickNote[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Re-fetch on every focus, not just on mount — otherwise a note added on
  // the edit screen doesn't show up back on the details screen until that
  // screen unmounts and remounts, since navigating "back" in this app just
  // reveals the already-mounted previous screen rather than recreating it.
  useFocusEffect(
    useCallback(() => {
      fetchQuickNotes(itemId).then((n) => { setNotes(n); setLoaded(true); });
    }, [itemId])
  );

  async function handleAdd() {
    const nextOrder = notes.length > 0 ? Math.max(...notes.map((n) => n.sort_order)) + 1 : 0;
    try {
      const created = await addQuickNote(itemId, nextOrder);
      setNotes((prev) => [...prev, created]);
    } catch (e: any) {
      Alert.alert("Couldn't add note", e.message ?? "Unknown error");
    }
  }

  function handleChangeText(id: string, text: string) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, text } : n)));
  }

  async function handleBlur(id: string) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    try {
      await updateQuickNoteText(id, note.text);
    } catch (e: any) {
      Alert.alert("Couldn't save note", e.message ?? "Unknown error");
    }
  }

  async function handleRemove(id: string) {
    const prev = notes;
    setNotes((n) => n.filter((x) => x.id !== id));
    try {
      await deleteQuickNote(id);
    } catch (e: any) {
      setNotes(prev);
      Alert.alert("Couldn't remove note", e.message ?? "Unknown error");
    }
  }

  if (!loaded) return null;

  return (
    <View>
      <Text style={styles.sectionLabel}>Quick notes</Text>
      {notes.map((n) => (
        <View key={n.id} style={styles.row}>
          <TextInput
            style={styles.input}
            value={n.text}
            onChangeText={(t) => handleChangeText(n.id, t)}
            onBlur={() => handleBlur(n.id)}
            placeholder="Note"
          />
          <Pressable onPress={() => handleRemove(n.id)} hitSlop={8} style={styles.removeBtn}>
            <Icon name="add" size={16} color={colors.coral} style={{ transform: [{ rotate: "45deg" }] }} />
          </Pressable>
        </View>
      ))}
      <Pressable style={styles.addBtn} onPress={handleAdd}>
        <Text style={styles.addBtnText}>+ Add note</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: colors.inkSoft, fontWeight: "700", fontSize: 12,
    textTransform: "uppercase", letterSpacing: 1, marginTop: 20, marginBottom: 4,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  input: {
    flex: 1, backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 10, fontSize: 13, color: colors.ink,
  },
  removeBtn: { padding: 4 },
  addBtn: {
    borderWidth: 1, borderColor: colors.line, borderStyle: "dashed", borderRadius: radius.md,
    padding: 10, alignItems: "center", marginTop: 2,
  },
  addBtnText: { color: colors.teal, fontWeight: "700", fontSize: 13 },
});
