import { useCallback } from "react";
import { View, Text, FlatList, StyleSheet, Pressable, ImageBackground } from "react-native";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { colors, radius, fonts } from "@/lib/theme";
import { Day, Item, Trip, TripCurrency, Expense, ItemType, tripStatus } from "@/lib/types";
import Icon from "@/components/icons/Icon";
import HamburgerMenu from "@/components/HamburgerMenu";
import TripTabBar from "@/components/TripTabBar";
import { useTripHamburgerMenu } from "@/components/useTripHamburgerMenu";
import { computeDurationMinutes, formatDuration } from "@/lib/duration";
import { formatDateDDMMYYYY, localIsoDate } from "@/lib/dateFormat";
import { normalizeTimeHHMM } from "@/lib/timeFormat";
import { useNetworkStatus } from "@/lib/useNetworkStatus";
import OfflineBanner from "@/components/OfflineBanner";
import WeatherCarousel from "@/components/WeatherCarousel";
import TripCountdown from "@/components/TripCountdown";
import { findLodgingGapDays } from "@/lib/conflicts";
import { categoryForDbType } from "@/lib/itemTypeMeta";
import { computeBudgetProgress } from "@/lib/budget";
import { coverPhotoSource } from "@/lib/destinationPhotos";
import { fetchDestinationForecast } from "@/lib/weather";
import { weatherIconName } from "@/lib/weather";

interface OverviewData {
  trip: Trip;
  days: Day[];
  flights: Item[];
  lodgings: Item[];
  currencies: TripCurrency[];
  expenses: Pick<Expense, "amount" | "currency_code" | "expense_date">[];
  totalNis: number | null;
  todayItems: { id: string; title: string; time_start: string | null; type: ItemType }[];
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
  const { data: expenses, error: expensesError } = await supabase
    .from("expenses").select("amount, currency_code, expense_date").eq("trip_id", tripId);
  if (expensesError) throw expensesError;
  const totalNis = currencies && expenses
    ? expenses.reduce((sum, e) => {
        const rate = currencies.find((c) => c.code === e.currency_code)?.rate_to_nis ?? 1;
        return sum + e.amount * rate;
      }, 0)
    : null;

  // Today section (folded in from the old separate Today screen) — next
  // couple of upcoming items only, not the full day. Only worth computing
  // for a trip that's actually under way.
  let todayItems: OverviewData["todayItems"] = [];
  if (tripStatus(trip as Trip) === "current") {
    const iso = localIsoDate();
    const todayDay = (days ?? []).find((d) => d.date === iso);
    if (todayDay) {
      const { data: items } = await supabase
        .from("items").select("id, title, time_start, type").eq("day_id", todayDay.id).is("deleted_at", null)
        .not("time_start", "is", null).order("time_start");
      const now = new Date();
      todayItems = (items ?? []).filter((it) => {
        const t = normalizeTimeHHMM(it.time_start);
        return t && new Date(`${iso}T${t}:00`).getTime() >= now.getTime();
      }).slice(0, 3);
    }
  }

  return {
    trip: trip as Trip,
    days: (days ?? []) as Day[],
    flights: (flights ?? []) as Item[],
    lodgings: (lodgings ?? []) as Item[],
    currencies: (currencies ?? []) as TripCurrency[],
    expenses: expenses ?? [],
    totalNis,
    todayItems,
  };
}

