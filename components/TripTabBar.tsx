import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { colors, fonts } from "@/lib/theme";
import Icon, { IconName } from "@/components/icons/Icon";

export type TripTab = "overview" | "map" | "expenses" | "packing" | "currency";

const TABS: { key: TripTab; label: string; icon: IconName; path: (id: string) => string }[] = [
  { key: "overview", label: "Overview", icon: "overview", path: (id) => `/trip/${id}` },
  { key: "map", label: "Map", icon: "map", path: (id) => `/trip/${id}/map` },
  { key: "expenses", label: "Expenses", icon: "budget", path: (id) => `/trip/${id}/money` },
  { key: "packing", label: "Packing", icon: "packing", path: (id) => `/trip/${id}/packing` },
  { key: "currency", label: "Currency", icon: "currency", path: (id) => `/trip/${id}/currency-converter` },
];

/** The persistent bottom nav for trip-scoped screens (not shown on Home or
 * account-level screens like Archived Trips / Packing Templates). */
export default function TripTabBar({ tripId, active }: { tripId: string; active: TripTab }) {
  const router = useRouter();
  return (
    <View style={styles.bar}>
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Pressable
            key={t.key}
            style={styles.tab}
            onPress={() => !isActive && router.push(t.path(tripId))}
          >
            <Icon name={t.icon} size={21} color={isActive ? colors.blue : colors.inkSoft} />
            <Text style={[styles.label, isActive && styles.labelActive]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row", justifyContent: "center", gap: 16,
    paddingTop: 8, paddingBottom: 10, paddingHorizontal: 14,
    backgroundColor: colors.paperRaised, borderTopWidth: 1, borderTopColor: colors.line,
  },
  tab: { width: 48, alignItems: "center", gap: 3 },
  label: { fontFamily: fonts.bodySemi, fontSize: 9.5, color: colors.inkSoft },
  labelActive: { color: colors.blue },
});
