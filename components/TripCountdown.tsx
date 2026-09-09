import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { colors, radius } from "@/lib/theme";
import { fetchTripCountdownTarget } from "@/lib/countdown";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Days-to-go until inside 24 hours, then a live HH:MM:SS countdown to the
 * trip's first scheduled item. Renders nothing once that moment passes —
 * callers are still responsible for not mounting this at all for a trip
 * that's already current or past. */
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
  const isFinalDay = msLeft < 24 * 3600 * 1000;

  return (
    <View style={styles.card}>
      {tripName && <Text style={styles.tripName}>{tripName}</Text>}
      {isFinalDay ? (
        <Text style={styles.big}>
          {pad(Math.floor(msLeft / 3600000))}:{pad(Math.floor((msLeft % 3600000) / 60000))}:{pad(Math.floor((msLeft % 60000) / 1000))}
        </Text>
      ) : (
        <Text style={styles.big}>{daysLeft} day{daysLeft === 1 ? "" : "s"} to go</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: 16, marginBottom: 14, alignItems: "center" },
  tripName: {
    color: colors.amberSoft, fontWeight: "700", fontSize: 12,
    textTransform: "uppercase", letterSpacing: 1, marginBottom: 4,
  },
  big: { color: colors.paper, fontWeight: "800", fontSize: 28, fontFamily: "IBMPlexMono_500Medium" },
});
