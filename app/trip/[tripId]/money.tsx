import { useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from "react-native";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { colors, radius, fonts } from "@/lib/theme";
import { TripCurrency, TripParty, Expense, Allocation, ExpenseType, Trip } from "@/lib/types";
import { EXPENSE_TYPES, EXPENSE_TYPE_LABELS } from "@/lib/expenseType";
import { classifyExpenseTiming } from "@/lib/expenseTiming";
import { computeBudgetProgress } from "@/lib/budget";
import BudgetProgressBar from "@/components/BudgetProgressBar";
import SetBudgetModal from "@/components/SetBudgetModal";
import AddExpenseModal from "@/components/AddExpenseModal";
import AddShoppingItemModal from "@/components/AddShoppingItemModal";
import TripScreenHeader from "@/components/TripScreenHeader";
import TripTabBar from "@/components/TripTabBar";
import { useTripHamburgerMenu } from "@/components/useTripHamburgerMenu";
import Checkbox from "@/components/Checkbox";
import Icon from "@/components/icons/Icon";
import { DateField } from "@/components/DateTimeFields";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";
import { useNetworkStatus } from "@/lib/useNetworkStatus";
import OfflineBanner from "@/components/OfflineBanner";
import { Alert } from "@/lib/alert";

type Tab = "expenses" | "shopping";

type ExpenseWithAllocations = Expense & { allocations: Allocation[] };

interface MoneyData {
  trip: Pick<Trip, "start_date" | "end_date" | "budget_amount"> | null;
  currencies: TripCurrency[];
  parties: TripParty[];
  expenses: ExpenseWithAllocations[];
}

async function fetchMoneyData(tripId: string): Promise<MoneyData> {
  const { data: trip, error: tripError } = await supabase.from("trips").select("start_date, end_date, budget_amount").eq("id", tripId).single();
  if (tripError) throw tripError;
  const { data: c, error: currenciesError } = await supabase.from("trip_currencies").select("*").eq("trip_id", tripId);
  if (currenciesError) throw currenciesError;
  const { data: p, error: partiesError } = await supabase.from("trip_parties").select("*").eq("trip_id", tripId);
  if (partiesError) throw partiesError;
  const { data: e, error: expensesError } = await supabase
    .from("expenses").select("*, allocations(*)").eq("trip_id", tripId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (expensesError) throw expensesError;

  return {
    trip: trip ?? null,
    currencies: (c ?? []) as TripCurrency[],
    parties: (p ?? []) as TripParty[],
    expenses: (e ?? []) as ExpenseWithAllocations[],
  };
}

interface AllocationInfo {
  id: string;
  amount: number;
  party_id: string | null;
  expense_id: string;
  expenses: { currency_code: string; note: string | null; expense_date: string | null } | null;
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

async function fetchShoppingData(tripId: string): Promise<ShoppingRow[]> {
  const { data, error } = await supabase
    .from("shopping_list_items")
    .select("*, items(title), allocations(id, amount, party_id, expense_id, expenses(currency_code, note, expense_date))")
    .eq("trip_id", tripId)
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as ShoppingRow[];
}

export default function MoneyShoppingScreen() {
  const { tripId, tab } = useLocalSearchParams<{ tripId: string; tab?: string }>();
  const router = useRouter();
  const isOnline = useNetworkStatus();
  const [activeTab, setActiveTab] = useState<Tab>(tab === "shopping" ? "shopping" : "expenses");
  const { menuItems, shareModal } = useTripHamburgerMenu(tripId);

  const [formOpen, setFormOpen] = useState(false);
  const [editExpenseId, setEditExpenseId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<ExpenseType[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [addFormOpen, setAddFormOpen] = useState(false);
  const [editRowId, setEditRowId] = useState<string | null>(null);
  const [expenseTarget, setExpenseTarget] = useState<ShoppingRow | null>(null);
  const [relatedExpensesTarget, setRelatedExpensesTarget] = useState<ShoppingRow | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);

  const { data, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["money", tripId],
    queryFn: () => fetchMoneyData(tripId),
  });
  const trip = data?.trip ?? null;
  const tripStartDate = trip?.start_date ?? null;
  const currencies = data?.currencies ?? [];
  const parties = data?.parties ?? [];
  const expenses = data?.expenses ?? [];

  const { data: shoppingRows, refetch: refetchShopping } = useQuery({
    queryKey: ["shopping", tripId],
    queryFn: () => fetchShoppingData(tripId),
  });
  const rows = shoppingRows ?? [];

  useFocusEffect(useCallback(() => { refetch(); refetchShopping(); }, [refetch, refetchShopping]));

  function requireOnline(): boolean {
    if (isOnline) return true;
    Alert.alert("You're offline", "Connect to the internet to make changes.");
    return false;
  }

  function rateFor(code: string) {
    return currencies.find((c) => c.code === code)?.rate_to_nis ?? 1;
  }

  async function saveBudget(amount: number) {
    await supabase.from("trips").update({ budget_amount: amount }).eq("id", tripId);
    setBudgetOpen(false);
    refetch();
  }
  function toNis(amount: number, code: string) {
    return amount * rateFor(code);
  }

  const budgetProgress = trip ? computeBudgetProgress(trip, expenses, rateFor) : null;

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

  const general = rows.filter((r) => !r.item_id);
  const byActivity = new Map<string, ShoppingRow[]>();
  for (const r of rows) {
    if (!r.item_id) continue;
    const key = r.items?.title ?? "Linked item";
    byActivity.set(key, [...(byActivity.get(key) ?? []), r]);
  }

  function handleRowTap(row: ShoppingRow) {
    if (row.allocations.length === 0) { setExpenseTarget(row); return; }
    const distinctExpenseIds = [...new Set(row.allocations.map((a) => a.expense_id))];
    if (distinctExpenseIds.length === 1) setEditExpenseId(distinctExpenseIds[0]);
    else setRelatedExpensesTarget(row);
  }

  function renderShoppingRow(row: ShoppingRow) {
    const bought = row.allocations.length > 0;
    return (
      <View key={row.id} style={styles.row}>
        <Pressable style={styles.rowMain} onPress={() => handleRowTap(row)}>
          <Checkbox checked={bought} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, bought && styles.nameBought]}>
              {row.name}{row.quantity > 1 ? ` ×${row.quantity}` : ""}
            </Text>
            {row.note && <Text style={styles.note}>{row.note}</Text>}
          </View>
          {bought && (
            <View style={{ alignItems: "flex-end" }}>
              {row.allocations.map((a) => (
                <Text key={a.id} style={styles.paid}>
                  {a.amount} {a.expenses?.currency_code ?? ""}
                  {a.party_id ? ` · ${partyName(a.party_id)}` : ""}
                </Text>
              ))}
            </View>
          )}
        </Pressable>
        <Pressable style={styles.editBtn} onPress={() => setEditRowId(row.id)}>
          <Icon name="edit" size={16} color={colors.blue} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      {shareModal}

      <TripScreenHeader
        tripId={tripId}
        title="Expenses"
        menuItems={menuItems}
        left={
          <View style={styles.segTabs}>
            <Pressable style={[styles.seg, activeTab === "expenses" && styles.segOn]} onPress={() => setActiveTab("expenses")}>
              <Text style={[styles.segText, activeTab === "expenses" && styles.segTextOn]}>Expenses</Text>
            </Pressable>
            <Pressable style={[styles.seg, activeTab === "shopping" && styles.segOn]} onPress={() => setActiveTab("shopping")}>
              <Text style={[styles.segText, activeTab === "shopping" && styles.segTextOn]}>Shopping</Text>
            </Pressable>
          </View>
        }
      />
      <OfflineBanner dataUpdatedAt={!isOnline ? dataUpdatedAt : undefined} />

      {activeTab === "expenses" ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 90 }}>
          <View style={styles.summaryCard}>
            <Text style={styles.totalLabel}>Total spent (NIS)</Text>
            <Text style={styles.totalAmt}>{"₪"} {totalNis.toFixed(0)}</Text>
            {Object.entries(owedByParty).map(([partyId, amt]) => (
              <View key={partyId} style={styles.owedRow}>
                <Text style={styles.owedLabel}>Owed by {partyName(partyId)}</Text>
                <Text style={styles.owedAmt}>{"₪"} {amt.toFixed(0)}</Text>
              </View>
            ))}
          </View>

          {budgetProgress ? (
            <BudgetProgressBar progress={budgetProgress} />
          ) : (
            <Pressable style={styles.noBudgetCard} onPress={() => { if (requireOnline()) setBudgetOpen(true); }}>
              <Text style={styles.noBudgetText}>No budget defined — tap to set one</Text>
            </Pressable>
          )}

          <Pressable style={styles.reportRow} onPress={() => router.push(`/trip/${tripId}/report`)}>
            <Text style={styles.reportLabel}>View expense report</Text>
            <Text style={styles.reportArrow}>{"→"}</Text>
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
              <Pressable key={e.id} style={styles.expenseRow} onPress={() => setEditExpenseId(e.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.expenseDesc}>{e.note || "Expense"}</Text>
                  <Text style={styles.expenseTag}>
                    {EXPENSE_TYPE_LABELS[e.type] ?? "Other"}{" · "}{formatDateDDMMYYYY(e.expense_date)}
                    {tripStartDate && classifyExpenseTiming(e.expense_date, tripStartDate) === "pre-trip" ? " · pre-trip" : ""}
                    {isSplit ? " · split" : ""}{e.item_id ? " · linked to item" : ""}
                  </Text>
                  {!!e.refund_amount && (
                    <Text style={styles.refundTag}>
                      {"↩"} Refund {e.refund_amount} {e.currency_code}{e.refund_company ? ` · ${e.refund_company}` : ""}
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.expenseAmt}>{e.amount} {e.currency_code}</Text>
                  {e.currency_code !== "NIS" && (
                    <Text style={styles.expenseNis}>{"≈"} {toNis(e.amount, e.currency_code).toFixed(0)} NIS</Text>
                  )}
                </View>
              </Pressable>
            );
          })}
          {filteredExpenses.length === 0 && (
            <Text style={styles.empty}>{filtersActive ? "No expenses match these filters." : "No expenses yet."}</Text>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 90 }}>
          {general.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>General</Text>
              {general.map(renderShoppingRow)}
            </>
          )}
          {[...byActivity.entries()].map(([activityTitle, items]) => (
            <View key={activityTitle}>
              <Text style={styles.sectionLabel}>{activityTitle}</Text>
              {items.map(renderShoppingRow)}
            </View>
          ))}
          {rows.length === 0 && <Text style={styles.empty}>Nothing on the list yet.</Text>}
          <Text style={styles.hint}>Tap an unbought item to record what you paid for it, or a bought item to view its expense.</Text>
        </ScrollView>
      )}

      <Pressable
        style={styles.fab}
        onPress={() => {
          if (!requireOnline()) return;
          if (activeTab === "expenses") setFormOpen(true);
          else setAddFormOpen(true);
        }}
      >
        <Icon name="add" size={24} color="#fff" />
      </Pressable>

      <AddExpenseModal
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); refetch(); }}
        tripId={tripId}
        currencies={currencies}
        parties={parties}
      />
      <AddExpenseModal
        visible={!!editExpenseId}
        onClose={() => setEditExpenseId(null)}
        onSaved={() => { setEditExpenseId(null); refetch(); refetchShopping(); }}
        tripId={tripId}
        currencies={currencies}
        parties={parties}
        expenseId={editExpenseId ?? undefined}
      />

      <AddShoppingItemModal
        visible={addFormOpen}
        onClose={() => setAddFormOpen(false)}
        onSaved={() => { setAddFormOpen(false); refetchShopping(); }}
        tripId={tripId}
      />
      <AddShoppingItemModal
        visible={!!editRowId}
        onClose={() => setEditRowId(null)}
        onSaved={() => { setEditRowId(null); refetchShopping(); }}
        tripId={tripId}
        editId={editRowId ?? undefined}
      />
      {expenseTarget && (
        <AddExpenseModal
          visible={!!expenseTarget}
          onClose={() => setExpenseTarget(null)}
          onSaved={() => { setExpenseTarget(null); refetch(); refetchShopping(); }}
          tripId={tripId}
          currencies={currencies}
          parties={parties}
          presetShoppingItemId={expenseTarget.id}
        />
      )}

      <Modal visible={!!relatedExpensesTarget} transparent animationType="fade" onRequestClose={() => setRelatedExpensesTarget(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setRelatedExpensesTarget(null)}>
          <Pressable style={styles.relatedCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.relatedTitle}>Related expenses</Text>
            {relatedExpensesTarget &&
              [...new Map(relatedExpensesTarget.allocations.map((a) => [a.expense_id, a])).values()].map((a) => (
                <Pressable
                  key={a.expense_id}
                  style={styles.relatedRow}
                  onPress={() => { setEditExpenseId(a.expense_id); setRelatedExpensesTarget(null); }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.relatedNote}>{a.expenses?.note || "Expense"}</Text>
                    {a.expenses?.expense_date && <Text style={styles.relatedDate}>{formatDateDDMMYYYY(a.expenses.expense_date)}</Text>}
                  </View>
                  <Text style={styles.relatedAmt}>{a.amount} {a.expenses?.currency_code ?? ""}</Text>
                </Pressable>
              ))}
          </Pressable>
        </Pressable>
      </Modal>

      <SetBudgetModal
        visible={budgetOpen}
        onClose={() => setBudgetOpen(false)}
        onSave={saveBudget}
        initialAmount={trip?.budget_amount ?? null}
      />

      <TripTabBar tripId={tripId} active="expenses" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  segTabs: { flexDirection: "row", backgroundColor: colors.paper, borderRadius: 999, padding: 3, gap: 2 },
  seg: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: 999 },
  segOn: { backgroundColor: colors.blue },
  segText: { color: colors.inkSoft, fontFamily: fonts.bodyBold, fontSize: 13 },
  segTextOn: { color: "#fff" },

  summaryCard: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: 18, marginBottom: 14 },
  totalLabel: { fontFamily: fonts.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: colors.goldSoft },
  totalAmt: { fontFamily: fonts.display, fontSize: 32, color: colors.paper, marginVertical: 4 },
  owedRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.15)" },
  owedLabel: { color: colors.paper, fontSize: 12 },
  owedAmt: { color: colors.goldSoft, fontFamily: fonts.bodyBold, fontSize: 12 },
  sectionLabel: { color: colors.ink, fontFamily: fonts.display, fontSize: 16, marginBottom: 8 },
  noBudgetCard: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line, borderStyle: "dashed",
    borderRadius: radius.md, padding: 14, marginBottom: 14, alignItems: "center",
  },
  noBudgetText: { color: colors.blue, fontWeight: "700", fontSize: 13 },
  reportRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 14, marginBottom: 14,
  },
  reportLabel: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 13 },
  reportArrow: { color: colors.inkSoft, fontSize: 14 },
  filterCard: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 14, marginBottom: 14,
  },
  label: { color: colors.inkSoft, fontSize: 11, fontFamily: fonts.bodyBold, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  chipActive: { backgroundColor: colors.lightBlue, borderColor: colors.lightBlue },
  chipText: { color: colors.inkSoft, fontFamily: fonts.bodyBold, fontSize: 12 },
  chipTextActive: { color: "#fff" },
  dateFilterRow: { flexDirection: "row", marginTop: 12 },
  clearFiltersText: { color: colors.coral, fontFamily: fonts.bodyBold, fontSize: 12, marginTop: 12 },
  expenseRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginBottom: 6,
  },
  expenseDesc: { color: colors.ink, fontFamily: fonts.bodySemi, fontSize: 13 },
  expenseTag: { color: colors.inkSoft, fontSize: 11, marginTop: 2 },
  refundTag: { color: colors.lightBlue, fontSize: 11, marginTop: 2, fontFamily: fonts.bodyBold },
  expenseAmt: { fontFamily: fonts.mono, color: colors.ink, fontSize: 13 },
  expenseNis: { color: colors.inkSoft, fontSize: 10 },
  empty: { textAlign: "center", color: colors.inkSoft, marginTop: 20 },

  row: { flexDirection: "row", alignItems: "stretch", gap: 6, marginBottom: 6 },
  rowMain: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12,
  },
  name: { color: colors.ink, fontFamily: fonts.bodySemi, fontSize: 14 },
  nameBought: { color: colors.inkSoft, textDecorationLine: "line-through" },
  note: { color: colors.inkSoft, fontSize: 11, marginTop: 2 },
  paid: { fontFamily: fonts.mono, color: colors.lightBlue, fontSize: 11 },
  hint: { color: colors.inkSoft, fontSize: 11, fontStyle: "italic", textAlign: "center", marginTop: 16 },
  editBtn: {
    justifyContent: "center", alignItems: "center", width: 40, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paperRaised,
  },
  fab: {
    position: "absolute", bottom: 74, right: 16, width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.ink, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(11,30,63,0.4)", justifyContent: "center", padding: 24 },
  relatedCard: {
    backgroundColor: colors.paper, borderRadius: radius.lg, padding: 20,
    width: "100%", maxWidth: 420, alignSelf: "center",
  },
  relatedTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginBottom: 12 },
  relatedRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginBottom: 6,
  },
  relatedNote: { color: colors.ink, fontFamily: fonts.bodySemi, fontSize: 13 },
  relatedDate: { color: colors.inkSoft, fontSize: 11, marginTop: 2 },
  relatedAmt: { fontFamily: fonts.mono, color: colors.ink, fontSize: 13 },
});