export default function TripOverview() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const isOnline = useNetworkStatus();
  const insets = useSafeAreaInsets();
  const { menuItems, shareModal } = useTripHamburgerMenu(tripId);
  const router = useRouter();

  const { data, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["tripOverview", tripId],
    queryFn: () => fetchOverviewData(tripId),
  });
  const trip = data?.trip ?? null;
  // Array.isArray, not just `?? []`: guards against a stale persisted
  // react-query cache entry (from before one of these fields existed on
  // this query's shape) rehydrating as something other than an array and
  // crashing render before this screen's own refetch can correct it.
  const days = Array.isArray(data?.days) ? data.days : [];
  const flights = Array.isArray(data?.flights) ? data.flights : [];
  const lodgings = Array.isArray(data?.lodgings) ? data.lodgings : [];
  const totalNis = data?.totalNis ?? null;
  const todayItems = Array.isArray(data?.todayItems) ? data.todayItems : [];
  const overviewExpenses = Array.isArray(data?.expenses) ? data.expenses : [];
  const overviewCurrencies = Array.isArray(data?.currencies) ? data.currencies : [];
  const lodgingGapDays = findLodgingGapDays(days, lodgings);
  const isCurrent = trip ? tripStatus(trip) === "current" : false;

  const { data: heroWeather } = useQuery({
    queryKey: ["overviewHeroWeather", trip?.destinations?.[0]],
    queryFn: () => fetchDestinationForecast(trip!.destinations[0]),
    enabled: !!trip && trip.destinations.length > 0,
  });

  const budgetProgress = trip && data
    ? computeBudgetProgress(trip, overviewExpenses, (code) => overviewCurrencies.find((c) => c.code === code)?.rate_to_nis ?? 1)
    : null;

  // Re-fetch every time this screen regains focus (e.g. navigating back
  // after adding an expense on an item page) — a plain useEffect only runs
  // once on mount/param-change, so the Money total would otherwise go stale
  // until the next full reload.
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  if (!trip) return null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      {shareModal}

      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 8 }}
        ListHeaderComponent={
          <>
            <ImageBackground
              source={coverPhotoSource(trip.cover_photo_id)}
              style={[styles.hero, { minHeight: isCurrent ? 210 : 230 }]}
            >
              <View style={styles.heroScrim} />
              <View style={[styles.headerRow, { top: insets.top + 10 }]}>
                <Pressable style={styles.hbtn} onPress={() => router.canDismiss() ? router.dismissAll() : router.replace("/")} accessibilityLabel="Home">
                  <Icon name="home" size={25} color="#fff" />
                </Pressable>
                <HamburgerMenu items={menuItems} sheetTop={insets.top + 50} />
              </View>
              {heroWeather && heroWeather.days.length > 0 && (
                <View style={[styles.weatherBadge, { top: insets.top + 56 }]}>
                  <Icon name={weatherIconName(heroWeather.days[0].weatherCode)} size={32} color="#fff" />
                  <Text style={styles.weatherTemp}>{Math.round(heroWeather.days[0].tempMax)}°</Text>
                  <Text style={styles.weatherDate}>{formatDateDDMMYYYY(localIsoDate()).slice(0, 5)}</Text>
                </View>
              )}
              <Text style={styles.tripName}>{trip.name}</Text>
              {!isCurrent && <TripCountdown tripId={tripId} fallbackDateIso={trip.start_date} />}
            </ImageBackground>

            <View style={styles.body}>
              <OfflineBanner dataUpdatedAt={!isOnline ? dataUpdatedAt : undefined} />

              <WeatherCarousel tripId={tripId} destinations={trip.destinations} />

              {lodgingGapDays.length > 0 && (
                <View style={styles.gapWarning}>
                  <Text style={styles.gapWarningText}>
                    ⚠ {lodgingGapDays.length} night{lodgingGapDays.length === 1 ? "" : "s"} without lodging booked
                    {" · "}{lodgingGapDays.map((d) => formatDateDDMMYYYY(d)).join(", ")}
                  </Text>
                </View>
              )}

              <Pressable style={styles.budgetBubble} onPress={() => router.push(`/trip/${tripId}/money`)}>
                <View style={styles.budgetIconCirc}><Icon name="budget" size={25} color={colors.blue} /></View>
                <View style={{ flex: 1 }}>
                  <View style={styles.budgetHead}>
                    <Text style={styles.budgetLabel}>Budget</Text>
                    {budgetProgress && <Text style={styles.budgetPct}>{Math.round(budgetProgress.percent)}%</Text>}
                  </View>
                  {budgetProgress ? (
                    <>
                      <View style={styles.budgetTrack}>
                        <View style={[styles.budgetFill, { width: `${Math.min(100, budgetProgress.percent)}%`, backgroundColor: budgetProgress.overBudget ? colors.coral : colors.lightBlue }]} />
                      </View>
                      <Text style={styles.budgetAmt}>₪{budgetProgress.spentTotal.toFixed(0)} of ₪{budgetProgress.budget.toFixed(0)}</Text>
                    </>
                  ) : (
                    <Text style={styles.budgetAmt}>{totalNis === null ? "—" : `₪${totalNis.toFixed(0)} spent · no budget set`}</Text>
                  )}
                </View>
                <Text style={styles.chevron}>{"›"}</Text>
              </Pressable>

              {isCurrent && (
                <>
                  <Text style={styles.sectionLabel}>Today</Text>
                  {todayItems.length > 0 ? (
                    <>
                      <Pressable style={styles.nextCard} onPress={() => router.push(`/item/${todayItems[0].id}`)}>
                        <Icon name={categoryForDbType(todayItems[0].type).icon} size={28} color="#fff" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.nextLabel}>Next</Text>
                          <Text style={styles.nextTitle}>{todayItems[0].title}</Text>
                          {todayItems[0].time_start && <Text style={styles.nextMeta}>{normalizeTimeHHMM(todayItems[0].time_start)}</Text>}
                        </View>
                      </Pressable>
                      {todayItems.slice(1).map((it) => (
                        <Pressable key={it.id} style={styles.itemRow} onPress={() => router.push(`/item/${it.id}`)}>
                          <View style={styles.itemTimeCol}>
                            <Text style={styles.itemTimeText}>{normalizeTimeHHMM(it.time_start) || "—"}</Text>
                          </View>
                          <View style={styles.itemIconCol}>
                            <Icon name={categoryForDbType(it.type).icon} size={28} color="#fff" />
                          </View>
                          <View style={styles.itemBody}>
                            <Text style={styles.itemTitle}>{it.title}</Text>
                          </View>
                        </Pressable>
                      ))}
                    </>
                  ) : (
                    <View style={styles.doneCard}><Text style={styles.doneText}>Nothing left for today.</Text></View>
                  )}
                </>
              )}

              {flights.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Flights</Text>
                  {flights.map((f) => {
                    const flightNumber = (f.custom_fields as any)?.flight_number as string | undefined;
                    const durationMinutes = computeDurationMinutes(f.start_date, f.time_start, f.end_date, f.time_end);
                    const durationText = durationMinutes !== null && durationMinutes >= 0 ? formatDuration(durationMinutes) : null;
                    return (
                      <Pressable key={f.id} style={styles.itemRow} onPress={() => router.push(`/item/${f.id}`)}>
                        <View style={styles.itemIconCol}><Icon name="flight" size={28} color="#fff" /></View>
                        <View style={styles.itemBody}>
                          <Text style={styles.itemCat}>{flightNumber ?? "FLIGHT"}</Text>
                          <Text style={styles.itemTitle}>{f.title}</Text>
                          <Text style={styles.itemSub}>
                            {[normalizeTimeHHMM(f.time_start), formatDateDDMMYYYY(f.start_date), durationText].filter(Boolean).join(" · ")}
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
                    <Pressable key={l.id} style={styles.itemRow} onPress={() => router.push(`/item/${l.id}`)}>
                      <View style={styles.itemIconCol}><Icon name="lodging" size={28} color="#fff" /></View>
                      <View style={styles.itemBody}>
                        <Text style={styles.itemCat}>LODGING</Text>
                        <Text style={styles.itemTitle}>{l.title}</Text>
                        <Text style={styles.itemSub}>{formatDateDDMMYYYY(l.start_date)} – {formatDateDDMMYYYY(l.end_date)}</Text>
                      </View>
                    </Pressable>
                  ))}
                </>
              )}

              <Text style={styles.sectionLabel}>Days</Text>
            </View>
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
                <View style={styles.dateRow}>
                  <Text style={styles.date}>{formatDateDDMMYYYY(item.date)}</Text>
                  {item.date === localIsoDate() && <View style={styles.todayDot} />}
                </View>
                {item.theme ? <Text style={styles.theme}>{item.theme}</Text> : <Text style={styles.themeEmpty}>No title</Text>}
              </>
            )}
          </Pressable>
        )}
        ListFooterComponent={<View style={{ height: 12 }} />}
      />

      <TripTabBar tripId={tripId} active="overview" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  body: { paddingHorizontal: 16, paddingTop: 10 },

  hero: { justifyContent: "flex-end", padding: 14 },
  heroScrim: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(11,30,63,0.15)",
  },
  headerRow: { position: "absolute", right: 14, flexDirection: "row", gap: 8 },
  hbtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(11,30,63,0.4)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
  },
  weatherBadge: {
    position: "absolute", right: 14, width: 66, height: 78, borderRadius: 39,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.85)", backgroundColor: "rgba(11,30,63,0.35)",
    alignItems: "center", justifyContent: "center",
  },
  weatherTemp: { color: "#fff", fontFamily: fonts.monoBold, fontSize: 15 },
  weatherDate: { color: "#fff", fontSize: 7, opacity: 0.85 },
  tripName: { color: "#fff", fontFamily: fonts.display, fontSize: 21, marginBottom: 4 },

  gapWarning: { backgroundColor: "rgba(216,80,58,0.1)", borderRadius: radius.md, padding: 10, marginTop: 10 },
  gapWarningText: { color: colors.coral, fontFamily: fonts.bodyBold, fontSize: 11.5 },

  budgetBubble: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 10, marginTop: 10,
  },
  budgetIconCirc: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.paper, alignItems: "center", justifyContent: "center" },
  budgetHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  budgetLabel: { color: colors.inkSoft, fontFamily: fonts.bodyBold, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  budgetPct: { color: colors.lightBlue, fontFamily: fonts.monoBold, fontSize: 13 },
  budgetTrack: { height: 6, backgroundColor: colors.paper, borderRadius: 4, overflow: "hidden" },
  budgetFill: { height: 6, borderRadius: 4 },
  budgetAmt: { color: colors.ink, fontSize: 10.5, fontWeight: "600", marginTop: 4 },
  chevron: { color: colors.inkSoft, fontSize: 18 },

  sectionLabel: { color: colors.inkSoft, fontFamily: fonts.bodyBold, fontSize: 11.5, textTransform: "uppercase", letterSpacing: 1, marginTop: 18, marginBottom: 8 },

  nextCard: {
    backgroundColor: colors.ink, borderRadius: radius.lg, padding: 14,
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  nextLabel: { color: colors.goldSoft, fontFamily: fonts.bodyBold, fontSize: 9, textTransform: "uppercase", letterSpacing: 1 },
  nextTitle: { color: "#fff", fontFamily: fonts.display, fontSize: 16, marginTop: 3 },
  nextMeta: { color: colors.goldSoft, fontFamily: fonts.mono, fontSize: 11, marginTop: 2 },
  doneCard: { backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 14, alignItems: "center" },
  doneText: { color: colors.inkSoft, fontSize: 13, fontStyle: "italic" },

  itemRow: {
    flexDirection: "row", alignItems: "stretch", backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, marginTop: 6, overflow: "hidden",
  },
  itemTimeCol: { width: 56, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  itemTimeText: { fontFamily: fonts.mono, color: "#fff", fontSize: 11 },
  itemIconCol: { width: 56, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  itemBody: { flex: 1, padding: 10 },
  itemCat: { color: colors.blue, fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 0.5 },
  itemTitle: { color: colors.ink, fontFamily: fonts.bodySemi, fontSize: 13, marginTop: 2 },
  itemSub: { color: colors.inkSoft, fontSize: 10.5, marginTop: 1 },

  dayRow: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 14, marginTop: 8, marginHorizontal: 16,
  },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  date: { fontFamily: fonts.mono, color: colors.ink, fontSize: 13 },
  todayDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gold },
  theme: { color: colors.blue, fontFamily: fonts.bodySemi, fontSize: 12, marginTop: 2 },
  themeEmpty: { color: colors.inkSoft, fontSize: 11, marginTop: 2, fontStyle: "italic" },
});
