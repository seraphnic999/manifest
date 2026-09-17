import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { colors, radius, fonts } from "@/lib/theme";
import Icon from "@/components/icons/Icon";

export type DocTrackerAddChoice = "companion" | "scan-camera" | "scan-gallery";

const OPTIONS: { choice: DocTrackerAddChoice; icon: "user" | "camera" | "gallery"; label: string; sub: string }[] = [
  { choice: "companion", icon: "user", label: "Add companion", sub: "A person you travel with" },
  { choice: "scan-camera", icon: "camera", label: "Scan a document — camera", sub: "AI reads it and figures out whose it is" },
  { choice: "scan-gallery", icon: "gallery", label: "Scan a document — gallery", sub: "Pick an existing photo to read" },
];

/** The Doc Tracker main page's "+" entry point — add a person, or scan a
 * document straight from here without picking a companion first (the scan
 * itself figures out who it belongs to; see ScanDocumentModal). Document
 * entry from this screen is scan-only, deliberately — manual entry still
 * needs a companion already chosen, so that stays on the companion's own
 * "+ Add document" (AddDocumentOptionsModal). */
export default function DocTrackerAddOptionsModal({
  visible, onClose, onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (choice: DocTrackerAddChoice) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Add to Doc Tracker</Text>
          {OPTIONS.map((opt) => (
            <Pressable key={opt.choice} style={styles.row} onPress={() => onSelect(opt.choice)}>
              <View style={styles.iconCircle}>
                <Icon name={opt.icon} size={20} color={colors.blue} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{opt.label}</Text>
                <Text style={styles.rowSub}>{opt.sub}</Text>
              </View>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(11,30,61,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 16, paddingBottom: 32 },
  title: { fontFamily: fonts.display, fontSize: 17, color: colors.ink, marginBottom: 12, paddingHorizontal: 4 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 14, marginBottom: 10,
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.blueSoft,
    alignItems: "center", justifyContent: "center",
  },
  rowLabel: { color: colors.ink, fontFamily: fonts.bodySemi, fontSize: 15 },
  rowSub: { color: colors.inkSoft, fontSize: 12.5, marginTop: 2 },
});
