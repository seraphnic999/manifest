import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { Item, Day, Trip } from "@/lib/types";
import { categoryForDbType } from "@/lib/itemTypeMeta";
import TripNavBar from "@/components/TripNavBar";
import { formatDateDDMMYYYY, localIsoDate } from "@/lib/dateFormat";
import { normalizeTimeHHMM } from "@/lib/timeFormat";
import { formatDuration } from "@/lib/duration";
import HomeButton from "@/components/HomeButton";
import { useNetworkStatus } from "@/lib/useNetworkStatus";
import OfflineBanner from "@/components/OfflineBanner";
import WeatherCarousel from "@/components/WeatherCarousel";

const STATUS_LABEL: Record<string, string> = {
  booked: "Booked", optional: "Optional", planned: "Planned",
};

// Same "plain local Date, no timezone_start involved" convention the rest of
// the app already uses for date math (see computeDurationMinutes) — items
// carry a timezone_start field but nothing in this codebase actually uses it
// for arithmetic, so this matches existing behavior rather than inventing a
// new one.
function itemDateTime(item: Item): Date | null {
  if (!item.start_date || !item.time_start) return null;
  const d = new Date(`${item.start_date}T${normalizeTimeHHMM(item.time_start)}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface TodayData {
  trip: Trip;
  todayIso: string;
  todayItems: Item[];
  nextDay: { date: string; items: Item[] } | null;
}

async function fetchTodayData(tripId: string): Promise<TodayData | null> {
  const { data: tripRow, error: tripError } = await supabase.from("trips").select("*").eq("id", tripId).single();
  if (tripError) throw tripError;
  if (!tripRow) return null;

  const iso = localIsoDate();
  const { data: days, error: daysError } = await supabase.from("days").select("*").eq("trip_id", tripId).order("sort_order");
  if (daysError) throw daysError;
  const allDays = (days ?? []) as Day[];
  const todayDay = allDays.find((d) => d.date === iso);

  let todayItems: Item[] = [];
  if (todayDay) {
    const { data: items, error } = await supabase.from("items").select("*")
      .eq("day_id", todayDay.id).is("deleted_at", null).order("sort_order");
    if (error) throw error;
    todayItems = (items ?? []) as Item[];
  }

  // Nothing left today (or no day exists for today at all, e.g. a gap
  // between trip segments) — surface the next dated day that actually has
  // items, rather than leaving the screen empty.
  let nextDay: TodayData["nextDay"] = null;
  const futureDays = allDays
    .filter((d): d is Day & { date: string } => d.date !== null && d.date > iso)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const d of futureDays) {
    const { data: items, error } = await supabase.from("items").select("*")
      .eq("day_id", d.id).is("deleted_at", null).order("sort_order");
    if (error) throw error;
    if (items && items.length > 0) {
      nextDay = { date: d.date, items: items as Item[] };
      break;
    }
  }

  return { trip: tripRow as Trip, todayIso: iso, todayItems, nextDay };
}

export default function TodayView() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [now, setNow] = useState(new Date());
  const router = useRouter();
  const isOnline = useNetworkStatus();

  // The query key includes today's date so a date rollover (e.g. the app
  // stays open, or is reopened offline, past midnight) never shows a stale
  // cached "today" mislabeled as the current one.
  const { data, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["today", tripId, localIsoDate()],
    queryFn: () => fetchTodayData(tripId),
  });

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  // Keeps the "in 2h 15m" countdown accurate without a full data reload.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  if (!data) return null;
  const { trip, todayIso, todayItems, nextDay } = data;

  const withTimes = todayItems.map((item) => ({ item, at: itemDateTime(item) }));
  const nextEntry = withTimes.find(({ at }) => at !== null && at.getTime() >= now.getTime());

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: "Today",
        headerRight: () => <View style={{ marginRight: 14 }}><HomeButton /></View>,
      }} />

      <TripNavBar tripId={tripId} active="today" />
      <OfflineBanner dataUpdatedAt={!isOnline ? dataUpdatedAt : undefined} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={styles.dateHeading}>{todayIso ? formatDateDDMMYYYY(todayIso) : ""}</Text>

        <WeatherCarousel tripId={tripId} destinations={trip.destinations} />

        {nextEntry ? (
          <View style={styles.nextCard}>
            <Text style={styles.nextLabel}>Next</Text>
            <Text style={styles.nextTitle}>{nextEntry.item.title}</Text>
            <Text style={styles.nextMeta}>
              {normalizeTimeHHMM(nextEntry.item.time_start)}
              {" · in "}
              {formatDuration(Math.max(0, Math.round((nextEntry.at!.getTime() - now.getTime()) / 60000)))}
            </Text>
          </View>
        ) : todayItems.length > 0 ? (
          <View style={styles.doneCard}>
            <Text style={styles.doneText}>That's everything for today.</Text>
          </View>
        ) : (
          <View style={styles.doneCard}>
            <Text style={styles.doneText}>Nothing planned for today.</Text>
          </View>
        )}

        {withTimes.map(({ item, at }) => {
          const isNext = nextEntry?.item.id === item.id;
          const isPast = at !== null && at.getTime() < now.getTime() && !isNext;
          return (
            <Pressable
              key={item.id}
              style={[styles.row, isNext && styles.rowNext, isPast && styles.rowPast]}
              onPress={() => router.push(`/item/${item.id}`)}
            >
              <View style={[styles.timeCol, isPast && styles.timeColMuted]}>
                <Text style={styles.timeText}>{normalizeTimeHHMM(item.time_start) || "—"}</Text>
              </View>
              <View style={styles.body}>
                <View style={styles.row1}>
                  <Ionicons name={categoryForDbType(item.type).icon as any} size={12} color={colors.teal} />
                  <Text style={styles.typeTag}>{item.type.toUpperCase()}</Text>
                  <Text style={styles.statusBadge}>{STATUS_LABEL[item.status]}</Text>
                </View>
                <Text style={styles.itemTitle}>{item.title}</Text>
              </View>
            </Pressable>
          );
        })}

        {nextDay && (
          <>
            <Text style={styles.sectionLabel}>Next up &middot; {formatDateDDMMYYYY(nextDay.date)}</Text>
            <Pressable
              style={styles.row}
              onPress={() => router.push(`/trip/${tripId}/day/${nextDay.date}`)}
            >
              <View style={styles.timeCol}>
                <Text style={styles.timeText}>{normalizeTimeHHMM(nextDay.items[0].time_start) || "—"}</Text>
              </View>
              <View style={styles.body}>
                <View style={styles.row1}>
                  <Ionicons name={categoryForDbType(nextDay.items[0].type).icon as any} size={12} color={colors.teal} />
                  <Text style={styles.typeTag}>{nextDay.items[0].type.toUpperCase()}</Text>
                </View>
                <Text style={styles.itemTitle}>{nextDay.items[0].title}</Text>
              </View>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  dateHeading: {
    fontFamily: "IBMPlexMono_500Medium", color: colors.inkSoft, fontSize: 12,
    fontWeight: "600", letterSpacing: 1, marginBottom: 10,
  },
  nextCard: {
    backgroundColor: colors.ink, borderRadius: radius.lg, padding: 16, marginBottom: 16,
  },
  nextLabel: {
    color: colors.amberSoft, fontWeight: "700", fontSize: 11,
    textTransform: "uppercase", letterSpacing: 1, marginBottom: 4,
  },
  nextTitle: { color: colors.paper, fontWeight: "800", fontSize: 19 },
  nextMeta: { color: colors.amberSoft, fontSize: 13, marginTop: 4, fontFamily: "IBMPlexMono_500Medium" },
  doneCard: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 16, marginBottom: 16, alignItems: "center",
  },
  doneText: { color: colors.inkSoft, fontSize: 14, fontStyle: "italic" },
  sectionLabel: {
    color: colors.inkSoft, fontWeight: "700", fontSize: 12,
    textTransform: "uppercase", letterSpacing: 1, marginTop: 18, marginBottom: 8,
  },
  row: {
    flexDirection: "row", alignItems: "stretch", backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, marginBottom: 8, overflow: "hidden",
  },
  rowNext: { borderColor: colors.amber, borderWidth: 2 },
  rowPast: { opacity: 0.5 },
  timeCol: { width: 60, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", padding: 6 },
  timeColMuted: { backgroundColor: "#C7BFA9" },
  timeText: { fontFamily: "IBMPlexMono_500Medium", color: colors.paper, fontSize: 11, fontWeight: "600" },
  body: { flex: 1, padding: 10 },
  row1: { flexDirection: "row", alignItems: "center", gap: 6 },
  typeTag: { fontFamily: "IBMPlexMono_500Medium", fontSize: 9, color: colors.teal, fontWeight: "600" },
  statusBadge: { fontSize: 9, color: colors.inkSoft, marginLeft: "auto" },
  itemTitle: { color: colors.ink, fontWeight: "600", fontSize: 14, marginTop: 2 },
});
