import { useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from "react-native";
import { useLocalSearchParams, Stack, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { TripCurrency, TripParty } from "@/lib/types";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";
import AddExpenseModal from "@/components/AddExpenseModal";
import AddShoppingItemModal from "@/components/AddShoppingItemModal";
import TripNavBar from "@/components/TripNavBar";
import HomeButton from "@/components/HomeButton";
import { useNetworkStatus } from "@/lib/useNetworkStatus";
import OfflineBanner from "@/components/OfflineBanner";
import { Alert } from "@/lib/alert";

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

interface ShoppingData {
  rows: ShoppingRow[];
  currencies: TripCurrency[];
  parties: TripParty[];
}

async function fetchShoppingData(tripId: string): Promise<ShoppingData> {
  const { data, error } = await supabase
    .from("shopping_list_items")
    .select("*, items(title), allocations(id, amount, party_id, expense_id, expenses(currency_code, note, expense_date))")
    .eq("trip_id", tripId)
    .order("name");
  if (error) throw error;

  const { data: c, error: currenciesError } = await supabase.from("trip_currencies").select("*").eq("trip_id", tripId);
  if (currenciesError) throw currenciesError;
  const { data: p, error: partiesError } = await supabase.from("trip_parties").select("*").eq("trip_id", tripId);
  if (partiesError) throw partiesError;

  return {
    rows: (data ?? []) as unknown as ShoppingRow[],
    currencies: (c ?? []) as TripCurrency[],
    parties: (p ?? []) as TripParty[],
  };
}

export default function ShoppingScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const isOnline = useNetworkStatus();
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [editRowId, setEditRowId] = useState<string | null>(null);
  const [expenseTarget, setExpenseTarget] = useState<ShoppingRow | null>(null);
  const [editExpenseId, setEditExpenseId] = useState<string | null>(null);
  const [relatedExpensesTarget, setRelatedExpensesTarget] = useState<ShoppingRow | null>(null);

  const { data, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["shopping", tripId],
    queryFn: () => fetchShoppingData(tripId),
  });
  const rows = data?.rows ?? [];
  const currencies = data?.currencies ?? [];
  const parties = data?.parties ?? [];

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  function requireOnline(): boolean {
    if (isOnline) return true;
    Alert.alert("You're offline", "Connect to the internet to make changes.");
    return false;
  }

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

  function handleRowTap(row: ShoppingRow) {
    if (row.allocations.length === 0) { setExpenseTarget(row); return; }
    const distinctExpenseIds = [...new Set(row.allocations.map((a) => a.expense_id))];
    if (distinctExpenseIds.length === 1) setEditExpenseId(distinctExpenseIds[0]);
    else setRelatedExpensesTarget(row);
  }

  function renderRow(row: ShoppingRow) {
    const bought = row.allocations.length > 0;
    return (
      <View key={row.id} style={styles.row}>
        <Pressable
          style={styles.rowMain}
          onPress={() => handleRowTap(row)}
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
        <Pressable style={styles.editBtn} onPress={() => setEditRowId(row.id)}>
          <Text style={styles.editBtnText}>Edit</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: "Shopping List",
        headerRight: () => (
          <View style={{ marginRight: 14 }}>
            <HomeButton />
          </View>
        ),
      }} />
      <TripNavBar tripId={tripId} active="shopping" />
      <OfflineBanner dataUpdatedAt={!isOnline ? dataUpdatedAt : undefined} />
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
        <Text style={styles.hint}>Tap an unbought item to record what you paid for it, or a bought item to view its expense.</Text>
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => { if (requireOnline()) setAddFormOpen(true); }}>
        <Text style={styles.fabText}>+ Add item</Text>
      </Pressable>

      <AddShoppingItemModal
        visible={addFormOpen}
        onClose={() => setAddFormOpen(false)}
        onSaved={() => { setAddFormOpen(false); refetch(); }}
        tripId={tripId}
      />

      <AddShoppingItemModal
        visible={!!editRowId}
        onClose={() => setEditRowId(null)}
        onSaved={() => { setEditRowId(null); refetch(); }}
        tripId={tripId}
        editId={editRowId ?? undefined}
      />

      {expenseTarget && (
        <AddExpenseModal
          visible={!!expenseTarget}
          onClose={() => setExpenseTarget(null)}
          onSaved={() => { setExpenseTarget(null); refetch(); }}
          tripId={tripId}
          currencies={currencies}
          parties={parties}
          presetShoppingItemId={expenseTarget.id}
        />
      )}

      {editExpenseId && (
        <AddExpenseModal
          visible={!!editExpenseId}
          onClose={() => setEditExpenseId(null)}
          onSaved={() => { setEditExpenseId(null); refetch(); }}
          tripId={tripId}
          currencies={currencies}
          parties={parties}
          expenseId={editExpenseId}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  sectionLabel: { color: colors.inkSoft, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginTop: 14, marginBottom: 8 },
  row: {
    flexDirection: "row", alignItems: "stretch", gap: 6, marginBottom: 6,
  },
  rowMain: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12,
  },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: colors.teal },
  checkboxChecked: { backgroundColor: colors.teal },
  name: { color: colors.ink, fontWeight: "600", fontSize: 14 },
  nameBought: { color: colors.inkSoft, textDecorationLine: "line-through" },
  note: { color: colors.inkSoft, fontSize: 11, marginTop: 2 },
  paid: { fontFamily: "IBMPlexMono_500Medium", color: colors.teal, fontSize: 11, fontWeight: "600" },
  empty: { textAlign: "center", color: colors.inkSoft, marginTop: 30 },
  hint: { color: colors.inkSoft, fontSize: 11, fontStyle: "italic", textAlign: "center", marginTop: 16 },
  editBtn: {
    justifyContent: "center", paddingHorizontal: 10, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paperRaised,
  },
  editBtnText: { color: colors.inkSoft, fontWeight: "600", fontSize: 11 },
  fab: {
    position: "absolute", bottom: 20, alignSelf: "center",
    backgroundColor: colors.ink, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 24,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  fabText: { color: colors.paper, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.5)", justifyContent: "center", padding: 24 },
  relatedCard: {
    backgroundColor: colors.paper, borderRadius: radius.lg, padding: 20,
    width: "100%", maxWidth: 420, alignSelf: "center",
  },
  relatedTitle: { fontFamily: "Archivo_700Bold" as any, fontWeight: "800", fontSize: 18, color: colors.ink, marginBottom: 12 },
  relatedRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginBottom: 6,
  },
  relatedNote: { color: colors.ink, fontWeight: "600", fontSize: 13 },
  relatedDate: { color: colors.inkSoft, fontSize: 11, marginTop: 2 },
  relatedAmt: { fontFamily: "IBMPlexMono_500Medium", color: colors.ink, fontWeight: "600", fontSize: 13 },
});
