import { useMemo, useState } from "react";
import { View, Text, Pressable, Modal, StyleSheet, TextInput, ActivityIndicator, Image, KeyboardAvoidingView, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { radius, fonts, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import Icon from "@/components/icons/Icon";
import { Alert } from "@/lib/alert";
import { ItemType } from "@/lib/types";
import { parseMapsLink, parseNaturalLanguage, parseUrl, parseImage, createQuickAddItem, detectQuickAddMode } from "@/lib/quickAdd";
import IdentifyCandidatesModal from "@/components/IdentifyCandidatesModal";

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

interface PickedPhoto { uri: string; base64: string; mimeType: string }

/** "+  Add item" → Quick add: create an item from anything pasted or
 * attached — a Google Maps link, a plain sentence, any other URL, or a
 * photo (a booking confirmation, a ticket) — then hand straight into the
 * same identify-item/research-item review flow the plain new-item form
 * uses. One input auto-detects which of the three text-based pipelines it
 * is (see detectQuickAddMode); a photo is its own separate path via the
 * camera/gallery buttons, mutually exclusive with the text input. */
export default function QuickAddModal({ visible, onClose, tripId, fallbackDayId, tripStart, tripEnd, onDone }: Props) {
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIdentify, setPendingIdentify] = useState<{ id: string; title: string; trip_id: string; extraContext?: string } | null>(null);
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  function reset() {
    setText("");
    setPhoto(null);
    setError(null);
    setLoading(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function pickPhoto(source: "camera" | "gallery") {
    const perm = source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", source === "camera" ? "Allow camera access to take a photo." : "Allow photo library access to pick a photo.");
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, base64: true };
    const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    if (!asset.base64) { setError("Couldn't read that photo."); return; }
    setError(null);
    setText("");
    setPhoto({ uri: asset.uri, base64: asset.base64, mimeType: asset.mimeType ?? "image/jpeg" });
  }

  async function submit() {
    setLoading(true);
    setError(null);

    if (photo) {
      const { result, error: err } = await parseImage(photo.base64, photo.mimeType);
      if (!result) { setLoading(false); setError(err ?? "Couldn't read that photo."); return; }
      const { id, error: createErr } = await createQuickAddItem({
        tripId, fallbackDayId, title: result.title, itemType: result.item_type,
        date: result.date, time: result.time, origin: "image",
      });
      setLoading(false);
      if (!id) { setError(createErr ?? "Couldn't create the item."); return; }
      reset();
      setPendingIdentify({ id, title: result.title, trip_id: tripId });
      return;
    }

    const value = text.trim();
    if (!value) return;
    const mode = detectQuickAddMode(value);

    if (mode === "maps_link") {
      const { result, error: err } = await parseMapsLink(value);
      if (!result) { setLoading(false); setError(err ?? "Couldn't read that link."); return; }
      const { id, error: createErr } = await createQuickAddItem({
        tripId, fallbackDayId, title: result.title, itemType: "other" as ItemType,
        date: null, time: null, latitude: result.latitude, longitude: result.longitude,
        origin: "google_link",
      });
      setLoading(false);
      if (!id) { setError(createErr ?? "Couldn't create the item."); return; }
      reset();
      setPendingIdentify({ id, title: result.title, trip_id: tripId });
    } else if (mode === "url") {
      const { result, error: err } = await parseUrl(value);
      if (!result) { setLoading(false); setError(err ?? "Couldn't read that link."); return; }
      const { id, error: createErr } = await createQuickAddItem({
        tripId, fallbackDayId, title: result.title, itemType: "other" as ItemType,
        date: null, time: null, origin: "url",
      });
      setLoading(false);
      if (!id) { setError(createErr ?? "Couldn't create the item."); return; }
      reset();
      setPendingIdentify({ id, title: result.title, trip_id: tripId, extraContext: result.pageText });
    } else {
      const { result, error: err } = await parseNaturalLanguage(value, tripStart, tripEnd);
      if (!result) { setLoading(false); setError(err ?? "Couldn't make sense of that."); return; }
      const { id, error: createErr } = await createQuickAddItem({
        tripId, fallbackDayId, title: result.title, itemType: result.item_type,
        date: result.date, time: result.time,
        origin: "natural_language",
      });
      setLoading(false);
      if (!id) { setError(createErr ?? "Couldn't create the item."); return; }
      reset();
      setPendingIdentify({ id, title: result.title, trip_id: tripId });
    }
  }

  const canSubmit = !loading && (!!photo || !!text.trim());

  return (
    <>
      <Modal visible={visible && !pendingIdentify} transparent animationType="slide" onRequestClose={handleClose}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
          <View style={styles.sheet}>
            <Text style={styles.title}>Quick add</Text>

            {photo ? (
              <View style={styles.photoPreviewRow}>
                <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.photoPreviewLabel}>Photo attached</Text>
                  <Text style={styles.photoPreviewHint}>A booking confirmation, ticket, or flyer works best.</Text>
                </View>
                <Pressable style={styles.photoRemoveBtn} onPress={() => setPhoto(null)} disabled={loading}>
                  <Icon name="add" size={16} color={colors.inkSoft} style={{ transform: [{ rotate: "45deg" }] }} />
                </Pressable>
              </View>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  value={text}
                  onChangeText={setText}
                  placeholder="Paste a link, a confirmation, or describe it — e.g. “dinner at Shabour Fri 8pm”"
                  placeholderTextColor={colors.inkSoft}
                  autoCapitalize="sentences"
                  autoCorrect
                  multiline
                  editable={!loading}
                />
                <View style={styles.photoBtnRow}>
                  <Pressable style={styles.photoBtn} onPress={() => pickPhoto("camera")} disabled={loading}>
                    <Icon name="camera" size={16} color={colors.inkSoft} />
                    <Text style={styles.photoBtnText}>Camera</Text>
                  </Pressable>
                  <Pressable style={styles.photoBtn} onPress={() => pickPhoto("gallery")} disabled={loading}>
                    <Icon name="gallery" size={16} color={colors.inkSoft} />
                    <Text style={styles.photoBtnText}>Gallery</Text>
                  </Pressable>
                </View>
              </>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable style={[styles.submitBtn, !canSubmit && { opacity: 0.6 }]} onPress={submit} disabled={!canSubmit}>
              {loading ? <ActivityIndicator color={colors.paper} /> : <Text style={styles.submitBtnText}>Continue</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {pendingIdentify && (
        <IdentifyCandidatesModal
          visible
          item={pendingIdentify}
          tripWideCityContext
          extraContext={pendingIdentify.extraContext}
          onClose={() => { const id = pendingIdentify.id; setPendingIdentify(null); onDone(id); }}
          onQueued={() => { const id = pendingIdentify.id; setPendingIdentify(null); onDone(id); }}
        />
      )}
    </>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(11,30,61,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 16, paddingBottom: 32 },
  title: { fontFamily: fonts.display, fontSize: 17, color: colors.ink, marginBottom: 12 },
  input: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
    minHeight: 70, textAlignVertical: "top",
  },
  photoBtnRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  photoBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, flex: 1, justifyContent: "center",
    paddingVertical: 10, borderRadius: radius.md,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
  },
  photoBtnText: { color: colors.inkSoft, fontFamily: fonts.bodySemi, fontSize: 13 },
  photoPreviewRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 10,
  },
  photoThumb: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: colors.line },
  photoPreviewLabel: { color: colors.ink, fontFamily: fonts.bodySemi, fontSize: 14 },
  photoPreviewHint: { color: colors.inkSoft, fontSize: 11.5, marginTop: 2 },
  photoRemoveBtn: { padding: 6 },
  hint: { color: colors.inkSoft, fontSize: 12, marginTop: 6, fontStyle: "italic" },
  error: { color: colors.coral, fontSize: 13, marginTop: 10 },
  submitBtn: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 16 },
  submitBtnText: { color: colors.paper, fontWeight: "700", fontSize: 15 },
});
