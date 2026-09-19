// The public share page's own bottom tab bar — same shape/convention as
// the app's TripTabBar (each screen renders its own copy and navigates via
// router.push; a day-detail screen omits it, same as the app's day/item
// screens omit TripTabBar), just trimmed to the two things a read-only
// guest actually gets: the trip itself, and the map.
import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { fonts, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import Icon, { IconName } from "@/components/icons/Icon";

export type ShareTab = "overview" | "map";

const TABS: { key: ShareTab; label: string; icon: IconName; path: (token: string) => string }[] = [
  { key: "overview", label: "Trip", icon: "overview", path: (token) => `/share/${token}` },
  { key: "map", label: "Map", icon: "map", path: (token) => `/share/${token}/map` },
];

export default function ShareTabBar({ token, active }: { token: string; active: ShareTab }) {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.bar}>
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Pressable
            key={t.key}
            style={styles.tab}
            onPress={() => !isActive && router.push(t.path(token) as any)}
          >
            <Icon name={t.icon} size={26} color={isActive ? colors.blue : colors.inkSoft} />
            <Text style={[styles.label, isActive && styles.labelActive]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  bar: {
    flexDirection: "row", justifyContent: "center", gap: 4,
    paddingTop: 8, paddingBottom: 10, paddingHorizontal: 4,
    backgroundColor: colors.paperRaised, borderTopWidth: 1, borderTopColor: colors.line,
  },
  tab: { flex: 1, alignItems: "center", gap: 4, minWidth: 0, maxWidth: 120 },
  label: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.inkSoft },
  labelActive: { color: colors.blue },
});
