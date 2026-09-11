import { ReactNode } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "@/lib/theme";
import Icon from "@/components/icons/Icon";
import HamburgerMenu, { HamburgerMenuItem } from "@/components/HamburgerMenu";

/** The plain (non-photo) top bar used on every trip-scoped utility screen —
 * Map, Expenses/Shopping, Packing, Currency, Day View. Same top-right
 * Home+Menu cluster as the Overview's photo header, just on a flat
 * background instead of overlaid on a cover image. `left` defaults to a
 * plain title but can be swapped for something like a back-chevron row. */
export default function TripScreenHeader({
  title, left, tripId, menuItems, onBack,
}: {
  title: string;
  left?: ReactNode;
  tripId: string;
  menuItems: HamburgerMenuItem[];
  onBack?: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.row, { paddingTop: insets.top + 10 }]}>
      {left ?? (
        onBack ? (
          <Pressable style={styles.backRow} onPress={onBack} hitSlop={8}>
            <Icon name="back" size={20} color={colors.blue} />
            <Text style={styles.title}>{title}</Text>
          </Pressable>
        ) : (
          <Text style={styles.title}>{title}</Text>
        )
      )}
      <View style={styles.btns}>
        <Pressable
          style={styles.hbtn}
          onPress={() => (router.canDismiss() ? router.dismissAll() : router.replace("/"))}
          accessibilityLabel="Home"
        >
          <Icon name="home" size={22} color={colors.blue} />
        </Pressable>
        <HamburgerMenu items={menuItems} solid />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 10,
    backgroundColor: colors.paperRaised, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  title: { fontFamily: fonts.display, fontSize: 19, color: colors.ink },
  backRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  btns: { flexDirection: "row", gap: 8 },
  hbtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line,
  },
});
