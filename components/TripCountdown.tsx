import { useMemo, useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { radius, fonts, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
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
  // The query cache persists to AsyncStorage as JSON (see PersistQueryClientProvider
  // in app/_layout.tsx) — a Date survives one in-memory query lifecycle fine, but
  // after a restart the rehydrated value is an ISO string, not a Date instance.
  // new Date() normalizes either case back to a real Date.
  const targetDate = new Date(target);
  const msLeft = targetDate.getTime() - now.getTime();
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
          <Text style={styles.unitLabel}>Hrs</Text>
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
 * trip gets one of these, not just the soonest. Sits on a plain card
 * background (unlike the big card version above, which is always over a
 * cover photo), so this one alone is theme-reactive. */
export function TripCountdownInline({ tripId, fallbackDateIso }: { tripId: string; fallbackDateIso: string }) {
  const colors = useThemeColors();
  const inlineStyles = useMemo(() => makeInlineStyles(colors), [colors]);
  const breakdown = useTripCountdown(tripId, fallbackDateIso);
  if (!breakdown) return null;

  return (
    <Text style={inlineStyles.text}>
      {breakdown.days}d {pad(breakdown.hours)}h {pad(breakdown.mins)}m
    </Text>
  );
}

// Always rendered over a trip's cover photo (Home's featured-trip hero, or
// the trip Overview header) — deliberately NOT theme-reactive, unlike
// almost everything else in the app. A photo backdrop isn't part of the
// page's own light/dark surface, so this translucent-navy-glass badge and
// its light text/gold accents stay fixed regardless of the app's theme,
// the same way the Overview hero's weather badge and trip name do.
const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(11,30,63,0.35)", borderRadius: radius.md,
    paddingVertical: 6, paddingHorizontal: 10, alignSelf: "flex-start",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.3)",
  },
  tripName: {
    color: "#F7ECD6", fontFamily: fonts.bodyBold, fontSize: 10,
    textTransform: "uppercase", letterSpacing: 1, marginBottom: 3,
  },
  row: { flexDirection: "row", alignItems: "center" },
  unit: { alignItems: "center", minWidth: 34 },
  num: { color: "#F7F9FC", fontFamily: fonts.monoBold, fontSize: 16 },
  unitLabel: { color: "#F7ECD6", fontSize: 7, fontFamily: fonts.bodyBold, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 1 },
  colon: { color: "#F7ECD6", fontWeight: "800", fontSize: 14, marginHorizontal: 2 },
});

const makeInlineStyles = (colors: ColorTokens) => StyleSheet.create({
  text: {
    fontFamily: fonts.mono, color: colors.blue,
    fontSize: 11, marginTop: 4,
  },
});
