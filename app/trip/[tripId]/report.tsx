import { useCallback, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, Stack, useFocusEffect, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { radius, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import { TripCurrency, TripParty, Expense, Allocation, ExpenseType } from "@/lib/types";
import { EXPENSE_TYPES, EXPENSE_TYPE_LABELS } from "@/lib/expenseType";
import { classifyExpenseTiming, ExpenseTiming } from "@/lib/expenseTiming";
import { fetchTripPayments } from "@/lib/settlement";
import TripScreenHeader from "@/components/TripScreenHeader";
import TripTabBar from "@/components/TripTabBar";
import { useTripHamburgerMenu } from "@/components/useTripHamburgerMenu";
import { useNetworkStatus } from "@/lib/useNetworkStatus";
import OfflineBanner from "@/components/OfflineBanner";

type ExpenseWithAllocations = Expense & { allocations: Allocation[] };

function Bar({ label, value, maxValue, color }: { label: string; value: number; maxValue: number; color: string }) {
  const pct = maxValue > 0 ? Math.max(2, (value / maxValue) * 100) : 0;
  const colors = useThemeColors();
  const barStyles = useMemo(() => makeBarStyles(colors), [colors]);
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

const makeBarStyles = (colors: ColorTokens) => StyleSheet.create({
  row: { marginBottom: 12 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  label: { color: colors.ink, fontWeight: "600", fontSize: 13 },
  value: { fontFamily: "JetBrainsMono_600SemiBold", color: colors.inkSoft, fontSize: 12 },
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
  paidByParty: Record<string, number>;
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
  const payments = await fetchTripPayments(tripId);

  const paidByParty: Record<string, number> = {};
  for (const payment of payments) {
    paidByParty[payment.party_id] = (paidByParty[payment.party_id] ?? 0) + payment.amount_nis;
  }

  return {
    tripStartDate: trip?.start_date ?? null,
    currencies: (c ?? []) as TripCurrency[],
    parties: (p ?? []) as TripParty[],
    expenses: (e ?? []) as ExpenseWithAllocations[],
    paidByParty,
  };
}

export default function ExpenseReport() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const { menuItems, shareModal } = useTripHamburgerMenu(tripId);
  const isOnline = useNetworkStatus();

  const { data, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["report", tripId],
    queryFn: () => fetchReportData(tripId),
  });
  const tripStartDate = data?.tripStartDate ?? null;
  const currencies = data?.currencies ?? [];
  const parties = data?.parties ?? [];
  const expenses = data?.expenses ?? [];
  const paidByParty = data?.paidByParty ?? {};

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
  for (const e of expenses) {
    for (const a of e.allocations ?? []) {
      if (!a.party_id) continue;
      owedByParty[a.party_id] = (owedByParty[a.party_id] ?? 0) + toNis(a.amount, e.currency_code);
    }
  }
  // "Owed to me" shows what's still outstanding (owed minus payments already
  // recorded — see lib/settlement.ts), not the raw original allocation, so a
  // party who's paid back in full stops looking like they still owe forever.
  // myNetSpendNis stays keyed off the raw total, though — a debt eventually
  // getting collected doesn't change what the trip actually cost overall.
  const outstandingByParty: Record<string, number> = {};
  for (const partyId of Object.keys(owedByParty)) {
    outstandingByParty[partyId] = Math.max(0, owedByParty[partyId] - (paidByParty[partyId] ?? 0));
  }
  const maxOwedValue = Math.max(0, ...Object.values(outstandingByParty));
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

  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <TripScreenHeader
        title="Expense report"
        tripId={tripId}
        menuItems={menuItems}
        onBack={() => (router.canGoBack() ? router.back() : router.push(`/trip/${tripId}/money`))}
      />
      {shareModal}
      <OfflineBanner dataUpdatedAt={!isOnline ? dataUpdatedAt : undefined} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 90 }}>
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
          <Bar label="In-trip" value={totalsByTiming["in-trip"]} maxValue={maxTimingValue} color={colors.lightBlue} />
        </View>

        <Text style={styles.sectionLabel}>Owed to me</Text>
        <View style={styles.card}>
          {Object.keys(owedByParty).length === 0 && <Text style={styles.empty}>Nobody owes you money on this trip.</Text>}
          {Object.entries(owedByParty).map(([partyId, amt]) => (
            <Pressable key={partyId} onPress={() => router.push(`/trip/${tripId}/settlement/${partyId}`)}>
              {outstandingByParty[partyId] > 0 ? (
                <Bar label={partyName(partyId)} value={outstandingByParty[partyId]} maxValue={maxOwedValue} color={colors.coral} />
              ) : (
                <View style={styles.settledRow}>
                  <Text style={styles.settledLabel}>{partyName(partyId)}</Text>
                  <Text style={styles.settledBadge}>Settled ✓</Text>
                </View>
              )}
            </Pressable>
          ))}
          {Object.keys(owedByParty).length > 0 && <Text style={styles.hint}>Tap a person to record a payment or see the itemized list.</Text>}
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

      <TripTabBar tripId={tripId} active="expenses" />
    </View>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  summaryCard: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: 18, marginBottom: 14 },
  totalLabel: { fontFamily: "JetBrainsMono_600SemiBold", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: colors.amberSoft },
  totalAmt: { fontFamily: "Poppins_700Bold" as any, fontWeight: "800", fontSize: 32, color: colors.paper, marginVertical: 4 },
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
  netAmt: { fontFamily: "JetBrainsMono_600SemiBold", color: colors.ink, fontWeight: "800", fontSize: 16 },
  settledRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 6, marginBottom: 12,
  },
  settledLabel: { color: colors.ink, fontWeight: "600", fontSize: 13 },
  settledBadge: { color: colors.lightBlue, fontWeight: "700", fontSize: 12 },
});
