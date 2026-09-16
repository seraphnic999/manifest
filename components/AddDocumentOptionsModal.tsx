import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { colors, radius, fonts } from "@/lib/theme";
import Icon from "@/components/icons/Icon";

export type AddDocumentMode = "manual" | "gallery" | "camera";

const OPTIONS: { mode: AddDocumentMode; icon: "edit" | "research" | "camera"; label: string; sub: string }[] = [
  { mode: "manual", icon: "edit", label: "Enter manually", sub: "Type in the details yourself" },
  { mode: "gallery", icon: "research", label: "Scan from gallery", sub: "Pick a photo and let AI read it" },
  { mode: "camera", icon: "camera", label: "Scan with camera", sub: "Take a photo and let AI read it" },
];

/** The "+ Add document" entry point — asks manual vs. AI scan (and which
 * photo source) before TravelDocumentEditModal even opens, rather than
 * burying the scan option inside the form itself. */
export default function AddDocumentOptionsModal({
  visible, onClose, onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (mode: AddDocumentMode) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Add document</Text>
          {OPTIONS.map((opt) => (
            <Pressable key={opt.mode} style={styles.row} onPress={() => onSelect(opt.mode)}>
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
