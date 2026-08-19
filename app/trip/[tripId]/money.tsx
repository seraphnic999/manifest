import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { TripCurrency, TripParty, Expense, Allocation, ExpenseType } from "@/lib/types";
import { EXPENSE_TYPES, EXPENSE_TYPE_LABELS } from "@/lib/expenseType";
import { classifyExpenseTiming } from "@/lib/expenseTiming";
import AddExpenseModal from "@/components/AddExpenseModal";
import TripNavBar from "@/components/TripNavBar";
import { DateField } from "@/components/DateTimeFields";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";
import HomeButton from "@/components/HomeButton";

type ExpenseWithAllocations = Expense & { allocations: Allocation[] };

export default function MoneyScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const [currencies, setCurrencies] = useState<TripCurrency[]>([]);
  const [parties, setParties] = useState<TripParty[]>([]);
  const [expenses, setExpenses] = useState<ExpenseWithAllocations[]>([]);
  const [tripStartDate, setTripStartDate] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editExpenseId, setEditExpenseId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<ExpenseType[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    const { data: trip } = await supabase.from("trips").select("start_date").eq("id", tripId).single();
    if (trip) setTripStartDate(trip.start_date);
    const { data: c } = await supabase.from("trip_currencies").select("*").eq("trip_id", tripId);
    if (c) setCurrencies(c as TripCurrency[]);
    const { data: p } = await supabase.from("trip_parties").select("*").eq("trip_id", tripId);
    if (p) setParties(p as TripParty[]);
    const { data: e } = await supabase
      .from("expenses").select("*, allocations(*)").eq("trip_id", tripId)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });
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

  function toggleTypeFilter(t: ExpenseType) {
    setTypeFilter((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  const filtersActive = typeFilter.length > 0 || !!dateFrom || !!dateTo;
  function clearFilters() {
    setTypeFilter([]);
    setDateFrom("");
    setDateTo("");
  }

  const filteredExpenses = expenses.filter((e) => {
    if (typeFilter.length > 0 && !typeFilter.includes(e.type)) return false;
    if (dateFrom || dateTo) {
      if (!e.expense_date) return false;
      if (dateFrom && e.expense_date < dateFrom) return false;
      if (dateTo && e.expense_date > dateTo) return false;
    }
    return true;
  });

  const totalNis = filteredExpenses.reduce((sum, e) => sum + toNis(e.amount, e.currency_code), 0);

  const owedByParty: Record<string, number> = {};
  for (const e of filteredExpenses) {
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
      <Stack.Screen options={{
        title: "Money",
        headerRight: () => (
          <View style={{ marginRight: 14 }}>
            <HomeButton />
          </View>
        ),
      }} />
      <TripNavBar tripId={tripId} active="money" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 90 }}>
        <View style={styles.summaryCard}>
          <Text style={styles.totalLabel}>Total spent (NIS)</Text>
          <Text style={styles.totalAmt}>{"\u20aa"} {totalNis.toFixed(0)}</Text>
          {Object.entries(owedByParty).map(([partyId, amt]) => (
            <View key={partyId} style={styles.owedRow}>
              <Text style={styles.owedLabel}>Owed by {partyName(partyId)}</Text>
              <Text style={styles.owedAmt}>{"\u20aa"} {amt.toFixed(0)}</Text>
            </View>
          ))}
        </View>

        <Pressable style={styles.reportRow} onPress={() => router.push(`/trip/${tripId}/report`)}>
          <Text style={styles.reportLabel}>View expense report</Text>
          <Text style={styles.reportArrow}>{"\u2192"}</Text>
        </Pressable>

        <View style={styles.filterCard}>
          <Text style={styles.label}>Type</Text>
          <View style={styles.chipRow}>
            {EXPENSE_TYPES.map((t) => (
              <Pressable key={t} style={[styles.chip, typeFilter.includes(t) && styles.chipActive]} onPress={() => toggleTypeFilter(t)}>
                <Text style={[styles.chipText, typeFilter.includes(t) && styles.chipTextActive]}>{EXPENSE_TYPE_LABELS[t]}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.dateFilterRow}>
            <View style={{ flex: 1 }}>
              <DateField label="From" value={dateFrom} onChange={setDateFrom} />
            </View>
            <View style={{ width: 10 }} />
            <View style={{ flex: 1 }}>
              <DateField label="To" value={dateTo} onChange={setDateTo} />
            </View>
          </View>
          {filtersActive && (
            <Pressable onPress={clearFilters}>
              <Text style={styles.clearFiltersText}>Clear filters</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.sectionLabel}>
          Expenses{filtersActive ? ` (${filteredExpenses.length} of ${expenses.length})` : ""}
        </Text>
        {filteredExpenses.map((e) => {
          const isSplit = (e.allocations?.length ?? 0) > 1;
          return (
            <Pressable
              key={e.id}
              style={styles.expenseRow}
              onPress={() => setEditExpenseId(e.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.expenseDesc}>{e.note || "Expense"}</Text>
                <Text style={styles.expenseTag}>
                  {EXPENSE_TYPE_LABELS[e.type] ?? "Other"}{" \u00b7 "}{formatDateDDMMYYYY(e.expense_date)}
                  {tripStartDate && classifyExpenseTiming(e.expense_date, tripStartDate) === "pre-trip" ? " \u00b7 pre-trip" : ""}
                  {isSplit ? " \u00b7 split" : ""}{e.item_id ? " \u00b7 linked to item" : ""}
                </Text>
                {!!e.refund_amount && (
                  <Text style={styles.refundTag}>
                    {"\u21a9"} Refund {e.refund_amount} {e.currency_code}{e.refund_company ? ` \u00b7 ${e.refund_company}` : ""}
                  </Text>
                )}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.expenseAmt}>{e.amount} {e.currency_code}</Text>
                {e.currency_code !== "NIS" && (
                  <Text style={styles.expenseNis}>{"\u2248"} {toNis(e.amount, e.currency_code).toFixed(0)} NIS</Text>
                )}
              </View>
            </Pressable>
          );
        })}
        {filteredExpenses.length === 0 && (
          <Text style={styles.empty}>{filtersActive ? "No expenses match these filters." : "No expenses yet."}</Text>
        )}
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

      <AddExpenseModal
        visible={!!editExpenseId}
        onClose={() => setEditExpenseId(null)}
        onSaved={() => { setEditExpenseId(null); load(); }}
        tripId={tripId}
        currencies={currencies}
        parties={parties}
        expenseId={editExpenseId ?? undefined}
      />
    </View>
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
  reportRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 14, marginBottom: 14,
  },
  reportLabel: { color: colors.ink, fontWeight: "700", fontSize: 13 },
  reportArrow: { color: colors.inkSoft, fontSize: 14 },
  filterCard: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 14, marginBottom: 14,
  },
  label: { color: colors.inkSoft, fontSize: 11, fontWeight: "600", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  chipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { color: colors.inkSoft, fontWeight: "600", fontSize: 12 },
  chipTextActive: { color: "#fff" },
  dateFilterRow: { flexDirection: "row", marginTop: 12 },
  clearFiltersText: { color: colors.coral, fontWeight: "700", fontSize: 12, marginTop: 12 },
  expenseRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginBottom: 6,
  },
  expenseDesc: { color: colors.ink, fontWeight: "600", fontSize: 13 },
  expenseTag: { color: colors.inkSoft, fontSize: 11, marginTop: 2 },
  refundTag: { color: colors.teal, fontSize: 11, marginTop: 2, fontWeight: "600" },
  expenseAmt: { fontFamily: "IBMPlexMono_500Medium", color: colors.ink, fontWeight: "600", fontSize: 13 },
  expenseNis: { color: colors.inkSoft, fontSize: 10 },
  empty: { textAlign: "center", color: colors.inkSoft, marginTop: 20 },
  fab: {
    position: "absolute", bottom: 20, alignSelf: "center",
    backgroundColor: colors.ink, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 24,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  fabText: { color: colors.paper, fontWeight: "700" },
});
