import { useState, useCallback } from "react";
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { Trip, tripStatus } from "@/lib/types";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";

export default function TripList() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("trips")
      .select("*")
      .is("deleted_at", null)
      .order("start_date", { ascending: false });
    if (!error && data) setTrips(data as Trip[]);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

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
          <Pressable style={styles.newButton} onPress={() => router.push("/trip/new")}>
            <Text style={styles.newButtonText}>+ New trip</Text>
          </Pressable>
        </View>
      </View>
      <FlatList
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
                  onPress={() => router.push(`/trip/${trip.id}`)}
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
