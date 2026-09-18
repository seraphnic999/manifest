import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { radius, fonts, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import Icon from "@/components/icons/Icon";
import { EntryRequirementWarning } from "@/lib/entryRequirements";

/** Trip Overview banner for entry-requirement problems found on this trip —
 * sits below the companions bar and above Weather. Only shown when this
 * trip actually has an active (non-dismissed) warning; a trip with no
 * special requirements, or where everyone's documents already clear them,
 * shows nothing at all. */
export default function EntryRequirementBubble({ warnings }: { warnings: EntryRequirementWarning[] }) {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (warnings.length === 0) return null;
  const [first, ...rest] = warnings;

  return (
    <Pressable style={styles.card} onPress={() => router.push("/doctracker/document-analysis")}>
      <View style={styles.iconCircle}>
        <Icon name="warning" size={20} color={colors.coral} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Entry requirement warning</Text>
        <Text style={styles.detail} numberOfLines={1}>
          {first.companion_name} — {first.country}: {first.requirement_description}
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
    backgroundColor: colors.coralSoft, borderWidth: 1, borderColor: colors.coral,
    borderRadius: radius.lg, padding: 12, marginTop: 10,
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
