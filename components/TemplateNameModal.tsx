import { useEffect, useState } from "react";
import { Text, TextInput, Pressable, Modal, StyleSheet } from "react-native";
import { colors, radius } from "@/lib/theme";

/** Single-purpose "enter a name and save" popup, shared by both creating a
 * new packing template (empty initialName) and renaming an existing one. */
export default function TemplateNameModal({
  visible, onClose, onSave, initialName, title, saving,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  initialName?: string;
  title: string;
  saving?: boolean;
}) {
  const [name, setName] = useState(initialName ?? "");

  useEffect(() => {
    if (visible) setName(initialName ?? "");
  }, [visible, initialName]);

  function save() {
    if (!name.trim() || saving) return;
    onSave(name.trim());
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Beach trip, Ski trip, Business"
            placeholderTextColor={colors.inkSoft}
            onSubmitEditing={save}
            autoFocus
          />
          <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save"}</Text>
          </Pressable>
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
  saveBtn: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 16 },
  saveBtnText: { color: colors.paper, fontWeight: "700" },
});
