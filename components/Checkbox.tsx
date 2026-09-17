import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import Icon from "@/components/icons/Icon";

export default function Checkbox({ checked }: { checked: boolean }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.box, checked && styles.boxChecked]}>
      {checked && <Icon name="check" size={14} color="#fff" />}
    </View>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  box: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 1.8, borderColor: colors.inkSoft,
    alignItems: "center", justifyContent: "center",
  },
  boxChecked: { backgroundColor: colors.blue, borderColor: colors.blue },
});
