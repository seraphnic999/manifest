import { Pressable, StyleSheet } from "react-native";
import { colors } from "@/lib/theme";

export default function HeaderIconButton({
  onPress, children, disabled, accessibilityLabel,
}: { onPress: () => void; children: React.ReactNode; disabled?: boolean; accessibilityLabel?: string }) {
  return (
    <Pressable
      style={styles.button} onPress={onPress} disabled={disabled} hitSlop={8}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    alignItems: "center", justifyContent: "center",
  },
});
