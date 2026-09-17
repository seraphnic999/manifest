import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { radius, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";
import { Day } from "@/lib/types";

/** The mandatory "which day does this item live on" field for item add/edit
 * — a tap target that opens TripDayPickerModal (with Proposals included)
 * rather than a raw date field, since a day (including the dateless
 * Proposals one) is what the rest of the schema actually keys items on. */
export default function DayField({ label, day, onPress }: { label: string; day: Day | null; onPress: () => void }) {
  const text = !day ? "Pick a day…" : day.date === null ? "Proposals" : formatDateDDMMYYYY(day.date);
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.box} onPress={onPress}>
        <Text style={[styles.text, !day && styles.placeholder]}>{text}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  label: {
    color: colors.inkSoft, fontSize: 12, fontWeight: "600",
    marginTop: 16, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5,
  },
  box: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12,
  },
  text: { fontSize: 15, color: colors.ink },
  placeholder: { color: colors.inkSoft },
});
