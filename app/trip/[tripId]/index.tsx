import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Alert } from "@/lib/alert";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { Day, Item, Trip } from "@/lib/types";
import TripNavBar from "@/components/TripNavBar";
import { computeDurationMinutes, formatDuration } from "@/lib/duration";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";
import { normalizeTimeHHMM } from "@/lib/timeFormat";
import { exportTripItineraryPdf } from "@/lib/exportItinerary";
import ShareTripModal from "@/components/ShareTripModal";
import HeaderIconButton from "@/components/HeaderIconButton";
import HomeButton from "@/components/HomeButton";
import { useNetworkStatus } from "@/lib/useNetworkStatus";
import OfflineBanner from "@/components/OfflineBanner";

interface OverviewData {
  trip: Trip;
  days: Day[];
  flights: Item[];
  lodgings: Item[];
  totalNis: number | null;
}

async function fetchOverviewData(tripId: string): Promise<OverviewData | null> {
  const { data: trip, error: tripError } = await supabase.from("trips").select("*").eq("id", tripId).single();
  if (tripError) throw tripError;
  if (!trip) return null;

  const { data: days, error: daysError } = await supabase.from("days").select("*").eq("trip_id", tripId).order("sort_order");
  if (daysError) throw daysError;
  const { data: flights, error: flightsError } = await supabase
    .from("items").select("*").eq("trip_id", tripId).eq("type", "flight").is("deleted_at", null).order("start_date");
  if (flightsError) throw flightsError;
  const { data: lodgings, error: lodgingsError } = await supabase
    .from("items").select("*").eq("trip_id", tripId).eq("is_stay_span", true).is("deleted_at", null).order("start_date");
  if (lodgingsError) throw lodgingsError;

  const { data: currencies, error: currenciesError } = await supabase.from("trip_currencies").select("*").eq("trip_id", tripId);
  if (currenciesError) throw currenciesError;
  const { data: expenses, error: expensesError } = await supabase.from("expenses").select("amount, currency_code").eq("trip_id", tripId);
  if (expensesError) throw expensesError;
  const totalNis = currencies && expenses
    ? expenses.reduce((sum, e) => {
        const rate = currencies.find((c) => c.code === e.currency_code)?.rate_to_nis ?? 1;
        return sum + e.amount * rate;
      }, 0)
    : null;

  return {
    trip: trip as Trip,
    days: (days ?? []) as Day[],
    flights: (flights ?? []) as Item[],
    lodgings: (lodgings ?? []) as Item[],
    totalNis,
  };
}

