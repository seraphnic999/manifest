import { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from "react-native";
import { useLocalSearchParams, Stack, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { TripCurrency, TripParty, Expense, Allocation, ExpenseType } from "@/lib/types";
import { EXPENSE_TYPES, EXPENSE_TYPE_LABELS } from "@/lib/expenseType";
import { classifyExpenseTiming, ExpenseTiming } from "@/lib/expenseTiming";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";
import TripNavBar from "@/components/TripNavBar";
import HomeButton from "@/components/HomeButton";
import { useNetworkStatus } from "@/lib/useNetworkStatus";
import OfflineBanner from "@/components/OfflineBanner";

type ExpenseWithAllocations = Expense & { allocations: Allocation[] };

interface OwedItem {
  expenseId: string;
  note: string | null;
  date: string | null;
  nis: number;
}

function Bar({ label, value, maxValue, color }: { label: string; value: number; maxValue: number; color: string }) {
  const pct = maxValue > 0 ? Math.max(2, (value / maxValue) * 100) : 0;
  return (
    <View style={barStyles.row}>
      <View style={barStyles.labelRow}>
        <Text style={barStyles.label}>{label}</Text>
        <Text style={barStyles.value}>{"₪"} {value.toFixed(0)}</Text>
      </View>
      <View style={barStyles.track}>
        <View style={[barStyles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const barStyles = StyleSheet.create({
  row: { marginBottom: 12 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  label: { color: colors.ink, fontWeight: "600", fontSize: 13 },
  value: { fontFamily: "IBMPlexMono_500Medium", color: colors.inkSoft, fontSize: 12 },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.paperRaised, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 5 },
});

const TYPE_COLORS: Record<ExpenseType, string> = {
  flight: "#5B9BD5", lodging: "#C98A2E", transport: "#3B6E71",
  meals: "#E07A3C", attractions: "#4C9A6A", shopping: "#9A6FC9", other: "#8C8577",
};

interface ReportData {
  tripStartDate: string | null;
  currencies: TripCurrency[];
  parties: TripParty[];
  expenses: ExpenseWithAllocations[];
}

async function fetchReportData(tripId: string): Promise<ReportData> {
  const { data: trip, error: tripError } = await supabase.from("trips").select("start_date").eq("id", tripId).single();
  if (tripError) throw tripError;
  const { data: c, error: currenciesError } = await supabase.from("trip_currencies").select("*").eq("trip_id", tripId);
  if (currenciesError) throw currenciesError;
  const { data: p, error: partiesError } = await supabase.from("trip_parties").select("*").eq("trip_id", tripId);
  if (partiesError) throw partiesError;
  const { data: e, error: expensesError } = await supabase.from("expenses").select("*, allocations(*)").eq("trip_id", tripId);
  if (expensesError) throw expensesError;

  return {
    tripStartDate: trip?.start_date ?? null,
    currencies: (c ?? []) as TripCurrency[],
    parties: (p ?? []) as TripParty[],
    expenses: (e ?? []) as ExpenseWithAllocations[],
  };
}

export default function ExpenseReport() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const isOnline = useNetworkStatus();
  const [openPartyId, setOpenPartyId] = useState<string | null>(null);

  const { data, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["report", tripId],
    queryFn: () => fetchReportData(tripId),
  });
  const tripStartDate = data?.tripStartDate ?? null;
  const currencies = data?.currencies ?? [];
  const parties = data?.parties ?? [];
  const expenses = data?.expenses ?? [];

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  function rateFor(code: string) {
    return currencies.find((c) => c.code === code)?.rate_to_nis ?? 1;
  }
  function toNis(amount: number, code: string) {
    return amount * rateFor(code);
  }

  const totalNis = expenses.reduce((sum, e) => sum + toNis(e.amount, e.currency_code), 0);

  const totalsByType: Record<ExpenseType, number> = { flight: 0, lodging: 0, transport: 0, meals: 0, attractions: 0, shopping: 0, other: 0 };
  for (const e of expenses) {
    const t = (e.type as ExpenseType) ?? "other";
    totalsByType[t] = (totalsByType[t] ?? 0) + toNis(e.amount, e.currency_code);
  }
  const maxTypeValue = Math.max(0, ...Object.values(totalsByType));

  const totalsByTiming: Record<ExpenseTiming, number> = { "pre-trip": 0, "in-trip": 0 };
  if (tripStartDate) {
    for (const e of expenses) {
      const timing = classifyExpenseTiming(e.expense_date, tripStartDate);
      totalsByTiming[timing] += toNis(e.amount, e.currency_code);
    }
  }
  const maxTimingValue = Math.max(totalsByTiming["pre-trip"], totalsByTiming["in-trip"]);

  const owedByParty: Record<string, number> = {};
  const owedItemsByParty: Record<string, OwedItem[]> = {};
  for (const e of expenses) {
    for (const a of e.allocations ?? []) {
      if (!a.party_id) continue;
      const nis = toNis(a.amount, e.currency_code);
      owedByParty[a.party_id] = (owedByParty[a.party_id] ?? 0) + nis;
      (owedItemsByParty[a.party_id] ??= []).push({ expenseId: e.id, note: e.note, date: e.expense_date, nis });
    }
  }
  const maxOwedValue = Math.max(0, ...Object.values(owedByParty));
  const totalOwedToMeNis = Object.values(owedByParty).reduce((sum, v) => sum + v, 0);
  const myNetSpendNis = totalNis - totalOwedToMeNis;

  const refundsByCompany: Record<string, number> = {};
  for (const e of expenses) {
    if (!e.refund_amount) continue;
    const company = e.refund_company || "Unspecified";
    refundsByCompany[company] = (refundsByCompany[company] ?? 0) + toNis(e.refund_amount, e.currency_code);
  }
  const maxRefundValue = Math.max(0, ...Object.values(refundsByCompany));
  const totalRefundNis = Object.values(refundsByCompany).reduce((sum, v) => sum + v, 0);

  function partyName(id: string) {
    return parties.find((p) => p.id === id)?.name ?? "Unknown";
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: "Expense report",
        headerRight: () => (
          <View style={{ marginRight: 14 }}>
            <HomeButton />
          </View>
        ),
      }} />
      <TripNavBar tripId={tripId} active="money" />
      <OfflineBanner dataUpdatedAt={!isOnline ? dataUpdatedAt : undefined} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={styles.summaryCard}>
          <Text style={styles.totalLabel}>Total spent (NIS)</Text>
          <Text style={styles.totalAmt}>{"₪"} {totalNis.toFixed(0)}</Text>
        </View>

        <Text style={styles.sectionLabel}>By type</Text>
        <View style={styles.card}>
          {EXPENSE_TYPES.filter((t) => totalsByType[t] > 0).map((t) => (
            <Bar key={t} label={EXPENSE_TYPE_LABELS[t]} value={totalsByType[t]} maxValue={maxTypeValue} color={TYPE_COLORS[t]} />
          ))}
          {expenses.length === 0 && <Text style={styles.empty}>No expenses yet.</Text>}
        </View>

        <Text style={styles.sectionLabel}>Pre-trip vs in-trip</Text>
        <View style={styles.card}>
          <Bar label="Pre-trip" value={totalsByTiming["pre-trip"]} maxValue={maxTimingValue} color={colors.amber} />
          <Bar label="In-trip" value={totalsByTiming["in-trip"]} maxValue={maxTimingValue} color={colors.teal} />
        </View>

        <Text style={styles.sectionLabel}>Owed to me</Text>
        <View style={styles.card}>
          {Object.keys(owedByParty).length === 0 && <Text style={styles.empty}>Nobody owes you money on this trip.</Text>}
          {Object.entries(owedByParty).map(([partyId, amt]) => (
            <Pressable key={partyId} onPress={() => setOpenPartyId(partyId)}>
              <Bar label={partyName(partyId)} value={amt} maxValue={maxOwedValue} color={colors.coral} />
            </Pressable>
          ))}
          {Object.keys(owedByParty).length > 0 && <Text style={styles.hint}>Tap a person to see the itemized list.</Text>}
          <View style={styles.netRow}>
            <Text style={styles.netLabel}>You're actually paying</Text>
            <Text style={styles.netAmt}>{"₪"} {myNetSpendNis.toFixed(0)}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Tax refunds</Text>
        <View style={styles.card}>
          {Object.keys(refundsByCompany).length === 0 && <Text style={styles.empty}>No tax refunds tracked on this trip.</Text>}
          {Object.entries(refundsByCompany).map(([company, amt]) => (
            <Bar key={company} label={company} value={amt} maxValue={maxRefundValue} color={colors.amber} />
          ))}
          {Object.keys(refundsByCompany).length > 0 && (
            <View style={styles.netRow}>
              <Text style={styles.netLabel}>Total refunds</Text>
              <Text style={styles.netAmt}>{"₪"} {totalRefundNis.toFixed(0)}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={!!openPartyId} transparent animationType="fade" onRequestClose={() => setOpenPartyId(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpenPartyId(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{openPartyId ? partyName(openPartyId) : ""}</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {(openPartyId ? owedItemsByParty[openPartyId] ?? [] : []).map((item, idx) => (
                <View key={idx} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemNote}>{item.note || "Expense"}</Text>
                    {item.date && <Text style={styles.itemDate}>{formatDateDDMMYYYY(item.date)}</Text>}
                  </View>
                  <Text style={styles.itemAmt}>{"₪"} {item.nis.toFixed(0)}</Text>
                </View>
              ))}
            </ScrollView>
            <Pressable style={styles.modalCloseBtn} onPress={() => setOpenPartyId(null)}>
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  summaryCard: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: 18, marginBottom: 14 },
  totalLabel: { fontFamily: "IBMPlexMono_500Medium", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: colors.amberSoft },
  totalAmt: { fontFamily: "Archivo_700Bold" as any, fontWeight: "800", fontSize: 32, color: colors.paper, marginVertical: 4 },
  sectionLabel: { color: colors.inkSoft, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  card: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 14, marginBottom: 18,
  },
  empty: { color: colors.inkSoft, fontSize: 12, fontStyle: "italic" },
  hint: { color: colors.inkSoft, fontSize: 11, fontStyle: "italic", marginTop: 2 },
  netRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line,
  },
  netLabel: { color: colors.ink, fontWeight: "700", fontSize: 13 },
  netAmt: { fontFamily: "IBMPlexMono_500Medium", color: colors.ink, fontWeight: "800", fontSize: 16 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.5)", justifyContent: "center", padding: 24 },
  modalCard: {
    backgroundColor: colors.paper, borderRadius: radius.lg, padding: 20,
    width: "100%", maxWidth: 420, alignSelf: "center",
  },
  modalTitle: { color: colors.ink, fontWeight: "800", fontSize: 17, marginBottom: 10 },
  itemRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  itemNote: { color: colors.ink, fontWeight: "600", fontSize: 13 },
  itemDate: { color: colors.inkSoft, fontSize: 11, marginTop: 2 },
  itemAmt: { fontFamily: "IBMPlexMono_500Medium", color: colors.ink, fontWeight: "600", fontSize: 13 },
  modalCloseBtn: { alignItems: "center", padding: 12, marginTop: 10 },
  modalCloseBtnText: { color: colors.teal, fontWeight: "700", fontSize: 13 },
});
