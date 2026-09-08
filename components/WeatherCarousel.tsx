import { ScrollView, View, Text, StyleSheet, useWindowDimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "@/lib/theme";
import { fetchTripForecasts, weatherMeta } from "@/lib/weather";
import { formatDateDDMM } from "@/lib/dateFormat";

// Forecasts don't meaningfully change more often than this, so a query
// stays "fresh" (no refetch) for 3 hours after loading — the "loaded once
// automatically, refreshed next time only if old" behavior asked for is
// just TanStack Query's own staleTime, not anything bespoke.
const STALE_MS = 3 * 60 * 60 * 1000;

const SCREEN_PADDING = 16;

export default function WeatherCarousel({ tripId, destinations }: { tripId: string; destinations: string[] }) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - SCREEN_PADDING * 2, 420);

  const { data } = useQuery({
    queryKey: ["weather", tripId, destinations.join("|")],
    queryFn: () => fetchTripForecasts(destinations),
    staleTime: STALE_MS,
    enabled: destinations.length > 0,
  });

  if (destinations.length === 0 || !data || data.length === 0) return null;

  return (
    <View style={{ marginTop: 8 }}>
      <Text style={styles.sectionLabel}>Weather</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        pagingEnabled={data.length > 1}
        snapToInterval={data.length > 1 ? cardWidth + 10 : undefined}
        decelerationRate="fast"
      >
        {data.map((forecast, idx) => (
          <View key={forecast.destination} style={[styles.card, { width: cardWidth, marginRight: idx === data.length - 1 ? 0 : 10 }]}>
            <Text style={styles.destination}>{forecast.destination}</Text>
            <View style={styles.daysRow}>
              {forecast.days.map((d, i) => {
                const meta = weatherMeta(d.weatherCode);
                return (
                  <View key={d.date} style={styles.dayCell}>
                    <Text style={styles.dayLabel}>{i === 0 ? "Today" : formatDateDDMM(d.date)}</Text>
                    <Ionicons name={meta.icon as any} size={20} color={colors.teal} />
                    <Text style={styles.temp}>{Math.round(d.tempMax)}°/{Math.round(d.tempMin)}°</Text>
                    <Text style={styles.precip}>{d.precipProb !== null && d.precipProb > 0 ? `${d.precipProb}%` : " "}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: colors.inkSoft, fontWeight: "700", fontSize: 12,
    textTransform: "uppercase", letterSpacing: 1, marginBottom: 8,
  },
  card: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 14,
  },
  destination: { color: colors.ink, fontWeight: "700", fontSize: 14, marginBottom: 10 },
  daysRow: { flexDirection: "row", justifyContent: "space-between" },
  dayCell: { alignItems: "center", flex: 1 },
  dayLabel: { color: colors.inkSoft, fontSize: 10, fontWeight: "600", marginBottom: 4 },
  temp: { fontFamily: "IBMPlexMono_500Medium", color: colors.ink, fontSize: 12, fontWeight: "600", marginTop: 4 },
  precip: { color: colors.teal, fontSize: 10, marginTop: 2 },
});
