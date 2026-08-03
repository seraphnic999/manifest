import { useState, useEffect } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, Modal, Switch,
} from "react-native";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { TripCurrency, TripParty } from "@/lib/types";
import { DateField } from "@/components/DateTimeFields";

interface SplitRow {
  amount: string;
  partyId: string | null;
}

interface PickableItem {
  id: string;
  title: string;
  type: string;
}

export default function AddExpenseModal({
  visible, onClose, onSaved, tripId, currencies, parties, presetItemId,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  tripId: string;
  currencies: TripCurrency[];
  parties: TripParty[];
  presetItemId?: string; // when set, the item picker is hidden and this item is always used
}) {
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState("NIS");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [splitting, setSplitting] = useState(false);
  const [singleParty, setSingleParty] = useState<string | null>(null);
  const [rows, setRows] = useState<SplitRow[]>([{ amount: "", partyId: null }]);
  const [saving, setSaving] = useState(false);

  const [linkedItemId, setLinkedItemId] = useState<string | null>(presetItemId ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [allItems, setAllItems] = useState<PickableItem[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const [linkedItemTitle, setLinkedItemTitle] = useState<string | null>(null);

  useEffect(() => { setLinkedItemId(presetItemId ?? null); }, [presetItemId, visible]);

  useEffect(() => {
    if (!pickerOpen || !tripId) return;
    supabase.from("items").select("id, title, type").eq("trip_id", tripId).is("deleted_at", null).order("title")
      .then(({ data }) => data && setAllItems(data as PickableItem[]));
  }, [pickerOpen, tripId]);

  useEffect(() => {
    if (!linkedItemId) { setLinkedItemTitle(null); return; }
    supabase.from("items").select("title").eq("id", linkedItemId).single()
      .then(({ data }) => setLinkedItemTitle(data?.title ?? null));
  }, [linkedItemId]);

  function addRow() { setRows([...rows, { amount: "", partyId: null }]); }
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
      ? rows.map((r) => ({ expense_id: expense.id, amount: parseFloat(r.amount) || 0, party_id: r.partyId }))
      : [{ expense_id: expense.id, amount: total, party_id: singleParty }];

    await supabase.from("allocations").insert(allocationRows);

    setSaving(false);
    setAmount(""); setNote(""); setSplitting(false); setSingleParty(null);
    setRows([{ amount: "", partyId: null }]);
    if (!presetItemId) setLinkedItemId(null);
    onSaved();
  }

  const filteredItems = allItems.filter((i) => i.title.toLowerCase().includes(itemSearch.toLowerCase()));

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
              <Text style={styles.switchLabel}>Split across people / partly generic</Text>
            </View>

            {!splitting ? (
              parties.length > 0 && (
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
              )
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
                    <View style={styles.chipRow}>
                      <Pressable style={[styles.chip, !row.partyId && styles.chipActive]} onPress={() => updateRow(idx, { partyId: null })}>
                        <Text style={[styles.chipText, !row.partyId && styles.chipTextActive]}>Me</Text>
                      </Pressable>
                      {parties.map((p) => (
                        <Pressable key={p.id} style={[styles.chip, row.partyId === p.id && styles.chipActive]} onPress={() => updateRow(idx, { partyId: p.id })}>
                          <Text style={[styles.chipText, row.partyId === p.id && styles.chipTextActive]}>{p.name}</Text>
                        </Pressable>
                      ))}
                      {rows.length > 1 && (
                        <Pressable onPress={() => removeRow(idx)}><Text style={styles.removeText}>Remove</Text></Pressable>
                      )}
                    </View>
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

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Link to an item</Text>
            <TextInput
              style={styles.input}
              value={itemSearch}
              onChangeText={setItemSearch}
              placeholder="Search items\u2026"
              autoFocus
            />
            <ScrollView style={{ maxHeight: 320, marginTop: 10 }}>
              {filteredItems.map((i) => (
                <Pressable
                  key={i.id}
                  style={styles.itemRow}
                  onPress={() => { setLinkedItemId(i.id); setPickerOpen(false); setItemSearch(""); }}
                >
                  <Text style={styles.itemRowType}>{i.type.toUpperCase()}</Text>
                  <Text style={styles.itemRowTitle}>{i.title}</Text>
                </Pressable>
              ))}
              {filteredItems.length === 0 && <Text style={styles.empty}>No matching items.</Text>}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%" },
  pickerSheet: { backgroundColor: colors.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "80%" },
  sheetTitle: { fontFamily: "Archivo_700Bold" as any, fontWeight: "800", fontSize: 18, color: colors.ink, marginBottom: 12 },
  label: { color: colors.inkSoft, fontSize: 12, fontWeight: "600", marginTop: 14, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
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
  removeText: { color: colors.coral, fontSize: 11, fontWeight: "600", marginTop: 6 },
  addRowText: { color: colors.teal, fontWeight: "600", fontSize: 13, marginTop: 4 },
  button: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 24, marginBottom: 20 },
  buttonText: { color: colors.paper, fontWeight: "700" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  itemRowType: { fontFamily: "IBMPlexMono_500Medium", fontSize: 9, color: colors.teal, fontWeight: "600", width: 70 },
  itemRowTitle: { color: colors.ink, fontSize: 14, flex: 1 },
  empty: { color: colors.inkSoft, textAlign: "center", marginTop: 20, fontSize: 13 },
});
