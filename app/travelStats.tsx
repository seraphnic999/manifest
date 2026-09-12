import { FlatList, View, Text, StyleSheet, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import SubpageHeader from "@/components/SubpageHeader";
import { colors, radius, fonts } from "@/lib/theme";
import { fetchTravelStats, tripTimeStatus, YearStats, TripStatsRow } from "@/lib/travelStats";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TripRow({ trip }: { trip: TripStatsRow }) {
  const router = useRouter();
  const status = tripTimeStatus(trip);
  return (
    <Pressable style={styles.tripRow} onPress={() => router.push(`/trip/${trip.id}`)}>
      <View style={{ flex: 1 }}>
        <View style={styles.tripNameRow}>
          <Text style={styles.tripName}>{trip.name}</Text>
          {status === "future" && (
            <View style={[styles.statusBadge, styles.statusBadgeFuture]}>
              <Text style={[styles.statusBadgeText, styles.statusBadgeTextFuture]}>FUTURE</Text>
            </View>
          )}
          {status === "current" && (
            <View style={[styles.statusBadge, styles.statusBadgeCurrent]}>
              <Text style={[styles.statusBadgeText, styles.statusBadgeTextCurrent]}>CURRENT</Text>
            </View>
          )}
        </View>
        <Text style={styles.tripDates}>
          {formatDateDDMMYYYY(trip.startDate)} – {formatDateDDMMYYYY(trip.endDate)} · {trip.days} day{trip.days === 1 ? "" : "s"}
        </Text>
        {trip.destinations.length > 0 && (
          <Text style={styles.tripDestinations} numberOfLines={1}>{trip.destinations.join(", ")}</Text>
        )}
      </View>
      <Text style={styles.tripCost}>₪{Math.round(trip.costNis).toLocaleString()}</Text>
    </Pressable>
  );
}

function YearSection({ year }: { year: YearStats }) {
  return (
    <View style={styles.yearSection}>
      <Text style={styles.yearTitle}>{year.year}</Text>
      <View style={styles.statGrid}>
        <StatTile label={`Trip${year.tripCount === 1 ? "" : "s"}`} value={String(year.tripCount)} />
        <StatTile label={`Day${year.totalDays === 1 ? "" : "s"} traveling`} value={String(year.totalDays)} />
        <StatTile label="Destinations" value={String(year.destinationCount)} />
        <StatTile label="Total cost" value={`₪${Math.round(year.totalCostNis).toLocaleString()}`} />
      </View>
      {year.trips.map((t) => <TripRow key={t.id} trip={t} />)}
    </View>
  );
}

export default function TravelStats() {
  const { data } = useQuery({ queryKey: ["travelStats"], queryFn: fetchTravelStats });
  const years = data ?? [];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SubpageHeader title="Travel Stats" />
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        data={years}
        keyExtractor={(y) => String(y.year)}
        renderItem={({ item }) => <YearSection year={item} />}
        ListEmptyComponent={<Text style={styles.empty}>No trips yet — your stats will show up here once you do.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  empty: { color: colors.inkSoft, fontStyle: "italic", fontSize: 13, textAlign: "center", marginTop: 40 },
  yearSection: { marginBottom: 28 },
  yearTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.ink, marginBottom: 10 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  statTile: {
    flexBasis: "47%", flexGrow: 1, backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 14,
  },
  statValue: { fontFamily: fonts.display, fontSize: 22, color: colors.blue },
  statLabel: { color: colors.inkSoft, fontSize: 11.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 },
  tripRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  tripNameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  tripName: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14.5 },
  statusBadge: { borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 },
  statusBadgeFuture: { backgroundColor: colors.goldSoft },
  statusBadgeCurrent: { backgroundColor: colors.coralSoft },
  statusBadgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  statusBadgeTextFuture: { color: colors.gold },
  statusBadgeTextCurrent: { color: colors.coral },
  tripDates: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
  tripDestinations: { color: colors.inkSoft, fontSize: 11.5, marginTop: 2, fontStyle: "italic" },
  tripCost: { color: colors.blue, fontFamily: fonts.mono, fontSize: 14 },
});
