import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, Modal, Switch,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { TripCurrency, TripParty, Expense, Allocation } from "@/lib/types";
import { DateField } from "@/components/DateTimeFields";

type ExpenseWithAllocations = Expense & { allocations: Allocation[] };

interface SplitRow {
  amount: string;
  partyId: string | null; // null = self / not owed
}

export default function MoneyScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [currencies, setCurrencies] = useState<TripCurrency[]>([]);
  const [parties, setParties] = useState<TripParty[]>([]);
  const [expenses, setExpenses] = useState<ExpenseWithAllocations[]>([]);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    const { data: c } = await supabase.from("trip_currencies").select("*").eq("trip_id", tripId);
    if (c) setCurrencies(c as TripCurrency[]);
    const { data: p } = await supabase.from("trip_parties").select("*").eq("trip_id", tripId);
    if (p) setParties(p as TripParty[]);
    const { data: e } = await supabase
      .from("expenses").select("*, allocations(*)").eq("trip_id", tripId)
      .order("expense_date", { ascending: false });
    if (e) setExpenses(e as ExpenseWithAllocations[]);
  }, [tripId]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  function rateFor(code: string) {
    return currencies.find((c) => c.code === code)?.rate_to_nis ?? 1;
  }
  function toNis(amount: number, code: string) {
    return amount * rateFor(code);
  }

  const totalNis = expenses.reduce((sum, e) => sum + toNis(e.amount, e.currency_code), 0);

  const owedByParty: Record<string, number> = {};
  for (const e of expenses) {
    for (const a of e.allocations ?? []) {
      if (!a.party_id) continue;
      owedByParty[a.party_id] = (owedByParty[a.party_id] ?? 0) + toNis(a.amount, e.currency_code);
    }
  }

  function partyName(id: string) {
    return parties.find((p) => p.id === id)?.name ?? "Unknown";
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Money" }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 90 }}>
        <View style={styles.summaryCard}>
          <Text style={styles.totalLabel}>Total spent (NIS)</Text>
          <Text style={styles.totalAmt}>\u20aa {totalNis.toFixed(0)}</Text>
          {Object.entries(owedByParty).map(([partyId, amt]) => (
            <View key={partyId} style={styles.owedRow}>
              <Text style={styles.owedLabel}>Owed by {partyName(partyId)}</Text>
              <Text style={styles.owedAmt}>\u20aa {amt.toFixed(0)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Expenses</Text>
        {expenses.map((e) => {
          const isSplit = (e.allocations?.length ?? 0) > 1;
          return (
            <View key={e.id} style={styles.expenseRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.expenseDesc}>{e.note || "Expense"}</Text>
                <Text style={styles.expenseTag}>
                  {e.expense_date ?? ""}{isSplit ? " \u00b7 split" : ""}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.expenseAmt}>{e.amount} {e.currency_code}</Text>
                {e.currency_code !== "NIS" && (
                  <Text style={styles.expenseNis}>\u2248 {toNis(e.amount, e.currency_code).toFixed(0)} NIS</Text>
                )}
              </View>
            </View>
          );
        })}
        {expenses.length === 0 && <Text style={styles.empty}>No expenses yet.</Text>}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => setFormOpen(true)}>
        <Text style={styles.fabText}>+ Add expense</Text>
      </Pressable>

      <AddExpenseModal
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); load(); }}
        tripId={tripId}
        currencies={currencies}
        parties={parties}
      />
    </View>
  );
}

function AddExpenseModal({
  visible, onClose, onSaved, tripId, currencies, parties,
}: {
  visible: boolean; onClose: () => void; onSaved: () => void;
  tripId: string; currencies: TripCurrency[]; parties: TripParty[];
}) {
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState("NIS");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [splitting, setSplitting] = useState(false);
  const [singleParty, setSingleParty] = useState<string | null>(null); // for the non-split case
  const [rows, setRows] = useState<SplitRow[]>([{ amount: "", partyId: null }]);
  const [saving, setSaving] = useState(false);

  function addRow() {
    setRows([...rows, { amount: "", partyId: null }]);
  }
  function updateRow(idx: number, patch: Partial<SplitRow>) {
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function removeRow(idx: number) {
    setRows(rows.filter((_, i) => i !== idx));
  }

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
      trip_id: tripId, currency_code: currencyCode, amount: total,
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
    onSaved();
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  summaryCard: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: 18, marginBottom: 14 },
  totalLabel: { fontFamily: "IBMPlexMono_500Medium", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: colors.amberSoft },
  totalAmt: { fontFamily: "Archivo_700Bold" as any, fontWeight: "800", fontSize: 32, color: colors.paper, marginVertical: 4 },
  owedRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.15)" },
  owedLabel: { color: colors.paper, fontSize: 12 },
  owedAmt: { color: colors.amberSoft, fontWeight: "700", fontSize: 12 },
  sectionLabel: { color: colors.inkSoft, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  expenseRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginBottom: 6,
  },
  expenseDesc: { color: colors.ink, fontWeight: "600", fontSize: 13 },
  expenseTag: { color: colors.inkSoft, fontSize: 11, marginTop: 2 },
  expenseAmt: { fontFamily: "IBMPlexMono_500Medium", color: colors.ink, fontWeight: "600", fontSize: 13 },
  expenseNis: { color: colors.inkSoft, fontSize: 10 },
  empty: { textAlign: "center", color: colors.inkSoft, marginTop: 20 },
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
  removeText: { color: colors.coral, fontSize: 11, fontWeight: "600" },
  addRowText: { color: colors.teal, fontWeight: "600", fontSize: 13, marginTop: 4 },
  button: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 24, marginBottom: 20 },
  buttonText: { color: colors.paper, fontWeight: "700" },
});
