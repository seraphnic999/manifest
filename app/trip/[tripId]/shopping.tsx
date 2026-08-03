import { useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Modal, Alert } from "react-native";
import { useLocalSearchParams, Stack, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { TripCurrency, TripParty } from "@/lib/types";
import ItemPickerModal from "@/components/ItemPickerModal";
import AddExpenseModal from "@/components/AddExpenseModal";

interface AllocationInfo {
  id: string;
  amount: number;
  party_id: string | null;
  expenses: { currency_code: string } | null;
}
interface ShoppingRow {
  id: string;
  trip_id: string;
  item_id: string | null;
  name: string;
  quantity: number;
  note: string | null;
  items: { title: string } | null;
  allocations: AllocationInfo[];
}

export default function ShoppingScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [rows, setRows] = useState<ShoppingRow[]>([]);
  const [currencies, setCurrencies] = useState<TripCurrency[]>([]);
  const [parties, setParties] = useState<TripParty[]>([]);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [expenseTarget, setExpenseTarget] = useState<ShoppingRow | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("shopping_list_items")
      .select("*, items(title), allocations(id, amount, party_id, expenses(currency_code))")
      .eq("trip_id", tripId)
      .order("name");
    if (data) setRows(data as unknown as ShoppingRow[]);

    const { data: c } = await supabase.from("trip_currencies").select("*").eq("trip_id", tripId);
    if (c) setCurrencies(c as TripCurrency[]);
    const { data: p } = await supabase.from("trip_parties").select("*").eq("trip_id", tripId);
    if (p) setParties(p as TripParty[]);
  }, [tripId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function partyName(id: string | null) {
    if (!id) return null;
    return parties.find((p) => p.id === id)?.name ?? null;
  }

  const general = rows.filter((r) => !r.item_id);
  const byActivity = new Map<string, ShoppingRow[]>();
  for (const r of rows) {
    if (!r.item_id) continue;
    const key = r.items?.title ?? "Linked item";
    byActivity.set(key, [...(byActivity.get(key) ?? []), r]);
  }

  function renderRow(row: ShoppingRow) {
    const bought = row.allocations.length > 0;
    return (
      <Pressable
        key={row.id}
        style={styles.row}
        onPress={() => !bought && setExpenseTarget(row)}
      >
        <View style={[styles.checkbox, bought && styles.checkboxChecked]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, bought && styles.nameBought]}>
            {row.name}{row.quantity > 1 ? ` \u00d7${row.quantity}` : ""}
          </Text>
          {row.note && <Text style={styles.note}>{row.note}</Text>}
        </View>
        {bought && (
          <View style={{ alignItems: "flex-end" }}>
            {row.allocations.map((a) => (
              <Text key={a.id} style={styles.paid}>
                {a.amount} {a.expenses?.currency_code ?? ""}
                {a.party_id ? ` \u00b7 ${partyName(a.party_id)}` : ""}
              </Text>
            ))}
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Shopping List" }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 90 }}>
        {general.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>General</Text>
            {general.map(renderRow)}
          </>
        )}
        {[...byActivity.entries()].map(([activityTitle, items]) => (
          <View key={activityTitle}>
            <Text style={styles.sectionLabel}>{activityTitle}</Text>
            {items.map(renderRow)}
          </View>
        ))}
        {rows.length === 0 && <Text style={styles.empty}>Nothing on the list yet.</Text>}
        <Text style={styles.hint}>Tap an unbought item to record what you paid for it.</Text>
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => setAddFormOpen(true)}>
        <Text style={styles.fabText}>+ Add item</Text>
      </Pressable>

      <AddShoppingItemModal
        visible={addFormOpen}
        onClose={() => setAddFormOpen(false)}
        onSaved={() => { setAddFormOpen(false); load(); }}
        tripId={tripId}
      />

      {expenseTarget && (
        <AddExpenseModal
          visible={!!expenseTarget}
          onClose={() => setExpenseTarget(null)}
          onSaved={() => { setExpenseTarget(null); load(); }}
          tripId={tripId}
          currencies={currencies}
          parties={parties}
          presetShoppingItemId={expenseTarget.id}
        />
      )}
    </View>
  );
}

function AddShoppingItemModal({
  visible, onClose, onSaved, tripId,
}: { visible: boolean; onClose: () => void; onSaved: () => void; tripId: string }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [linkedItemId, setLinkedItemId] = useState<string | null>(null);
  const [linkedItemTitle, setLinkedItemTitle] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name) { Alert.alert("Missing info", "Enter an item name."); return; }
    setSaving(true);
    const { error } = await supabase.from("shopping_list_items").insert({
      trip_id: tripId, item_id: linkedItemId, name,
      quantity: parseInt(quantity, 10) || 1, note: note || null,
    });
    setSaving(false);
    if (error) { Alert.alert("Couldn't save", error.message); return; }
    setName(""); setQuantity("1"); setNote(""); setLinkedItemId(null); setLinkedItemTitle(null);
    onSaved();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={styles.sheetTitle}>Add shopping item</Text>

            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Olive oil, perfume\u2026" />

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
              <Text style={styles.buttonText}>{saving ? "Saving\u2026" : "Add to list"}</Text>
            </Pressable>
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
  container: { flex: 1, backgroundColor: colors.paper },
  sectionLabel: { color: colors.inkSoft, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginTop: 14, marginBottom: 8 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginBottom: 6,
  },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: colors.teal },
  checkboxChecked: { backgroundColor: colors.teal },
  name: { color: colors.ink, fontWeight: "600", fontSize: 14 },
  nameBought: { color: colors.inkSoft, textDecorationLine: "line-through" },
  note: { color: colors.inkSoft, fontSize: 11, marginTop: 2 },
  paid: { fontFamily: "IBMPlexMono_500Medium", color: colors.teal, fontSize: 11, fontWeight: "600" },
  empty: { textAlign: "center", color: colors.inkSoft, marginTop: 30 },
  hint: { color: colors.inkSoft, fontSize: 11, fontStyle: "italic", textAlign: "center", marginTop: 16 },
  fab: {
    position: "absolute", bottom: 20, alignSelf: "center",
    backgroundColor: colors.ink, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 24,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  fabText: { color: colors.paper, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%" },
  sheetTitle: { fontFamily: "Archivo_700Bold" as any, fontWeight: "800", fontSize: 18, color: colors.ink, marginBottom: 12 },
  label: { color: colors.inkSoft, fontSize: 12, fontWeight: "600", marginTop: 14, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
  },
  removeText: { color: colors.coral, fontSize: 11, fontWeight: "600", marginTop: 6 },
  button: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 24, marginBottom: 20 },
  buttonText: { color: colors.paper, fontWeight: "700" },
});
