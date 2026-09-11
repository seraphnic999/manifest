import { View, Text, Pressable, Modal, StyleSheet, ScrollView } from "react-native";
import { colors, radius } from "@/lib/theme";
import { DAY_COLOR_SWATCHES } from "@/lib/dayColors";
import Icon from "@/components/icons/Icon";

/** Grid picker for a day's (or Proposals') map color — the fixed palette
 * from the user's own reference swatch sheet, not a free color wheel. */
export default function DayColorPickerModal({
  visible, onClose, onSelect, selected,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (hex: string) => void;
  selected: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Day color</Text>
          <ScrollView contentContainerStyle={styles.grid}>
            {DAY_COLOR_SWATCHES.map((swatch) => {
              const isSelected = swatch.hex.toLowerCase() === selected.toLowerCase();
              return (
                <Pressable
                  key={swatch.hex}
                  style={styles.tile}
                  onPress={() => onSelect(swatch.hex)}
                  accessibilityLabel={swatch.label}
                >
                  <View style={[styles.swatch, { backgroundColor: swatch.hex }, isSelected && styles.swatchActive]}>
                    {isSelected && <Icon name="check" size={18} color="#fff" />}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const TILE_SIZE = "16%";

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.ink, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: "60%",
    width: "100%", maxWidth: 480, alignSelf: "center",
  },
  title: {
    color: colors.paper, fontFamily: "Poppins_700Bold" as any, fontWeight: "800",
    fontSize: 18, marginBottom: 16, textAlign: "center",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10 },
  tile: { width: TILE_SIZE, alignItems: "center", marginBottom: 6 },
  swatch: {
    width: 44, height: 44, borderRadius: radius.md,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  swatchActive: { borderWidth: 3, borderColor: colors.gold },
});
