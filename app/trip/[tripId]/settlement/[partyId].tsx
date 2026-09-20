import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, Modal } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/lib/alert";
import { supabase } from "@/lib/supabase";
import { radius, fonts, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import Icon from "@/components/icons/Icon";
import { formatDateDDMMYYYY, localIsoDate } from "@/lib/dateFormat";
import { Expense, Allocation, TripCurrency } from "@/lib/types";
import { fetchPartyPayments, addSettlementPayment, deleteSettlementPayment } from "@/lib/settlement";

type ExpenseWithAllocations = Expense & { allocations: Allocation[] };

interface OwedItem {
  expenseId: string;
  note: string | null;
  date: string | null;
  nis: number;
}

interface SettlementData {
  partyName: string;
  owedItems: OwedItem[];
  payments: { id: string; amount_nis: number; payment_date: string | null; note: string | null }[];
}

async function fetchSettlementData(tripId: string, partyId: string): Promise<SettlementData> {
  const [{ data: party, error: partyError }, { data: currencies, error: currenciesError }, { data: expenses, error: expensesError }, payments] =
    await Promise.all([
      supabase.from("trip_parties").select("name").eq("id", partyId).single(),
      supabase.from("trip_currencies").select("*").eq("trip_id", tripId),
      supabase.from("expenses").select("*, allocations(*)").eq("trip_id", tripId),
      fetchPartyPayments(tripId, partyId),
    ]);
  if (partyError) throw partyError;
  if (currenciesError) throw currenciesError;
  if (expensesError) throw expensesError;

  const rateFor = (code: string) => (currencies as TripCurrency[] ?? []).find((c) => c.code === code)?.rate_to_nis ?? 1;
  const toNis = (amount: number, code: string) => amount * rateFor(code);

  const owedItems: OwedItem[] = [];
  for (const e of (expenses ?? []) as ExpenseWithAllocations[]) {
    for (const a of e.allocations ?? []) {
      if (a.party_id !== partyId) continue;
      owedItems.push({ expenseId: e.id, note: e.note, date: e.expense_date, nis: toNis(a.amount, e.currency_code) });
    }
  }

  return {
    partyName: party?.name ?? "Unknown",
    owedItems,
    payments: payments.map((p) => ({ id: p.id, amount_nis: p.amount_nis, payment_date: p.payment_date, note: p.note })),
  };
}

export default function SettlementScreen() {
  const { tripId, partyId } = useLocalSearchParams<{ tripId: string; partyId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [recordOpen, setRecordOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(localIsoDate());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { data, refetch } = useQuery({
    queryKey: ["settlement", tripId, partyId],
    queryFn: () => fetchSettlementData(tripId, partyId),
  });
  const partyName = data?.partyName ?? "";
  const owedItems = data?.owedItems ?? [];
  const payments = data?.payments ?? [];

  const owedTotal = owedItems.reduce((sum, i) => sum + i.nis, 0);
  const paidTotal = payments.reduce((sum, p) => sum + p.amount_nis, 0);
  // Clamped rather than allowed to go negative — an overpayment shouldn't
  // read as "still owes -46" (confusing), and without this, an exact
  // full payment can render as the JS floating-point artifact "-0".
  const stillOwes = Math.max(0, owedTotal - paidTotal);

  function openRecordModal() {
    setAmount(stillOwes > 0 ? stillOwes.toFixed(0) : "");
    setPaymentDate(localIsoDate());
    setNote("");
    setRecordOpen(true);
  }

  async function saveRecordPayment() {
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      Alert.alert("Enter an amount", "The payment amount must be a positive number.");
      return;
    }
    if (paymentDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate.trim())) {
      Alert.alert("Invalid date", "Enter the date as YYYY-MM-DD, or leave it blank.");
      return;
    }
    setSaving(true);
    try {
      await addSettlementPayment(tripId, partyId, {
        amountNis: amountNum,
        paymentDate: paymentDate || null,
        note: note.trim() || null,
      });
      setRecordOpen(false);
      refetch();
    } catch (e: any) {
      Alert.alert("Couldn't record payment", e?.message ?? "Unknown error");
    }
    setSaving(false);
  }

  function confirmDeletePayment(id: string) {
    Alert.alert("Remove this payment?", "This just removes the record — it doesn't undo any real-world money.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => { await deleteSettlementPayment(id); refetch(); } },
    ]);
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push(`/trip/${tripId}/report`))} hitSlop={10} style={styles.backBtn}>
          <Icon name="back" size={25} color={colors.blue} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{partyName}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Owed</Text>
            <Text style={styles.summaryValue}>{"₪"} {owedTotal.toFixed(0)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Paid so far</Text>
            <Text style={styles.summaryValue}>{"₪"} {paidTotal.toFixed(0)}</Text>
          </View>
          <View style={styles.stillOwesRow}>
            <Text style={styles.stillOwesLabel}>Still owes</Text>
            <Text style={styles.stillOwesValue}>{"₪"} {stillOwes.toFixed(0)}</Text>
          </View>
        </View>

        <Pressable style={styles.recordButton} onPress={openRecordModal}>
          <Icon name="add" size={18} color={colors.paper} />
          <Text style={styles.recordButtonText}>Record payment</Text>
        </Pressable>

        <Text style={styles.sectionLabel}>Owed</Text>
        <View style={styles.card}>
          {owedItems.length === 0 && <Text style={styles.empty}>Nothing allocated to {partyName || "this person"} yet.</Text>}
          {owedItems.map((item, idx) => (
            <View key={idx} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemNote}>{item.note || "Expense"}</Text>
                {item.date && <Text style={styles.itemDate}>{formatDateDDMMYYYY(item.date)}</Text>}
              </View>
              <Text style={styles.itemAmt}>{"₪"} {item.nis.toFixed(0)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Payments received</Text>
        <View style={styles.card}>
          {payments.length === 0 && <Text style={styles.empty}>No payments recorded yet.</Text>}
          {payments.map((p) => (
            <View key={p.id} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemNote}>{p.note || "Payment"}</Text>
                {p.payment_date && <Text style={styles.itemDate}>{formatDateDDMMYYYY(p.payment_date)}</Text>}
              </View>
              <Text style={styles.itemAmt}>{"₪"} {p.amount_nis.toFixed(0)}</Text>
              <Pressable onPress={() => confirmDeletePayment(p.id)} hitSlop={8} style={{ marginLeft: 10 }}>
                <View style={{ transform: [{ rotate: "45deg" }] }}>
                  <Icon name="add" size={16} color={colors.coral} />
                </View>
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal visible={recordOpen} transparent animationType="fade" onRequestClose={() => setRecordOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setRecordOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Record payment</Text>
            <Text style={styles.label}>Amount (NIS)</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
              placeholder="e.g. 250"
              placeholderTextColor={colors.inkSoft}
              autoFocus
            />
            <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={paymentDate}
              onChangeText={setPaymentDate}
              placeholder={localIsoDate()}
              placeholderTextColor={colors.inkSoft}
              autoCapitalize="none"
            />
            <Text style={styles.label}>Note (optional)</Text>
            <TextInput
              style={styles.input}
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Bit transfer, cash on day 3"
              placeholderTextColor={colors.inkSoft}
            />
            <Pressable style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={saveRecordPayment} disabled={saving}>
              <Text style={styles.saveButtonText}>{saving ? "Saving…" : "Save"}</Text>
            </Pressable>
            <Pressable style={styles.cancelButton} onPress={() => setRecordOpen(false)} disabled={saving}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingBottom: 10,
    backgroundColor: colors.paperRaised, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  backBtn: { padding: 2 },
  title: { fontFamily: fonts.display, fontSize: 19, color: colors.ink, flexShrink: 1 },
  summaryCard: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: 18, marginBottom: 14 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  summaryLabel: { color: colors.paper, opacity: 0.75, fontSize: 13 },
  summaryValue: { fontFamily: "JetBrainsMono_600SemiBold", color: colors.paper, fontSize: 15 },
  stillOwesRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.2)",
  },
  stillOwesLabel: { color: colors.paper, fontWeight: "700", fontSize: 15 },
  stillOwesValue: { fontFamily: "Poppins_700Bold" as any, fontWeight: "800", color: colors.paper, fontSize: 24 },
  recordButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.blue, borderRadius: radius.md, padding: 13, marginBottom: 18,
  },
  recordButtonText: { color: colors.paper, fontWeight: "700", fontSize: 14 },
  sectionLabel: { color: colors.inkSoft, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  card: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 14, marginBottom: 18,
  },
  empty: { color: colors.inkSoft, fontSize: 12, fontStyle: "italic" },
  itemRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  itemNote: { color: colors.ink, fontWeight: "600", fontSize: 13 },
  itemDate: { color: colors.inkSoft, fontSize: 11, marginTop: 2 },
  itemAmt: { fontFamily: "JetBrainsMono_600SemiBold", color: colors.ink, fontWeight: "600", fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.5)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: colors.paper, borderRadius: radius.lg, padding: 20, width: "100%", maxWidth: 420, alignSelf: "center" },
  modalTitle: { color: colors.ink, fontWeight: "800", fontSize: 17, marginBottom: 10 },
  label: { color: colors.inkSoft, fontSize: 12, fontWeight: "600", marginTop: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
  },
  saveButton: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 13, alignItems: "center", marginTop: 16 },
  saveButtonText: { color: colors.paper, fontWeight: "700" },
  cancelButton: { alignItems: "center", padding: 10, marginTop: 4 },
  cancelButtonText: { color: colors.inkSoft, fontWeight: "600", fontSize: 13.5 },
});
