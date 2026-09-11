import { View, Text, StyleSheet } from "react-native";
import { colors, radius } from "@/lib/theme";
import { BudgetProgress } from "@/lib/budget";

export default function BudgetProgressBar({ progress }: { progress: BudgetProgress }) {
  const barPct = Math.min(progress.percent, 100);
  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Budget</Text>
        <Text style={[styles.percent, progress.overBudget && styles.percentOver]}>{Math.round(progress.percent)}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${barPct}%` }, progress.overBudget && styles.fillOver]} />
      </View>
      <Text style={styles.amounts}>
        {"₪"}{Math.round(progress.spentTotal)} of {"₪"}{Math.round(progress.budget)}
        {progress.overBudget ? ` · ₪${Math.round(progress.spentTotal - progress.budget)} over` : ""}
      </Text>
      {progress.paceProjection !== null && (
        <Text style={styles.pace}>
          At this pace, you'll land around {"₪"}{Math.round(progress.paceProjection)} by the end.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 14, marginBottom: 14,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  label: { color: colors.inkSoft, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 },
  percent: { fontFamily: "JetBrainsMono_600SemiBold", color: colors.teal, fontWeight: "700", fontSize: 14 },
  percentOver: { color: colors.coral },
  track: { height: 10, backgroundColor: colors.paper, borderRadius: 6, overflow: "hidden" },
  fill: { height: 10, backgroundColor: colors.teal, borderRadius: 6 },
  fillOver: { backgroundColor: colors.coral },
  amounts: { color: colors.ink, fontSize: 12, fontWeight: "600", marginTop: 8 },
  pace: { color: colors.inkSoft, fontSize: 11, marginTop: 4, fontStyle: "italic" },
});
