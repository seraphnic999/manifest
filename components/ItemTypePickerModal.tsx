import { View, Text, Pressable, Modal, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "@/lib/theme";
import { ITEM_CATEGORIES } from "@/lib/itemTypeMeta";

export default function ItemTypePickerModal({
  visible, onClose, onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (categoryKey: string) => void;
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
                  <Ionicons name={cat.icon as any} size={26} color="#fff" />
                </View>
                <Text style={styles.tileLabel}>{cat.label}</Text>
              </Pressable>
            ))}
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
  },
  title: {
    color: colors.paper, fontFamily: "Archivo_700Bold" as any, fontWeight: "800",
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
