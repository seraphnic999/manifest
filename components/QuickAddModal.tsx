import { useState } from "react";
import { View, Text, Pressable, Modal, StyleSheet, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { colors, radius, fonts } from "@/lib/theme";
import { Item, ItemType } from "@/lib/types";
import { parseMapsLink, parseNaturalLanguage, createQuickAddItem } from "@/lib/quickAdd";
import IdentifyCandidatesModal from "@/components/IdentifyCandidatesModal";

type Mode = "maps_link" | "natural_language";

interface Props {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  /** The day a plain "add item" from this same entry point would land on —
   * used whenever the parsed sentence doesn't name a date that matches one
   * of the trip's real days (or for a Maps link, which never has one). */
  fallbackDayId: string;
  tripStart: string;
  tripEnd: string;
  /** Fired once the new item exists and the identify/research step has been
   * queued (or explicitly skipped) — the caller navigates to it. */
  onDone: (itemId: string) => void;
}

/** "+  Add item" → Quick add: create an item from a pasted Google Maps link
 * or one short natural-language sentence, then hand straight into the same
 * identify-item/research-item review flow the plain new-item form uses. */
export default function QuickAddModal({ visible, onClose, tripId, fallbackDayId, tripStart, tripEnd, onDone }: Props) {
  const [mode, setMode] = useState<Mode>("maps_link");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIdentify, setPendingIdentify] = useState<{ id: string; title: string; trip_id: string } | null>(null);

  function reset() {
    setText("");
    setError(null);
    setLoading(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function submit() {
    const value = text.trim();
    if (!value) return;
    setLoading(true);
    setError(null);

    if (mode === "maps_link") {
      const { result, error: err } = await parseMapsLink(value);
      if (!result) { setLoading(false); setError(err ?? "Couldn't read that link."); return; }
      const { id, error: createErr } = await createQuickAddItem({
        tripId, fallbackDayId, title: result.title, itemType: "other" as ItemType,
        date: null, time: null, latitude: result.latitude, longitude: result.longitude,
      });
      setLoading(false);
      if (!id) { setError(createErr ?? "Couldn't create the item."); return; }
      reset();
      setPendingIdentify({ id, title: result.title, trip_id: tripId });
    } else {
      const { result, error: err } = await parseNaturalLanguage(value, tripStart, tripEnd);
      if (!result) { setLoading(false); setError(err ?? "Couldn't make sense of that."); return; }
      const { id, error: createErr } = await createQuickAddItem({
        tripId, fallbackDayId, title: result.title, itemType: result.item_type,
        date: result.date, time: result.time,
      });
      setLoading(false);
      if (!id) { setError(createErr ?? "Couldn't create the item."); return; }
      reset();
      setPendingIdentify({ id, title: result.title, trip_id: tripId });
    }
  }

  return (
    <>
      <Modal visible={visible && !pendingIdentify} transparent animationType="slide" onRequestClose={handleClose}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
          <View style={styles.sheet}>
            <Text style={styles.title}>Quick add</Text>

            <View style={styles.tabRow}>
              <Pressable
                style={[styles.tab, mode === "maps_link" && styles.tabActive]}
                onPress={() => { setMode("maps_link"); setError(null); }}
              >
                <Text style={[styles.tabText, mode === "maps_link" && styles.tabTextActive]}>Maps link</Text>
              </Pressable>
              <Pressable
                style={[styles.tab, mode === "natural_language" && styles.tabActive]}
                onPress={() => { setMode("natural_language"); setError(null); }}
              >
                <Text style={[styles.tabText, mode === "natural_language" && styles.tabTextActive]}>Describe it</Text>
              </Pressable>
            </View>

            <TextInput
              style={[styles.input, mode === "natural_language" && styles.inputMulti]}
              value={text}
              onChangeText={setText}
              placeholder={mode === "maps_link" ? "https://maps.app.goo.gl/…" : "e.g. dinner at Shabour restaurant on 30/10 20:00"}
              placeholderTextColor={colors.inkSoft}
              autoCapitalize="none"
              autoCorrect={mode === "maps_link" ? false : true}
              multiline={mode === "natural_language"}
              editable={!loading}
            />
            {mode === "natural_language" && (
              <Text style={styles.hint}>Include a date/time if you have one — it'll land on the right day automatically.</Text>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable style={[styles.submitBtn, (loading || !text.trim()) && { opacity: 0.6 }]} onPress={submit} disabled={loading || !text.trim()}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Continue</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {pendingIdentify && (
        <IdentifyCandidatesModal
          visible
          item={pendingIdentify}
          onClose={() => { const id = pendingIdentify.id; setPendingIdentify(null); onDone(id); }}
          onQueued={() => { const id = pendingIdentify.id; setPendingIdentify(null); onDone(id); }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(11,30,61,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 16, paddingBottom: 32 },
  title: { fontFamily: fonts.display, fontSize: 17, color: colors.ink, marginBottom: 12 },
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  tab: {
    flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.md,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
  },
  tabActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  tabText: { color: colors.inkSoft, fontFamily: fonts.bodySemi, fontSize: 13.5 },
  tabTextActive: { color: "#fff" },
  input: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
  },
  inputMulti: { minHeight: 70, textAlignVertical: "top" },
  hint: { color: colors.inkSoft, fontSize: 12, marginTop: 6, fontStyle: "italic" },
  error: { color: colors.coral, fontSize: 13, marginTop: 10 },
  submitBtn: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 16 },
  submitBtnText: { color: colors.paper, fontWeight: "700", fontSize: 15 },
});
