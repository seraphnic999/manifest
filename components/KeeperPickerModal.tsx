import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from "react-native";
import { colors, radius, fonts } from "@/lib/theme";
import Icon from "@/components/icons/Icon";
import { Keeper } from "@/lib/types";
import { fetchKeepersForCity } from "@/lib/keepers";
import { categoryForDbType } from "@/lib/itemTypeMeta";

interface Props {
  visible: boolean;
  onClose: () => void;
  city: { cityId: string | null; customName: string | null; label: string | null };
  onSelect: (keeper: Keeper) => void;
}

/** The day view's "Keeper" item-type tile opens this instead of a blank
 * new-item form — pick one of your own keepers for this day's city and
 * proceed to the same pre-filled add flow as "Add to Trip". */
export default function KeeperPickerModal({ visible, onClose, city, onSelect }: Props) {
  const [keepers, setKeepers] = useState<Keeper[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchKeepersForCity({ cityId: city.cityId, customName: city.customName }).then((list) => {
      setKeepers(list);
      setLoading(false);
    });
  }, [visible, city.cityId, city.customName]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Keepers{city.label ? ` in ${city.label}` : ""}</Text>
          <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
            {!loading && keepers.length === 0 && (
              <Text style={styles.empty}>
                {city.label
                  ? `No keepers saved in ${city.label} yet.`
                  : "This day has no city set yet, so keepers can't be matched."}
              </Text>
            )}
            {keepers.map((k) => (
              <Pressable key={k.id} style={styles.row} onPress={() => onSelect(k)}>
                <Icon name={categoryForDbType(k.item_type).icon} size={22} color={colors.blue} />
                <Text style={styles.rowTitle} numberOfLines={1}>{k.title}</Text>
                <Icon name="forward" size={18} color={colors.blue} />
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(11,30,63,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.paperRaised, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: "70%", width: "100%", maxWidth: 480, alignSelf: "center",
  },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginBottom: 14, textAlign: "center" },
  empty: { color: colors.inkSoft, fontStyle: "italic", fontSize: 13, textAlign: "center", marginVertical: 20 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  rowTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 15, flex: 1 },
  cancelBtn: { alignItems: "center", padding: 12, marginTop: 4 },
  cancelText: { color: colors.inkSoft, fontWeight: "600", fontSize: 15 },
});
