import { View, Text, Pressable, Modal, StyleSheet, ScrollView } from "react-native";
import { colors, radius } from "@/lib/theme";
import { ITEM_CATEGORIES } from "@/lib/itemTypeMeta";
import Icon from "@/components/icons/Icon";

export default function ItemTypePickerModal({
  visible, onClose, onSelect, onSelectKeeper,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (categoryKey: string) => void;
  /** "Keeper" isn't a real item type (it has no dbTypes of its own — a
   * keeper's underlying type is whatever place it snapshots), so it's kept
   * out of ITEM_CATEGORIES and given its own callback: picking it opens a
   * keeper picker instead of going straight to the new-item form. Omit
   * this prop to leave the tile out entirely (e.g. the map's "add
   * proposal" picker has no day/city to match keepers against). */
  onSelectKeeper?: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Add item</Text>
          <ScrollView contentContainerStyle={styles.grid}>
            {ITEM_CATEGORIES.map((cat) => (
              <Pressable
                key={cat.key}
                style={styles.tile}
                onPress={() => onSelect(cat.key)}
              >
                <View style={[styles.iconCircle, { backgroundColor: cat.tileColor }]}>
                  <Icon name={cat.icon} size={26} color="#fff" />
                </View>
                <Text style={styles.tileLabel}>{cat.label}</Text>
              </Pressable>
            ))}
            {onSelectKeeper && (
              <Pressable style={styles.tile} onPress={onSelectKeeper}>
                <View style={[styles.iconCircle, { backgroundColor: colors.gold }]}>
                  <Icon name="star" size={26} color="#fff" />
                </View>
                <Text style={styles.tileLabel}>Keeper</Text>
              </Pressable>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const TILE_SIZE = "31%";

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.ink, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: "70%",
    width: "100%", maxWidth: 480, alignSelf: "center",
  },
  title: {
    color: colors.paper, fontFamily: "Poppins_700Bold" as any, fontWeight: "800",
    fontSize: 18, marginBottom: 16, textAlign: "center",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10 },
  tile: {
    width: TILE_SIZE, backgroundColor: "#2A3B4D", borderRadius: radius.lg,
    paddingVertical: 18, alignItems: "center", marginBottom: 10,
  },
  iconCircle: {
    width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center",
    marginBottom: 10,
  },
  tileLabel: { color: colors.paper, fontSize: 13, fontWeight: "600" },
});
