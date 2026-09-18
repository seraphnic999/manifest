import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Modal, ActivityIndicator, Switch, Share } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Alert } from "@/lib/alert";
import { radius, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import {
  TripShareLink, fetchShareLink, getOrCreateShareLink, setShareLinkEnabled,
  regenerateShareLink, setSharePin, shareLinkUrl,
} from "@/lib/tripPublicSharing";

export default function SharePublicLinkModal({
  visible, onClose, tripId, tripName,
}: {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  tripName: string;
}) {
  const [link, setLink] = useState<TripShareLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const queryClient = useQueryClient();
  // The "shared" badge (trip overview header, Home trip cards) reads the
  // same ["tripShareLink", tripId] query — invalidating it after every
  // mutation here is what keeps those badges in sync without any direct
  // wiring back to this modal.
  const shareLinkQueryKey = ["tripShareLink", tripId];
  function invalidateShareLink() {
    queryClient.invalidateQueries({ queryKey: shareLinkQueryKey });
  }

  function load() {
    setLoading(true);
    fetchShareLink(tripId).then((l) => { setLink(l); setPinInput(""); }).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => { if (visible) load(); }, [visible, tripId]);

  async function handleToggleEnabled(next: boolean) {
    setBusy(true);
    try {
      if (next) setLink(await getOrCreateShareLink(tripId));
      else { await setShareLinkEnabled(tripId, false); load(); }
      invalidateShareLink();
    } catch (e: any) {
      Alert.alert("Couldn't update sharing", e.message ?? "Unknown error");
    }
    setBusy(false);
  }

  async function handleCopy() {
    if (!link) return;
    await Clipboard.setStringAsync(shareLinkUrl(link.token));
    Alert.alert("Copied", "The link is on your clipboard.");
  }

  async function handleWhatsApp() {
    if (!link) return;
    await Share.share({ message: `${tripName} — follow along: ${shareLinkUrl(link.token)}` });
  }

  function handleRegenerate() {
    Alert.alert(
      "Regenerate link?",
      "The current link will stop working — anyone you already sent it to will need the new one.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Regenerate", style: "destructive", onPress: async () => {
            setBusy(true);
            try { setLink(await regenerateShareLink(tripId)); invalidateShareLink(); }
            catch (e: any) { Alert.alert("Couldn't regenerate", e.message ?? "Unknown error"); }
            setBusy(false);
          },
        },
      ]
    );
  }

  async function handleSetPin() {
    const digits = pinInput.trim();
    if (!/^[0-9]{4,}$/.test(digits)) {
      Alert.alert("Invalid PIN", "Enter at least 4 digits, numbers only.");
      return;
    }
    setBusy(true);
    try {
      await setSharePin(tripId, digits);
      setPinInput("");
      load();
      invalidateShareLink();
    } catch (e: any) {
      Alert.alert("Couldn't set PIN", e.message ?? "Unknown error");
    }
    setBusy(false);
  }

  async function handleClearPin() {
    setBusy(true);
    try { await setSharePin(tripId, null); load(); invalidateShareLink(); }
    catch (e: any) { Alert.alert("Couldn't clear PIN", e.message ?? "Unknown error"); }
    setBusy(false);
  }

  const enabled = !!link?.enabled;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={styles.title}>Share Link</Text>
            <Text style={styles.hint}>
              A read-only web link anyone can open — no account needed — showing the itinerary, weather, flights and map. It updates as you edit the trip.
            </Text>

            {loading ? (
              <ActivityIndicator color={colors.blue} style={{ marginTop: 20 }} />
            ) : (
              <>
                <View style={styles.enableRow}>
                  <Text style={styles.enableLabel}>Enable public link</Text>
                  <Switch value={enabled} onValueChange={handleToggleEnabled} disabled={busy} />
                </View>

                {enabled && link && (
                  <>
                    <View style={styles.urlBox}>
                      <Text style={styles.urlText} numberOfLines={1}>{shareLinkUrl(link.token)}</Text>
                    </View>

                    <View style={styles.actionsRow}>
                      <Pressable style={styles.actionBtn} onPress={handleCopy} disabled={busy}>
                        <Text style={styles.actionBtnText}>Copy Link</Text>
                      </Pressable>
                      <Pressable style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={handleWhatsApp} disabled={busy}>
                        <Text style={styles.actionBtnPrimaryText}>Share via WhatsApp</Text>
                      </Pressable>
                    </View>

                    <Pressable onPress={handleRegenerate} disabled={busy} style={{ marginTop: 14 }}>
                      <Text style={styles.regenerateText}>Regenerate link</Text>
                    </Pressable>

                    <Text style={styles.sectionLabel}>PIN protection</Text>
                    {link.pin_hash ? (
                      <View style={styles.shareRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.pinStatus}>A PIN is required to view this link.</Text>
                        </View>
                        <Pressable onPress={handleClearPin} disabled={busy} hitSlop={8}>
                          <Text style={styles.removeText}>Clear</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <View style={styles.row}>
                        <TextInput
                          style={[styles.input, { flex: 1 }]}
                          value={pinInput}
                          onChangeText={(t) => setPinInput(t.replace(/[^0-9]/g, ""))}
                          placeholder="4+ digit PIN (optional)"
                          placeholderTextColor={colors.inkSoft}
                          keyboardType="number-pad"
                          maxLength={10}
                        />
                        <Pressable style={styles.addBtn} onPress={handleSetPin} disabled={busy || pinInput.length < 4}>
                          <Text style={styles.addBtnText}>Set</Text>
                        </Pressable>
                      </View>
                    )}
                  </>
                )}
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%",
    width: "100%", maxWidth: 480, alignSelf: "center",
  },
  title: { fontFamily: "Poppins_700Bold" as any, fontWeight: "800", fontSize: 18, color: colors.ink, marginBottom: 6 },
  hint: { color: colors.inkSoft, fontSize: 12, marginBottom: 14, lineHeight: 17 },
  enableRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 14,
  },
  enableLabel: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  urlBox: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, marginTop: 14,
  },
  urlText: { color: colors.blue, fontSize: 13 },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  actionBtn: {
    flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paperRaised,
  },
  actionBtnText: { color: colors.ink, fontWeight: "700", fontSize: 13 },
  actionBtnPrimary: { backgroundColor: colors.ink, borderColor: colors.ink },
  actionBtnPrimaryText: { color: colors.paper, fontWeight: "700", fontSize: 13 },
  regenerateText: { color: colors.coral, fontWeight: "700", fontSize: 12.5, textAlign: "center" },
  sectionLabel: {
    color: colors.inkSoft, fontWeight: "700", fontSize: 12,
    textTransform: "uppercase", letterSpacing: 1, marginTop: 22, marginBottom: 8,
  },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
  },
  addBtn: { backgroundColor: colors.ink, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 12 },
  addBtnText: { color: colors.paper, fontWeight: "700", fontSize: 13 },
  shareRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12,
  },
  pinStatus: { color: colors.ink, fontSize: 13 },
  removeText: { color: colors.coral, fontWeight: "700", fontSize: 12 },
});
