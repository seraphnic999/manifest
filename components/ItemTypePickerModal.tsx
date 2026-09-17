import { useMemo } from "react";
import { View, Text, Pressable, Modal, StyleSheet, ScrollView } from "react-native";
import { radius, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import { ITEM_CATEGORIES, ItemCategory } from "@/lib/itemTypeMeta";
import Icon from "@/components/icons/Icon";

export default function ItemTypePickerModal({
  visible, onClose, onSelect, onSelectKeeper, onSelectQuickAdd, categories = ITEM_CATEGORIES, title = "Add item",
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
  /** Same idea as onSelectKeeper — "Quick add" (Maps link / natural
   * language) isn't a category either, it opens QuickAddModal instead.
   * Omit to leave the tile out. */
  onSelectQuickAdd?: () => void;
  /** Defaults to every category (the "Add item" picker) — pass a filtered
   * subset for other uses, e.g. changing an existing item's type, which
   * excludes flight/lodging (see CONVERTIBLE_CATEGORIES). */
  categories?: ItemCategory[];
  title?: string;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>
          <ScrollView contentContainerStyle={styles.grid}>
            {categories.map((cat) => (
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
            {onSelectQuickAdd && (
              <Pressable style={styles.tile} onPress={onSelectQuickAdd}>
                <View style={[styles.iconCircle, { backgroundColor: colors.lightBlue }]}>
                  <Icon name="research" size={26} color="#fff" />
                </View>
                <Text style={styles.tileLabel}>Quick add</Text>
              </Pressable>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const TILE_SIZE = "31%";

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
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
  // The tile itself is a fixed dark slate regardless of theme (it's a chip
  // floating on the sheet below, not the page's own light/dark surface —
  // same reasoning as a photo overlay), so its label is fixed light too,
  // deliberately NOT colors.paper: that token flips to navy in dark mode,
  // which would put dark text on this same dark tile.
  tile: {
    width: TILE_SIZE, backgroundColor: "#2A3B4D", borderRadius: radius.lg,
    paddingVertical: 18, alignItems: "center", marginBottom: 10,
  },
  iconCircle: {
    width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center",
    marginBottom: 10,
  },
  tileLabel: { color: "#F7F9FC", fontSize: 13, fontWeight: "600" },
});
