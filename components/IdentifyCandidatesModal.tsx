import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, ActivityIndicator } from "react-native";
import { colors, radius, fonts } from "@/lib/theme";
import Icon from "@/components/icons/Icon";
import { Alert } from "@/lib/alert";
import { Item, IdentifyCandidate } from "@/lib/types";
import { identifyItem, createResearchJob } from "@/lib/itemResearch";

interface Props {
  visible: boolean;
  onClose: () => void;
  item: Pick<Item, "id" | "title" | "trip_id">;
  onQueued: () => void;
}

// Phase 1 of the research agent, shown inline while the user waits — this
// call is deliberately kept fast and cheap (see identify-item's own budget),
// so a plain loading spinner is the right amount of ceremony for it.
export default function IdentifyCandidatesModal({ visible, onClose, item, onQueued }: Props) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<IdentifyCandidate[] | null>(null);
  const [queuing, setQueuing] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setCandidates(null);
    identifyItem(item.id).then(({ candidates: c, error }) => {
      if (error) Alert.alert("Couldn't identify this item", error);
      setCandidates(c ?? []);
      setLoading(false);
    });
  }, [visible, item.id]);

  async function queue(name: string | null, context: Record<string, unknown> | null) {
    setQueuing(true);
    const { error } = await createResearchJob(item, name, context);
    setQueuing(false);
    if (error) {
      Alert.alert("Couldn't start research", error);
      return;
    }
    onQueued();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {loading ? (
            <>
              <ActivityIndicator color={colors.blue} style={{ marginBottom: 14 }} />
              <Text style={styles.loadingText}>Identifying "{item.title}"…</Text>
            </>
          ) : (
            <>
              <Text style={styles.title}>
                {candidates && candidates.length > 0 ? "Which one did you mean?" : "Couldn't identify this automatically"}
              </Text>

              {candidates?.map((c, i) => (
                <Pressable
                  key={i}
                  style={styles.candidateRow}
                  onPress={() => queue(c.name, { area_hint: c.area_hint, reasoning: c.reasoning })}
                  disabled={queuing}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.candidateName}>{c.name}</Text>
                    {!!c.area_hint && <Text style={styles.candidateHint}>{c.area_hint}</Text>}
                  </View>
                  <Icon name="forward" size={18} color={colors.blue} />
                </Pressable>
              ))}

              {(!candidates || candidates.length === 0) && (
                <Text style={styles.hint}>Research it anyway using just the item's title?</Text>
              )}

              <View style={styles.actions}>
                <Pressable style={styles.cancelBtn} onPress={onClose} disabled={queuing}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.fallbackBtn, queuing && { opacity: 0.6 }]}
                  onPress={() => queue(null, null)}
                  disabled={queuing}
                >
                  <Text style={styles.fallbackText}>
                    {queuing ? "Starting…" : candidates && candidates.length > 0 ? "None of these" : "Research anyway"}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(11,30,63,0.4)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: colors.paperRaised, borderRadius: radius.xl, padding: 20, alignItems: "stretch" },
  loadingText: { color: colors.inkSoft, fontSize: 14, textAlign: "center" },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginBottom: 14 },
  candidateRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 14, marginBottom: 8,
  },
  candidateName: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 15 },
  candidateHint: { color: colors.inkSoft, fontSize: 12.5, marginTop: 2 },
  hint: { color: colors.inkSoft, fontSize: 13.5, marginBottom: 4 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 16, marginTop: 12 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 6 },
  cancelText: { color: colors.inkSoft, fontWeight: "600", fontSize: 14.5 },
  fallbackBtn: { paddingVertical: 10, paddingHorizontal: 6 },
  fallbackText: { color: colors.blue, fontWeight: "700", fontSize: 14.5 },
});
