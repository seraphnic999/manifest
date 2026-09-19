import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from "react-native";
import { radius, fonts, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import Checkbox from "@/components/Checkbox";
import { WeatherPackingResult } from "@/lib/weatherPacking";
import { mergePackingItems } from "@/lib/packing";

interface Props {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  result: WeatherPackingResult;
  destinationsLabel: string;
  onAdded: () => void;
}

export default function WeatherPackingModal({ visible, onClose, tripId, result, destinationsLabel, onAdded }: Props) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Everything starts checked — this is a review-before-add screen, not an
  // opt-in one, matching how every other proposal screen in the app works
  // (research review, Quick Add, email import).
  useEffect(() => {
    if (visible) setChecked(new Set(result.suggestions.map((s) => s.name)));
  }, [visible, result]);

  function toggle(name: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  async function onAdd() {
    setSaving(true);
    const toAdd = result.suggestions.filter((s) => checked.has(s.name)).map((s) => ({ name: s.name, category: s.category }));
    await mergePackingItems(tripId, toAdd);
    setSaving(false);
    onAdded();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Pack for the weather</Text>
          {!!result.summary && (
            <Text style={styles.summary}>{destinationsLabel}: {result.summary}</Text>
          )}

          {result.suggestions.length === 0 ? (
            <Text style={styles.empty}>Nothing weather-specific to flag — looks like a mild stretch.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 360 }}>
              {result.suggestions.map((s) => (
                <Pressable key={s.name} style={styles.row} onPress={() => toggle(s.name)}>
                  <Checkbox checked={checked.has(s.name)} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{s.name}</Text>
                    <Text style={styles.rowReason}>{s.reason}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {result.suggestions.length > 0 && (
            <Pressable
              style={[styles.addButton, (saving || checked.size === 0) && { opacity: 0.6 }]}
              onPress={onAdd}
              disabled={saving || checked.size === 0}
            >
              <Text style={styles.addButtonText}>{saving ? "Adding…" : `Add ${checked.size} item${checked.size === 1 ? "" : "s"}`}</Text>
            </Pressable>
          )}
          <Pressable style={styles.cancelButton} onPress={onClose} disabled={saving}>
            <Text style={styles.cancelButtonText}>{result.suggestions.length === 0 ? "Close" : "Cancel"}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.4)", justifyContent: "center", padding: 30 },
  card: { backgroundColor: colors.paperRaised, borderRadius: radius.lg, padding: 16, width: "100%", maxWidth: 420, alignSelf: "center" },
  title: { fontFamily: fonts.display, fontSize: 17, color: colors.ink, marginBottom: 4 },
  summary: { color: colors.inkSoft, fontSize: 12.5, marginBottom: 14 },
  empty: { color: colors.inkSoft, fontStyle: "italic", fontSize: 13.5, marginVertical: 12 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  rowName: { color: colors.ink, fontSize: 14.5, fontFamily: fonts.bodySemi },
  rowReason: { color: colors.inkSoft, fontSize: 12, marginTop: 1 },
  addButton: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 12, alignItems: "center", marginTop: 14 },
  addButtonText: { color: colors.paper, fontWeight: "700" },
  cancelButton: { alignItems: "center", padding: 10, marginTop: 2 },
  cancelButtonText: { color: colors.inkSoft, fontWeight: "600", fontSize: 13.5 },
});
