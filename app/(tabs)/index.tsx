import { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { Trip, tripStatus } from "@/lib/types";

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

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const grouped = {
    current: trips.filter((t) => tripStatus(t) === "current"),
    future: trips.filter((t) => tripStatus(t) === "future"),
    past: trips.filter((t) => tripStatus(t) === "past"),
  };

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <Text style={styles.eyebrow}>YOUR TRIPS</Text>
        <Text style={styles.title}>Where next?</Text>
      </View>
      <FlatList
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        data={[
          { label: "Current", items: grouped.current },
          { label: "Upcoming", items: grouped.future },
          { label: "Past", items: grouped.past },
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
                    {trip.start_date} – {trip.end_date}
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
});
