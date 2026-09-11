import { useEffect, useState } from "react";
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { colors, radius } from "@/lib/theme";
import NumberStepper from "@/components/NumberStepper";

/** Small popup to set (or change) a trip's budget on the spot — opened
 * from the Expenses page's "No budget defined" prompt, so the user isn't
 * forced over to the trip edit screen just to add one. */
export default function SetBudgetModal({
  visible, onClose, onSave, initialAmount,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (amount: number) => void;
  initialAmount: number | null;
}) {
  const [amount, setAmount] = useState(initialAmount != null ? String(initialAmount) : "");

  useEffect(() => {
    if (visible) setAmount(initialAmount != null ? String(initialAmount) : "");
  }, [visible, initialAmount]);

  function save() {
    const parsed = parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    onSave(parsed);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Set trip budget</Text>
          <Text style={styles.hint}>Total budget for this trip, in NIS.</Text>
          <NumberStepper value={amount} onChange={setAmount} step={100} placeholder="e.g. 3000" />
          <Pressable style={styles.saveBtn} onPress={save}>
            <Text style={styles.saveBtnText}>Save</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(11,30,63,0.4)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: colors.paperRaised, borderRadius: radius.lg, padding: 20, width: "100%", maxWidth: 420, alignSelf: "center" },
  title: { color: colors.ink, fontWeight: "700", fontSize: 17, marginBottom: 4 },
  hint: { color: colors.inkSoft, fontSize: 12, marginBottom: 14 },
  saveBtn: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 16 },
  saveBtnText: { color: colors.paper, fontWeight: "700" },
});
