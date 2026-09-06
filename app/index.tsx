import { useCallback, useEffect, useRef } from "react";
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { Trip, tripStatus } from "@/lib/types";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";
import { useNetworkStatus } from "@/lib/useNetworkStatus";
import OfflineBanner from "@/components/OfflineBanner";
import { Alert } from "@/lib/alert";

// Set once a current-trip redirect has been attempted this app session, so
// it only ever fires on the first load after launch — the Home button (the
// only other way back to this screen) must keep working as a real trip list
// even while a trip is current, not bounce straight back to Today.
let hasCheckedLaunchRedirect = false;

async function fetchTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .is("deleted_at", null)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return data as Trip[];
}

export default function TripList() {
  const router = useRouter();
  const isOnline = useNetworkStatus();
  const { data, dataUpdatedAt, refetch, isRefetching } = useQuery({
    queryKey: ["trips"],
    queryFn: fetchTrips,
  });
  const trips = data ?? [];

  // Runs once per app session, the first time trip data actually loads —
  // see hasCheckedLaunchRedirect above for why this can't just be "every
  // time this screen loads".
  const redirectChecked = useRef(false);
  useEffect(() => {
    if (!data || redirectChecked.current || hasCheckedLaunchRedirect) return;
    redirectChecked.current = true;
    hasCheckedLaunchRedirect = true;
    const current = data.find((t) => tripStatus(t) === "current");
    if (current) router.replace(`/trip/${current.id}/today`);
  }, [data]);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const onRefresh = async () => { await refetch(); };

  // Upcoming = not finished yet (already in progress or still to come), soonest
  // first. Previous = already over, most recently ended first (going further
  // back in time below that).
  const upcoming = trips
    .filter((t) => tripStatus(t) !== "past")
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const previous = trips
    .filter((t) => tripStatus(t) === "past")
    .sort((a, b) => b.start_date.localeCompare(a.start_date));

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View>
            <Text style={styles.eyebrow}>YOUR TRIPS</Text>
            <Text style={styles.title}>Where next?</Text>
          </View>
          <Pressable
            style={styles.newButton}
            onPress={() => {
              if (!isOnline) {
                Alert.alert("You're offline", "Connect to the internet to create a new trip.");
                return;
              }
              router.push("/trip/new");
            }}
          >
            <Text style={styles.newButtonText}>+ New trip</Text>
          </Pressable>
        </View>
      </View>
      <OfflineBanner dataUpdatedAt={!isOnline ? dataUpdatedAt : undefined} />
      <FlatList
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />}
        data={[
          { label: "Upcoming Trips", items: upcoming },
          { label: "Previous Trips", items: previous },
        ]}
        keyExtractor={(s) => s.label}
        renderItem={({ item: section }) =>
          section.items.length === 0 ? null : (
            <View>
              <Text style={styles.sectionLabel}>{section.label}</Text>
              {section.items.map((trip) => (
                <Pressable
                  key={trip.id}
                  style={styles.card}
                  onPress={() => router.push(
                    tripStatus(trip) === "current" ? `/trip/${trip.id}/today` : `/trip/${trip.id}`
                  )}
                >
                  <Text style={styles.tag}>{trip.type.toUpperCase()}</Text>
                  <Text style={styles.cardTitle}>{trip.name}</Text>
                  <Text style={styles.dates}>
                    {formatDateDDMMYYYY(trip.start_date)} – {formatDateDDMMYYYY(trip.end_date)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No trips yet — create your first one.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  topbar: { padding: 20, paddingBottom: 8 },
  eyebrow: { color: colors.amber, fontWeight: "600", fontSize: 11, letterSpacing: 1 },
  title: { color: colors.ink, fontWeight: "800", fontSize: 24, marginTop: 4 },
  sectionLabel: {
    color: colors.inkSoft, fontWeight: "700", fontSize: 12,
    textTransform: "uppercase", letterSpacing: 1, marginVertical: 10,
  },
  card: {
    backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 16, marginBottom: 10,
  },
  tag: { color: colors.inkSoft, fontSize: 10, letterSpacing: 1, fontWeight: "600" },
  cardTitle: { color: colors.ink, fontWeight: "700", fontSize: 18, marginTop: 4 },
  dates: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
  empty: { textAlign: "center", color: colors.inkSoft, marginTop: 40 },
  newButton: { backgroundColor: colors.ink, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12 },
  newButtonText: { color: colors.paper, fontWeight: "700", fontSize: 12 },
});
