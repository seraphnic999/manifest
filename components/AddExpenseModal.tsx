import { useState, useEffect } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, Modal, Switch,
} from "react-native";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { TripCurrency, TripParty, ShoppingListItem } from "@/lib/types";
import { DateField } from "@/components/DateTimeFields";
import ItemPickerModal from "@/components/ItemPickerModal";

interface SplitRow {
  amount: string;
  partyId: string | null;
  shoppingItemId: string | null;
}

export default function AddExpenseModal({
  visible, onClose, onSaved, tripId, currencies, parties, presetItemId, presetShoppingItemId,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  tripId: string;
  currencies: TripCurrency[];
  parties: TripParty[];
  presetItemId?: string;           // when set, item picker is hidden and this item is always used
  presetShoppingItemId?: string;   // when set, pre-selects this shopping list entry (still changeable)
}) {
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState("NIS");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [splitting, setSplitting] = useState(false);
  const [singleParty, setSingleParty] = useState<string | null>(null);
  const [singleShoppingItem, setSingleShoppingItem] = useState<string | null>(presetShoppingItemId ?? null);
  const [rows, setRows] = useState<SplitRow[]>([{ amount: "", partyId: null, shoppingItemId: null }]);
  const [saving, setSaving] = useState(false);

  const [linkedItemId, setLinkedItemId] = useState<string | null>(presetItemId ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [linkedItemTitle, setLinkedItemTitle] = useState<string | null>(null);
  const [shoppingItems, setShoppingItems] = useState<ShoppingListItem[]>([]);

  useEffect(() => {
    setLinkedItemId(presetItemId ?? null);
    setSingleShoppingItem(presetShoppingItemId ?? null);
  }, [presetItemId, presetShoppingItemId, visible]);

  useEffect(() => {
    if (!visible || !tripId) return;
    supabase.from("shopping_list_items").select("*").eq("trip_id", tripId).order("name")
      .then(({ data }) => data && setShoppingItems(data as ShoppingListItem[]));
  }, [visible, tripId]);

  // If a shopping item is preset and it's tied to an activity, default the
  // item link too (unless one was already explicitly preset).
  useEffect(() => {
    if (!presetShoppingItemId || presetItemId) return;
    const si = shoppingItems.find((s) => s.id === presetShoppingItemId);
    if (si?.item_id) setLinkedItemId(si.item_id);
  }, [presetShoppingItemId, presetItemId, shoppingItems]);

  useEffect(() => {
    if (!linkedItemId) { setLinkedItemTitle(null); return; }
    supabase.from("items").select("title").eq("id", linkedItemId).single()
      .then(({ data }) => setLinkedItemTitle(data?.title ?? null));
  }, [linkedItemId]);

  function addRow() { setRows([...rows, { amount: "", partyId: null, shoppingItemId: null }]); }
  function updateRow(idx: number, patch: Partial<SplitRow>) {
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function removeRow(idx: number) { setRows(rows.filter((_, i) => i !== idx)); }

  async function save() {
    const total = parseFloat(amount);
    if (!total || total <= 0) {
      Alert.alert("Missing info", "Enter a valid amount.");
      return;
    }
    if (splitting) {
      const sum = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
      if (Math.abs(sum - total) > 0.01) {
        Alert.alert("Doesn't add up", `Split rows total ${sum.toFixed(2)}, but the expense is ${total.toFixed(2)}.`);
        return;
      }
    }
    setSaving(true);

    const { data: expense, error } = await supabase.from("expenses").insert({
      trip_id: tripId, item_id: linkedItemId, currency_code: currencyCode, amount: total,
      expense_date: date || null, note: note || null,
    }).select().single();

    if (error || !expense) {
      setSaving(false);
      Alert.alert("Couldn't save", error?.message ?? "Unknown error");
      return;
    }

    const allocationRows = splitting
      ? rows.map((r) => ({
          expense_id: expense.id, amount: parseFloat(r.amount) || 0,
          party_id: r.partyId, shopping_list_item_id: r.shoppingItemId,
        }))
      : [{ expense_id: expense.id, amount: total, party_id: singleParty, shopping_list_item_id: singleShoppingItem }];

    await supabase.from("allocations").insert(allocationRows);

    setSaving(false);
    setAmount(""); setNote(""); setSplitting(false); setSingleParty(null);
    setRows([{ amount: "", partyId: null, shoppingItemId: null }]);
    if (!presetItemId) setLinkedItemId(null);
    if (!presetShoppingItemId) setSingleShoppingItem(null);
    onSaved();
  }

  function shoppingItemName(id: string | null) {
    if (!id) return null;
    return shoppingItems.find((s) => s.id === id)?.name ?? null;
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={styles.sheetTitle}>Add expense</Text>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Amount</Text>
                <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
              </View>
              <View style={{ width: 10 }} />
              <View style={{ width: 90 }}>
                <Text style={styles.label}>Currency</Text>
                <View style={styles.currencyPicker}>
                  {currencies.map((c) => (
                    <Pressable key={c.code} style={[styles.currencyChip, currencyCode === c.code && styles.currencyChipActive]} onPress={() => setCurrencyCode(c.code)}>
                      <Text style={[styles.currencyChipText, currencyCode === c.code && styles.currencyChipTextActive]}>{c.code}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <DateField label="Date" value={date} onChange={setDate} />

            <Text style={styles.label}>Note</Text>
            <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Duty free, dinner, taxi\u2026" />

            {!presetItemId && (
              <>
                <Text style={styles.label}>Linked item</Text>
                <Pressable style={styles.input} onPress={() => setPickerOpen(true)}>
                  <Text style={{ color: linkedItemTitle ? colors.ink : colors.inkSoft }}>
                    {linkedItemTitle || "No item \u2014 tap to link one"}
                  </Text>
                </Pressable>
                {linkedItemId && (
                  <Pressable onPress={() => setLinkedItemId(null)}>
                    <Text style={styles.removeText}>Unlink item</Text>
                  </Pressable>
                )}
              </>
            )}

            <View style={styles.switchRow}>
              <Switch value={splitting} onValueChange={setSplitting} />
              <Text style={styles.switchLabel}>Split across people / shopping items / partly generic</Text>
            </View>

            {!splitting ? (
              <>
                {parties.length > 0 && (
                  <>
                    <Text style={styles.label}>Owed by</Text>
                    <View style={styles.chipRow}>
                      <Pressable style={[styles.chip, !singleParty && styles.chipActive]} onPress={() => setSingleParty(null)}>
                        <Text style={[styles.chipText, !singleParty && styles.chipTextActive]}>Me</Text>
                      </Pressable>
                      {parties.map((p) => (
                        <Pressable key={p.id} style={[styles.chip, singleParty === p.id && styles.chipActive]} onPress={() => setSingleParty(p.id)}>
                          <Text style={[styles.chipText, singleParty === p.id && styles.chipTextActive]}>{p.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}
                {shoppingItems.length > 0 && (
                  <>
                    <Text style={styles.label}>Shopping list item</Text>
                    <View style={styles.chipRow}>
                      <Pressable style={[styles.chip, !singleShoppingItem && styles.chipActive]} onPress={() => setSingleShoppingItem(null)}>
                        <Text style={[styles.chipText, !singleShoppingItem && styles.chipTextActive]}>None</Text>
                      </Pressable>
                      {shoppingItems.map((s) => (
                        <Pressable key={s.id} style={[styles.chip, singleShoppingItem === s.id && styles.chipActive]} onPress={() => setSingleShoppingItem(s.id)}>
                          <Text style={[styles.chipText, singleShoppingItem === s.id && styles.chipTextActive]}>{s.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}
              </>
            ) : (
              <>
                <Text style={styles.label}>Split</Text>
                {rows.map((row, idx) => (
                  <View key={idx} style={styles.splitRow}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={row.amount}
                      onChangeText={(v) => updateRow(idx, { amount: v })}
                      keyboardType="decimal-pad"
                      placeholder="Amount"
                    />
                    <Text style={styles.splitSubLabel}>Owed by</Text>
                    <View style={styles.chipRow}>
                      <Pressable style={[styles.chip, !row.partyId && styles.chipActive]} onPress={() => updateRow(idx, { partyId: null })}>
                        <Text style={[styles.chipText, !row.partyId && styles.chipTextActive]}>Me</Text>
                      </Pressable>
                      {parties.map((p) => (
                        <Pressable key={p.id} style={[styles.chip, row.partyId === p.id && styles.chipActive]} onPress={() => updateRow(idx, { partyId: p.id })}>
                          <Text style={[styles.chipText, row.partyId === p.id && styles.chipTextActive]}>{p.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {shoppingItems.length > 0 && (
                      <>
                        <Text style={styles.splitSubLabel}>Shopping item</Text>
                        <View style={styles.chipRow}>
                          <Pressable style={[styles.chip, !row.shoppingItemId && styles.chipActive]} onPress={() => updateRow(idx, { shoppingItemId: null })}>
                            <Text style={[styles.chipText, !row.shoppingItemId && styles.chipTextActive]}>None</Text>
                          </Pressable>
                          {shoppingItems.map((s) => (
                            <Pressable key={s.id} style={[styles.chip, row.shoppingItemId === s.id && styles.chipActive]} onPress={() => updateRow(idx, { shoppingItemId: s.id })}>
                              <Text style={[styles.chipText, row.shoppingItemId === s.id && styles.chipTextActive]}>{s.name}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </>
                    )}
                    {rows.length > 1 && (
                      <Pressable onPress={() => removeRow(idx)}><Text style={styles.removeText}>Remove row</Text></Pressable>
                    )}
                  </View>
                ))}
                <Pressable onPress={addRow}><Text style={styles.addRowText}>+ Add another split</Text></Pressable>
              </>
            )}

            <Pressable style={styles.button} onPress={save} disabled={saving}>
              <Text style={styles.buttonText}>{saving ? "Saving\u2026" : "Add expense"}</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>

      <ItemPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(i) => { setLinkedItemId(i.id); setPickerOpen(false); }}
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
  splitSubLabel: { color: colors.inkSoft, fontSize: 10, fontWeight: "600", marginTop: 8, textTransform: "uppercase" },
  input: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
  },
  row: { flexDirection: "row" },
  currencyPicker: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  currencyChip: { paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paperRaised },
  currencyChipActive: { backgroundColor: colors.amber, borderColor: colors.amber },
  currencyChipText: { color: colors.inkSoft, fontWeight: "600", fontSize: 11 },
  currencyChipTextActive: { color: "#fff" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  switchLabel: { color: colors.inkSoft, fontSize: 12, flex: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 6 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paperRaised },
  chipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { color: colors.inkSoft, fontWeight: "600", fontSize: 12 },
  chipTextActive: { color: "#fff" },
  splitRow: { backgroundColor: colors.paperRaised, borderRadius: radius.md, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.line },
  removeText: { color: colors.coral, fontSize: 11, fontWeight: "600", marginTop: 8 },
  addRowText: { color: colors.teal, fontWeight: "600", fontSize: 13, marginTop: 4 },
  button: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 24, marginBottom: 20 },
  buttonText: { color: colors.paper, fontWeight: "700" },
});
