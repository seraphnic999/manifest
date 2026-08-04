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
    <View style={styles.barOuter}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.barContent}
      >
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
