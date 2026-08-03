import { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, Modal } from "react-native";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import ItemPickerModal from "@/components/ItemPickerModal";

export default function AddShoppingItemModal({
  visible, onClose, onSaved, tripId, editId, presetItemId,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  tripId: string;
  editId?: string;         // when set, loads and updates this row instead of creating
  presetItemId?: string;   // when set (create mode only), pre-links to this activity
}) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [linkedItemId, setLinkedItemId] = useState<string | null>(null);
  const [linkedItemTitle, setLinkedItemTitle] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (editId) {
      supabase.from("shopping_list_items").select("*, items(title)").eq("id", editId).single()
        .then(({ data }) => {
          if (!data) return;
          setName(data.name);
          setQuantity(String(data.quantity));
          setNote(data.note ?? "");
          setLinkedItemId(data.item_id);
          setLinkedItemTitle(data.items?.title ?? null);
        });
    } else {
      setName(""); setQuantity("1"); setNote("");
      setLinkedItemId(presetItemId ?? null);
      if (presetItemId) {
        supabase.from("items").select("title").eq("id", presetItemId).single()
          .then(({ data }) => setLinkedItemTitle(data?.title ?? null));
      } else {
        setLinkedItemTitle(null);
      }
    }
  }, [visible, editId, presetItemId]);

  async function save() {
    if (!name) { Alert.alert("Missing info", "Enter an item name."); return; }
    setSaving(true);
    const payload = {
      trip_id: tripId, item_id: linkedItemId, name,
      quantity: parseInt(quantity, 10) || 1, note: note || null,
    };
    const { error } = editId
      ? await supabase.from("shopping_list_items").update(payload).eq("id", editId)
      : await supabase.from("shopping_list_items").insert(payload);
    setSaving(false);
    if (error) { Alert.alert("Couldn't save", error.message); return; }
    onSaved();
  }

  function remove() {
    Alert.alert("Delete item", "Remove this from the shopping list? Any expense already recorded for it stays, just unlinked.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          if (editId) await supabase.from("shopping_list_items").delete().eq("id", editId);
          onSaved();
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={styles.sheetTitle}>{editId ? "Edit shopping item" : "Add shopping item"}</Text>

            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={"Olive oil, perfume\u2026"} />

            <Text style={styles.label}>Quantity</Text>
            <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />

            <Text style={styles.label}>Note</Text>
            <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Optional" />

            <Text style={styles.label}>Linked activity (optional)</Text>
            <Pressable style={styles.input} onPress={() => setPickerOpen(true)}>
              <Text style={{ color: linkedItemTitle ? colors.ink : colors.inkSoft }}>
                {linkedItemTitle || "General \u2014 tap to link to duty free, a mall, etc."}
              </Text>
            </Pressable>
            {linkedItemId && (
              <Pressable onPress={() => { setLinkedItemId(null); setLinkedItemTitle(null); }}>
                <Text style={styles.removeText}>Make it general</Text>
              </Pressable>
            )}

            <Pressable style={styles.button} onPress={save} disabled={saving}>
              <Text style={styles.buttonText}>{saving ? "Saving\u2026" : editId ? "Save changes" : "Add to list"}</Text>
            </Pressable>
            {editId && (
              <Pressable style={styles.deleteButton} onPress={remove}>
                <Text style={styles.deleteButtonText}>Delete item</Text>
              </Pressable>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>

      <ItemPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(i) => { setLinkedItemId(i.id); setLinkedItemTitle(i.title); setPickerOpen(false); }}
        tripId={tripId}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%" },
  sheetTitle: { fontFamily: "Archivo_700Bold" as any, fontWeight: "800", fontSize: 18, color: colors.ink, marginBottom: 12 },
  label: { color: colors.inkSoft, fontSize: 12, fontWeight: "600", marginTop: 14, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
  },
  removeText: { color: colors.coral, fontSize: 11, fontWeight: "600", marginTop: 6 },
  button: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 24 },
  buttonText: { color: colors.paper, fontWeight: "700" },
  deleteButton: { alignItems: "center", marginTop: 14, marginBottom: 10, padding: 10 },
  deleteButtonText: { color: colors.coral, fontWeight: "600", fontSize: 13 },
});
