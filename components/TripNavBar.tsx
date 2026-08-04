import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "@/lib/theme";

type TripSection = "overview" | "money" | "shopping" | "day";

const SECTIONS: { key: TripSection; label: string; path: (tripId: string) => string }[] = [
  { key: "overview", label: "Overview", path: (id) => `/trip/${id}` },
  { key: "money", label: "Money", path: (id) => `/trip/${id}/money` },
  { key: "shopping", label: "Shopping", path: (id) => `/trip/${id}/shopping` },
];

export default function TripNavBar({ tripId, active }: { tripId: string; active: TripSection }) {
  const router = useRouter();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bar} contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}>
      {SECTIONS.map((s) => (
        <Pressable
          key={s.key}
          style={[styles.pill, active === s.key && styles.pillActive]}
          onPress={() => active !== s.key && router.push(s.path(tripId))}
        >
          <Text style={[styles.pillText, active === s.key && styles.pillTextActive]}>{s.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexGrow: 0, backgroundColor: colors.paperRaised,
    borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 8,
  },
  pill: {
    paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16,
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line,
  },
  pillActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  pillText: { fontSize: 12, fontWeight: "600", color: colors.inkSoft },
  pillTextActive: { color: colors.paper },
});
