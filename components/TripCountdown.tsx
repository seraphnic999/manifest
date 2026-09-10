import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { colors, radius } from "@/lib/theme";
import { fetchTripCountdownTarget } from "@/lib/countdown";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

interface Breakdown {
  days: number;
  hours: number;
  mins: number;
}

/** Shared ticking Days/Hours/Min breakdown to a trip's first scheduled
 * item. Returns null once that moment passes, or before the target has
 * loaded — callers are still responsible for not mounting anything for a
 * trip that's already current or past. */
function useTripCountdown(tripId: string, fallbackDateIso: string): Breakdown | null {
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

  return {
    days: Math.floor(msLeft / 86400000),
    hours: Math.floor((msLeft % 86400000) / 3600000),
    mins: Math.floor((msLeft % 3600000) / 60000),
  };
}

/** The big card version — Overview header, or the home screen's featured trip. */
export default function TripCountdown({
  tripId, fallbackDateIso, tripName,
}: { tripId: string; fallbackDateIso: string; tripName?: string }) {
  const breakdown = useTripCountdown(tripId, fallbackDateIso);
  if (!breakdown) return null;

  return (
    <View style={styles.card}>
      {tripName && <Text style={styles.tripName}>{tripName}</Text>}
      <View style={styles.row}>
        <View style={styles.unit}>
          <Text style={styles.num}>{breakdown.days}</Text>
          <Text style={styles.unitLabel}>Days</Text>
        </View>
        <Text style={styles.colon}>:</Text>
        <View style={styles.unit}>
          <Text style={styles.num}>{pad(breakdown.hours)}</Text>
          <Text style={styles.unitLabel}>Hours</Text>
        </View>
        <Text style={styles.colon}>:</Text>
        <View style={styles.unit}>
          <Text style={styles.num}>{pad(breakdown.mins)}</Text>
          <Text style={styles.unitLabel}>Min</Text>
        </View>
      </View>
    </View>
  );
}

/** A single-line compact version for a trip list row — every upcoming
 * trip gets one of these, not just the soonest. */
export function TripCountdownInline({ tripId, fallbackDateIso }: { tripId: string; fallbackDateIso: string }) {
  const breakdown = useTripCountdown(tripId, fallbackDateIso);
  if (!breakdown) return null;

  return (
    <Text style={inlineStyles.text}>
      {breakdown.days}d {pad(breakdown.hours)}h {pad(breakdown.mins)}m
    </Text>
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

const inlineStyles = StyleSheet.create({
  text: {
    fontFamily: "IBMPlexMono_500Medium", color: colors.amber, fontWeight: "700",
    fontSize: 11, marginTop: 4,
  },
});
