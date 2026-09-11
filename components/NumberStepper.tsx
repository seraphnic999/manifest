import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { colors, radius } from "@/lib/theme";

/** A numeric text field with +/- buttons that bump the value by `step`
 * (default 100) — used anywhere a budget amount is entered, since typing
 * a round number by hand is fiddly but a plain stepper with no direct
 * entry is worse for a large jump. Value/onChange are plain strings, same
 * convention as every other numeric-but-text field in this app (kept as
 * text so an in-progress edit like "" or "1" isn't coerced mid-typing). */
export default function NumberStepper({
  value, onChange, step = 100, min = 0, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  step?: number;
  min?: number;
  placeholder?: string;
}) {
  function bump(delta: number) {
    const current = parseFloat(value) || 0;
    const next = Math.max(min, Math.round((current + delta) * 100) / 100);
    onChange(String(next));
  }

  return (
    <View style={styles.row}>
      <Pressable style={styles.btn} onPress={() => bump(-step)} hitSlop={6}>
        <Text style={styles.btnText}>−</Text>
      </Pressable>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        placeholder={placeholder}
        placeholderTextColor={colors.inkSoft}
      />
      <Pressable style={styles.btn} onPress={() => bump(step)} hitSlop={6}>
        <Text style={styles.btnText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  btn: {
    width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.blueSoft,
    alignItems: "center", justifyContent: "center",
  },
  btnText: { color: colors.blue, fontSize: 20, fontWeight: "700", lineHeight: 22 },
  input: {
    flex: 1, backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink, textAlign: "center",
  },
});
