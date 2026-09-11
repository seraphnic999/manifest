import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "@/lib/theme";
import Icon from "@/components/icons/Icon";

/** Back-chevron + title header for account-level screens reached by
 * drilling in from Home's hamburger menu (Archived Trips, Packing
 * Templates, a single template's editor) — no Home/Menu cluster here,
 * since going back IS going home. */
export default function SubpageHeader({ title }: { title: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.row, { paddingTop: insets.top + 10 }]}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        hitSlop={10}
        style={styles.backBtn}
      >
        <Icon name="back" size={22} color={colors.inkSoft} />
      </Pressable>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingBottom: 10,
    backgroundColor: colors.paperRaised, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  backBtn: { padding: 2 },
  title: { fontFamily: fonts.display, fontSize: 19, color: colors.ink },
});
