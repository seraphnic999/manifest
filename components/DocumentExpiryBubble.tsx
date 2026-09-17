import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { radius, fonts, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import Icon from "@/components/icons/Icon";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";
import { documentTypeLabel } from "@/lib/travelDocuments";
import { DocumentExpiryWarning } from "@/lib/documentExpiry";

/** Home screen banner for expiring documents — sits below the nav icon row
 * and above the current-trip hero. Only the single most urgent (soonest
 * expiry) warning is named directly; any others are summarized as a count,
 * matching the review-one-at-a-time shape the dedicated expiry-warnings
 * screen (behind Doc Tracker's lock) actually lists them in. */
export default function DocumentExpiryBubble({ warnings }: { warnings: DocumentExpiryWarning[] }) {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (warnings.length === 0) return null;
  const [first, ...rest] = warnings;

  return (
    <Pressable style={styles.card} onPress={() => router.push("/doctracker/expiry-warnings")}>
      <View style={styles.iconCircle}>
        <Icon name="warning" size={20} color={colors.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Document expiring soon</Text>
        <Text style={styles.detail} numberOfLines={1}>
          {first.companion_name}'s {documentTypeLabel(first.document_type)} — {formatDateDDMMYYYY(first.expiry_date)}
        </Text>
        {rest.length > 0 && <Text style={styles.more}>+{rest.length} additional warning{rest.length === 1 ? "" : "s"}</Text>}
      </View>
      <Text style={styles.chevron}>{"›"}</Text>
    </Pressable>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.gold,
    borderRadius: radius.lg, padding: 12, marginHorizontal: 16, marginTop: 12,
  },
  iconCircle: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.paperRaised,
    alignItems: "center", justifyContent: "center",
  },
  title: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 13.5 },
  detail: { color: colors.ink, fontSize: 12.5, marginTop: 2 },
  more: { color: colors.inkSoft, fontSize: 11.5, marginTop: 2, fontStyle: "italic" },
  chevron: { color: colors.inkSoft, fontSize: 18 },
});
