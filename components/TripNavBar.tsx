import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { colors } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { tripStatus } from "@/lib/types";

type TripSection = "today" | "overview" | "money" | "shopping" | "day" | "map";

const SECTIONS: { key: TripSection; label: string; path: (tripId: string) => string }[] = [
  { key: "today", label: "Today", path: (id) => `/trip/${id}/today` },
  { key: "overview", label: "Overview", path: (id) => `/trip/${id}` },
  { key: "map", label: "Map", path: (id) => `/trip/${id}/map` },
  { key: "money", label: "Money", path: (id) => `/trip/${id}/money` },
  { key: "shopping", label: "Shopping", path: (id) => `/trip/${id}/shopping` },
];

async function fetchTripDates(tripId: string) {
  const { data, error } = await supabase.from("trips").select("start_date, end_date").eq("id", tripId).single();
  if (error) throw error;
  return data;
}

export default function TripNavBar({ tripId, active }: { tripId: string; active: TripSection }) {
  const router = useRouter();

  // Today only ever makes sense for a trip that's actually under way — a
  // dedicated, minimal query (not reusing e.g. the Overview screen's own
  // ["tripOverview", tripId] key/shape) so this component stays correct
  // regardless of which screen it's rendered from.
  const { data: tripDates } = useQuery({
    queryKey: ["tripDates", tripId],
    queryFn: () => fetchTripDates(tripId),
  });
  const isCurrent = tripDates ? tripStatus(tripDates) === "current" : false;
  const sections = SECTIONS.filter((s) => s.key !== "today" || isCurrent);

  return (
    <View style={styles.barOuter}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.barContent}
      >
        {sections.map((s) => (
          <Pressable
            key={s.key}
            style={[styles.pill, active === s.key && styles.pillActive]}
            onPress={() => active !== s.key && router.push(s.path(tripId))}
          >
            <Text style={[styles.pillText, active === s.key && styles.pillTextActive]}>{s.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  barOuter: {
    height: 52,
    backgroundColor: colors.paperRaised,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  barContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 6,
  },
  pill: {
    height: 30,
    minWidth: 70,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  pillActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  pillText: { fontSize: 12, fontWeight: "600", color: colors.inkSoft },
  pillTextActive: { color: colors.paper },
});
