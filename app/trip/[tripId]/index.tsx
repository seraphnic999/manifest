import { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { Day, Item, Trip } from "@/lib/types";

export default function TripOverview() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [flights, setFlights] = useState<Item[]>([]);
  const [lodgings, setLodgings] = useState<Item[]>([]);
  const router = useRouter();

  useEffect(() => {
    supabase.from("trips").select("*").eq("id", tripId).single()
      .then(({ data }) => data && setTrip(data as Trip));
    supabase.from("days").select("*").eq("trip_id", tripId).order("sort_order")
      .then(({ data }) => data && setDays(data as Day[]));
    supabase.from("items").select("*").eq("trip_id", tripId).eq("type", "flight").is("deleted_at", null).order("start_date")
      .then(({ data }) => data && setFlights(data as Item[]));
    supabase.from("items").select("*").eq("trip_id", tripId).eq("is_stay_span", true).is("deleted_at", null).order("start_date")
      .then(({ data }) => data && setLodgings(data as Item[]));
  }, [tripId]);

  if (!trip) return null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Overview" }} />
      <FlatList
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Text style={styles.tripName}>{trip.name}</Text>
              <Text style={styles.tripDates}>{trip.start_date} - {trip.end_date}</Text>
              {trip.destinations.length > 0 && (
                <Text style={styles.destinations}>{trip.destinations.join(" \u00b7 ")}</Text>
              )}
            </View>

            {flights.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Flights</Text>
                {flights.map((f) => (
                  <Pressable key={f.id} style={styles.highlightRow} onPress={() => router.push(`/item/${f.id}`)}>
                    <Text style={styles.highlightMono}>{f.vendor || f.title}</Text>
                    <Text style={styles.highlightMeta}>{f.start_date ?? ""} {f.time_start ?? ""}</Text>
                  </Pressable>
                ))}
              </>
            )}

            {lodgings.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Lodging</Text>
                {lodgings.map((l) => (
                  <Pressable key={l.id} style={styles.highlightRow} onPress={() => router.push(`/item/${l.id}`)}>
                    <Text style={styles.highlightTitle}>{l.title}</Text>
                    <Text style={styles.highlightMeta}>{l.start_date} {"\u2192"} {l.end_date}</Text>
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
            onPress={() => router.push(`/trip/${tripId}/day/${item.date}`)}
          >
            <Text style={styles.date}>{item.date}</Text>
            {item.theme ? <Text style={styles.theme}>{item.theme}</Text> : <Text style={styles.themeEmpty}>No title</Text>}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  header: { marginBottom: 8 },
  tripName: { fontFamily: "Archivo_700Bold" as any, fontWeight: "800", fontSize: 22, color: colors.ink },
  tripDates: { color: colors.inkSoft, fontSize: 13, marginTop: 2 },
  destinations: { color: colors.teal, fontSize: 12, marginTop: 4, fontWeight: "600" },
  sectionLabel: {
    color: colors.inkSoft, fontWeight: "700", fontSize: 12,
    textTransform: "uppercase", letterSpacing: 1, marginTop: 18, marginBottom: 8,
  },
  highlightRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, marginBottom: 6,
  },
  highlightMono: { fontFamily: "IBMPlexMono_500Medium", color: colors.ink, fontWeight: "600", fontSize: 13 },
  highlightTitle: { color: colors.ink, fontWeight: "600", fontSize: 13 },
  highlightMeta: { color: colors.inkSoft, fontSize: 11 },
  dayRow: {
    backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 14, marginBottom: 8,
  },
  date: { fontFamily: "IBMPlexMono_500Medium", color: colors.ink, fontWeight: "600" },
  theme: { color: colors.teal, fontSize: 12, marginTop: 2, fontWeight: "600" },
  themeEmpty: { color: colors.inkSoft, fontSize: 11, marginTop: 2, fontStyle: "italic" },
});
