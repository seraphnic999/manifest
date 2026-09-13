import { useEffect, useState } from "react";
import { Text, TextInput, View, Pressable, Modal, StyleSheet } from "react-native";
import { colors, radius } from "@/lib/theme";
import { PACKING_CATEGORIES } from "@/lib/packing";

/** Add/edit popup for a single packing-template item — the same
 * text-box + category-chips + submit-button interface either way; edit
 * mode (an item passed in) additionally shows a "Remove item" action. */
export default function PackingTemplateItemModal({
  visible, onClose, onSave, onDelete, initialName, initialCategory,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string, category: string | null) => void;
  onDelete?: () => void;
  initialName?: string;
  initialCategory?: string | null;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [category, setCategory] = useState<string | null>(initialCategory ?? null);
  const isEdit = !!onDelete;

  useEffect(() => {
    if (visible) {
      setName(initialName ?? "");
      setCategory(initialCategory ?? null);
    }
  }, [visible, initialName, initialCategory]);

  function save() {
    if (!name.trim()) return;
    onSave(name.trim(), category);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{isEdit ? "Edit item" : "Add item"}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Passport, Charger, Swimsuit"
            placeholderTextColor={colors.inkSoft}
            onSubmitEditing={save}
            autoFocus
          />
          <View style={styles.chipRow}>
            {PACKING_CATEGORIES.map((c) => (
              <Pressable
                key={c}
                style={[styles.chip, category === c && styles.chipActive]}
                onPress={() => setCategory(category === c ? null : c)}
              >
                <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.saveBtn} onPress={save}>
            <Text style={styles.saveBtnText}>{isEdit ? "Save" : "+ Add item"}</Text>
          </Pressable>
          {isEdit && (
            <Pressable style={styles.deleteBtn} onPress={onDelete}>
              <Text style={styles.deleteBtnText}>Remove item</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(11,30,63,0.4)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: colors.paperRaised, borderRadius: radius.lg, padding: 20, width: "100%", maxWidth: 420, alignSelf: "center" },
  title: { color: colors.ink, fontWeight: "700", fontSize: 17, marginBottom: 14 },
  input: {
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  chipActive: { backgroundColor: colors.lightBlue, borderColor: colors.lightBlue },
  chipText: { color: colors.inkSoft, fontWeight: "600", fontSize: 12 },
  chipTextActive: { color: "#fff" },
  saveBtn: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 16 },
  saveBtnText: { color: colors.paper, fontWeight: "700" },
  deleteBtn: { alignItems: "center", marginTop: 10, padding: 8 },
  deleteBtnText: { color: colors.coral, fontWeight: "600", fontSize: 13 },
});
