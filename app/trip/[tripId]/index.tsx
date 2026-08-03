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
  const [totalNis, setTotalNis] = useState<number | null>(null);
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

    (async () => {
      const { data: currencies } = await supabase.from("trip_currencies").select("*").eq("trip_id", tripId);
      const { data: expenses } = await supabase.from("expenses").select("amount, currency_code").eq("trip_id", tripId);
      if (!currencies || !expenses) return;
      const total = expenses.reduce((sum, e) => {
        const rate = currencies.find((c) => c.code === e.currency_code)?.rate_to_nis ?? 1;
        return sum + e.amount * rate;
      }, 0);
      setTotalNis(total);
    })();
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

            {flights.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Flights</Text>
                {flights.map((f) => {
                  const flightNumber = (f.custom_fields as any)?.flight_number as string | undefined;
                  return (
                    <Pressable key={f.id} style={styles.flightRow} onPress={() => router.push(`/item/${f.id}`)}>
                      <View style={styles.flightTimeCol}>
                        <Text style={styles.flightTimeText}>{f.time_start ?? "\u2014"}</Text>
                        <Text style={styles.flightDateText}>{f.start_date ?? ""}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.highlightTitle}>{f.title}</Text>
                        <Text style={styles.highlightMeta}>
                          {[f.vendor, flightNumber].filter(Boolean).join(" \u00b7 ") || "No airline set"}
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
                      <Text style={styles.flightTimeText}>{l.time_start ?? "\u2014"}</Text>
                      <Text style={styles.flightDateText}>{l.start_date ?? ""}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.highlightTitle}>{l.title}</Text>
                      <Text style={styles.highlightMeta}>Until {l.end_date}</Text>
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
    width: 72, alignSelf: "stretch", backgroundColor: colors.ink,
    alignItems: "center", justifyContent: "center", paddingVertical: 10,
  },
  flightTimeText: { fontFamily: "IBMPlexMono_500Medium", color: colors.paper, fontWeight: "700", fontSize: 13 },
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
