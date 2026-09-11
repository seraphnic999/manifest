import { StyleSheet, View } from "react-native";
import { colors } from "@/lib/theme";
import Icon from "@/components/icons/Icon";

export default function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.box, checked && styles.boxChecked]}>
      {checked && <Icon name="check" size={14} color="#fff" />}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 1.8, borderColor: colors.inkSoft,
    alignItems: "center", justifyContent: "center",
  },
  boxChecked: { backgroundColor: colors.blue, borderColor: colors.blue },
});