export default function TripOverview() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const isOnline = useNetworkStatus();
  const [exporting, setExporting] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const router = useRouter();

  const { data, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["tripOverview", tripId],
    queryFn: () => fetchOverviewData(tripId),
  });
  const trip = data?.trip ?? null;
  const days = data?.days ?? [];
  const flights = data?.flights ?? [];
  const lodgings = data?.lodgings ?? [];
  const totalNis = data?.totalNis ?? null;

  useEffect(() => {
    if (!trip) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setIsOwner(data.user.id === trip.user_id);
    });
  }, [trip?.user_id]);

  async function handleExportPdf() {
    setExporting(true);
    try {
      await exportTripItineraryPdf(tripId);
    } catch (e: any) {
      Alert.alert("Export failed", e.message ?? "Unknown error");
    }
    setExporting(false);
  }

  // Re-fetch every time this screen regains focus (e.g. navigating back
  // after adding an expense on an item page) — a plain useEffect only runs
  // once on mount/param-change, so the Money total would otherwise go stale
  // until the next full reload.
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  if (!trip) return null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: "Overview",
        headerRight: () => (
          <View style={styles.headerButtons}>
            <HeaderIconButton onPress={handleExportPdf} disabled={exporting} accessibilityLabel="Export PDF">
              {exporting
                ? <ActivityIndicator size="small" color={colors.teal} />
                : <Ionicons name="document-text-outline" size={16} color={colors.teal} />}
            </HeaderIconButton>
            {isOwner && (
              <HeaderIconButton onPress={() => setShareOpen(true)} accessibilityLabel="Share trip">
                <Ionicons name="people-outline" size={16} color={colors.teal} />
              </HeaderIconButton>
            )}
            <HeaderIconButton onPress={() => router.push(`/trip/${tripId}/edit`)}>
              <Ionicons name="pencil" size={16} color={colors.amber} />
            </HeaderIconButton>
            <HomeButton />
          </View>
        ),
      }} />
      <TripNavBar tripId={tripId} active="overview" />
      <OfflineBanner dataUpdatedAt={!isOnline ? dataUpdatedAt : undefined} />
      <ShareTripModal visible={shareOpen} onClose={() => setShareOpen(false)} tripId={tripId} />
      <FlatList
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Text style={styles.tripName}>{trip.name}</Text>
              <Text style={styles.tripDates}>{formatDateDDMMYYYY(trip.start_date)} - {formatDateDDMMYYYY(trip.end_date)}</Text>
              {trip.destinations.length > 0 && (
                <Text style={styles.destinations}>{trip.destinations.join(" \u00b7 ")}</Text>
              )}
            </View>

            <Pressable style={styles.moneyRow} onPress={() => router.push(`/trip/${tripId}/money`)}>
              <Text style={styles.moneyLabel}>Money</Text>
              <Text style={styles.moneyAmt}>
                {totalNis === null ? "\u2014" : `\u20aa ${totalNis.toFixed(0)}`}
              </Text>
            </Pressable>
            <Pressable style={styles.shoppingRow} onPress={() => router.push(`/trip/${tripId}/shopping`)}>
              <Text style={styles.shoppingLabel}>Shopping list</Text>
              <Text style={styles.shoppingArrow}>{"\u2192"}</Text>
            </Pressable>
            <Pressable style={styles.shoppingRow} onPress={() => router.push(`/trip/${tripId}/map`)}>
              <Text style={styles.shoppingLabel}>Map</Text>
              <Text style={styles.shoppingArrow}>{"\u2192"}</Text>
            </Pressable>

            {flights.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Flights</Text>
                {flights.map((f) => {
                  const flightNumber = (f.custom_fields as any)?.flight_number as string | undefined;
                  const durationMinutes = computeDurationMinutes(f.start_date, f.time_start, f.end_date, f.time_end);
                  const durationText = durationMinutes !== null && durationMinutes >= 0 ? formatDuration(durationMinutes) : null;
                  const arrivesNextDay = !!(f.start_date && f.end_date && f.end_date !== f.start_date);
                  return (
                    <Pressable key={f.id} style={styles.flightRow} onPress={() => router.push(`/item/${f.id}`)}>
                      <View style={styles.flightTimeCol}>
                        <Text style={styles.flightTimeText}>{normalizeTimeHHMM(f.time_start) || "\u2014"}</Text>
                        <Text style={styles.flightArrow}>{"\u2193"}</Text>
                        <Text style={styles.flightTimeText}>
                          {normalizeTimeHHMM(f.time_end) || "\u2014"}{arrivesNextDay ? " +1" : ""}
                        </Text>
                        <Text style={styles.flightDateText}>{formatDateDDMMYYYY(f.start_date)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.highlightTitle}>{f.title}</Text>
                        <Text style={styles.highlightMeta}>
                          {[f.vendor, flightNumber, durationText].filter(Boolean).join(" \u00b7 ") || "No airline set"}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </>
            )}

            {lodgings.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Lodging</Text>
                {lodgings.map((l) => (
                  <Pressable key={l.id} style={styles.flightRow} onPress={() => router.push(`/item/${l.id}`)}>
                    <View style={styles.flightTimeCol}>
                      <Text style={styles.flightTimeText}>{normalizeTimeHHMM(l.time_start) || "\u2014"}</Text>
                      <Text style={styles.flightDateText}>{formatDateDDMMYYYY(l.start_date)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.highlightTitle}>{l.title}</Text>
                      <Text style={styles.highlightMeta}>Until {formatDateDDMMYYYY(l.end_date)}</Text>
                    </View>
                  </Pressable>
                ))}
              </>
            )}

            <Text style={styles.sectionLabel}>Days</Text>
          </>
        }
        data={days}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.dayRow}
            onPress={() => router.push(`/trip/${tripId}/day/${item.date === null ? "proposals" : item.date}`)}
          >
            {item.date === null ? (
              <Text style={styles.date}>Proposals</Text>
            ) : (
              <>
                <Text style={styles.date}>{formatDateDDMMYYYY(item.date)}</Text>
                {item.theme ? <Text style={styles.theme}>{item.theme}</Text> : <Text style={styles.themeEmpty}>No title</Text>}
              </>
            )}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  headerButtons: { flexDirection: "row", alignItems: "center", gap: 8, marginRight: 14 },
  header: { marginBottom: 8 },
  tripName: { fontFamily: "Archivo_700Bold" as any, fontWeight: "800", fontSize: 22, color: colors.ink },
  tripDates: { color: colors.inkSoft, fontSize: 13, marginTop: 2 },
  destinations: { color: colors.teal, fontSize: 12, marginTop: 4, fontWeight: "600" },
  moneyRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, marginTop: 14,
  },
  moneyLabel: { color: colors.amberSoft, fontWeight: "700", fontSize: 13 },
  moneyAmt: { color: colors.paper, fontWeight: "800", fontSize: 16, fontFamily: "IBMPlexMono_500Medium" },
  shoppingRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 14, marginTop: 8,
  },
  shoppingLabel: { color: colors.ink, fontWeight: "700", fontSize: 13 },
  shoppingArrow: { color: colors.inkSoft, fontSize: 14 },
  sectionLabel: {
    color: colors.inkSoft, fontWeight: "700", fontSize: 12,
    textTransform: "uppercase", letterSpacing: 1, marginTop: 18, marginBottom: 8,
  },
  highlightRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, marginBottom: 6,
  },
  flightRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, marginBottom: 6, overflow: "hidden",
  },
  flightTimeCol: {
    width: 78, alignSelf: "stretch", backgroundColor: colors.ink,
    alignItems: "center", justifyContent: "center", paddingVertical: 10,
  },
  flightTimeText: { fontFamily: "IBMPlexMono_500Medium", color: colors.paper, fontWeight: "700", fontSize: 13 },
  flightArrow: { color: colors.amberSoft, fontSize: 10, marginVertical: 1 },
  flightDateText: { fontFamily: "IBMPlexMono_500Medium", color: colors.amberSoft, fontSize: 9, marginTop: 2 },
  highlightMono: { fontFamily: "IBMPlexMono_500Medium", color: colors.ink, fontWeight: "600", fontSize: 13 },
  highlightTitle: { color: colors.ink, fontWeight: "600", fontSize: 13, paddingLeft: 12, paddingTop: 10 },
  highlightMeta: { color: colors.inkSoft, fontSize: 11, paddingLeft: 12, paddingBottom: 10, paddingTop: 2 },
  dayRow: {
    backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 14, marginBottom: 8,
  },
  date: { fontFamily: "IBMPlexMono_500Medium", color: colors.ink, fontWeight: "600" },
  theme: { color: colors.teal, fontSize: 12, marginTop: 2, fontWeight: "600" },
  themeEmpty: { color: colors.inkSoft, fontSize: 11, marginTop: 2, fontStyle: "italic" },
});
