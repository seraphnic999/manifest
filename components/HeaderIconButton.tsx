import { useMemo } from "react";
import { Pressable, StyleSheet } from "react-native";
import { ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";

export default function HeaderIconButton({
  onPress, children, disabled, accessibilityLabel,
}: { onPress: () => void; children: React.ReactNode; disabled?: boolean; accessibilityLabel?: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      style={styles.button} onPress={onPress} disabled={disabled} hitSlop={8}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Pressable>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  button: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    alignItems: "center", justifyContent: "center",
  },
});
