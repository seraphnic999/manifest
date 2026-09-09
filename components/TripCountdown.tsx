import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { colors, radius } from "@/lib/theme";
import { fetchTripCountdownTarget } from "@/lib/countdown";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** A live Days : Hours : Min countdown to the trip's first scheduled item —
 * the same three-unit format the whole way down, Days just reaching 0
 * once inside the last day rather than the display changing shape.
 * Renders nothing once that moment passes — callers are still responsible
 * for not mounting this at all for a trip that's already current or past. */
export default function TripCountdown({
  tripId, fallbackDateIso, tripName,
}: { tripId: string; fallbackDateIso: string; tripName?: string }) {
  const [now, setNow] = useState(new Date());
  const { data: target } = useQuery({
    queryKey: ["countdownTarget", tripId],
    queryFn: () => fetchTripCountdownTarget(tripId, fallbackDateIso),
  });

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!target) return null;
  const msLeft = target.getTime() - now.getTime();
  if (msLeft <= 0) return null;

  const daysLeft = Math.floor(msLeft / 86400000);
  const hoursLeft = Math.floor((msLeft % 86400000) / 3600000);
  const minsLeft = Math.floor((msLeft % 3600000) / 60000);

  return (
    <View style={styles.card}>
      {tripName && <Text style={styles.tripName}>{tripName}</Text>}
      <View style={styles.row}>
        <View style={styles.unit}>
          <Text style={styles.num}>{daysLeft}</Text>
          <Text style={styles.unitLabel}>Days</Text>
        </View>
        <Text style={styles.colon}>:</Text>
        <View style={styles.unit}>
          <Text style={styles.num}>{pad(hoursLeft)}</Text>
          <Text style={styles.unitLabel}>Hours</Text>
        </View>
        <Text style={styles.colon}>:</Text>
        <View style={styles.unit}>
          <Text style={styles.num}>{pad(minsLeft)}</Text>
          <Text style={styles.unitLabel}>Min</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: 16, marginBottom: 14, alignItems: "center" },
  tripName: {
    color: colors.amberSoft, fontWeight: "700", fontSize: 12,
    textTransform: "uppercase", letterSpacing: 1, marginBottom: 8,
  },
  row: { flexDirection: "row", alignItems: "center" },
  unit: { alignItems: "center", minWidth: 52 },
  num: { color: colors.paper, fontWeight: "800", fontSize: 28, fontFamily: "IBMPlexMono_500Medium" },
  unitLabel: { color: colors.amberSoft, fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 },
  colon: { color: colors.amberSoft, fontWeight: "800", fontSize: 24, marginHorizontal: 4, marginBottom: 14 },
});
