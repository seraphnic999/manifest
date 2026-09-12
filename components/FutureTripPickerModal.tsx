import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from "react-native";
import { colors, radius, fonts } from "@/lib/theme";
import Icon from "@/components/icons/Icon";
import { Trip } from "@/lib/types";
import { fetchFutureTrips } from "@/lib/keepers";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (trip: Trip) => void;
}

/** A keeper's "Add to Trip" button — only trips that haven't started yet
 * make sense here, since this is about planning ahead, not editing the
 * past or an already-underway trip. */
export default function FutureTripPickerModal({ visible, onClose, onSelect }: Props) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchFutureTrips().then((list) => {
      setTrips(list);
      setLoading(false);
    });
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Add to trip</Text>
          <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
            {!loading && trips.length === 0 && (
              <Text style={styles.empty}>No upcoming trips yet — create one first.</Text>
            )}
            {trips.map((t) => (
              <Pressable key={t.id} style={styles.row} onPress={() => onSelect(t)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{t.name}</Text>
                  <Text style={styles.rowSub}>{formatDateDDMMYYYY(t.start_date)} – {formatDateDDMMYYYY(t.end_date)}</Text>
                </View>
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
  rowTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 15 },
  rowSub: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
  cancelBtn: { alignItems: "center", padding: 12, marginTop: 4 },
  cancelText: { color: colors.inkSoft, fontWeight: "600", fontSize: 15 },
});
