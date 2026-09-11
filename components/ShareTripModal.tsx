import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Modal, ActivityIndicator } from "react-native";
import { Alert } from "@/lib/alert";
import { colors, radius } from "@/lib/theme";
import { fetchTripShares, shareTripWithEmail, unshareTrip, TripShare } from "@/lib/tripSharing";

export default function ShareTripModal({
  visible, onClose, tripId,
}: {
  visible: boolean;
  onClose: () => void;
  tripId: string;
}) {
  const [shares, setShares] = useState<TripShare[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    fetchTripShares(tripId).then(setShares).catch(() => {});
  }

  useEffect(() => { if (visible) load(); }, [visible, tripId]);

  async function addShare() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await shareTripWithEmail(tripId, email);
      setEmail("");
      load();
    } catch (e: any) {
      Alert.alert("Couldn't share trip", e.message ?? "Unknown error");
    }
    setBusy(false);
  }

  async function removeShare(inviteEmail: string) {
    setBusy(true);
    try {
      await unshareTrip(tripId, inviteEmail);
      load();
    } catch (e: any) {
      Alert.alert("Couldn't remove", e.message ?? "Unknown error");
    }
    setBusy(false);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={styles.title}>Share this trip</Text>
            <Text style={styles.hint}>
              Invite someone by email to co-edit this trip's itinerary, expenses, and shopping list.
            </Text>

            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={email}
                onChangeText={setEmail}
                placeholder="their@email.com"
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Pressable style={styles.addBtn} onPress={addShare} disabled={busy}>
                {busy ? <ActivityIndicator color={colors.paper} size="small" /> : <Text style={styles.addBtnText}>Invite</Text>}
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>Shared with</Text>
            {shares.map((s) => (
              <View key={s.invited_email} style={styles.shareRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shareEmail}>{s.invited_email}</Text>
                  <Text style={styles.shareStatus}>{s.shared_with_user_id ? "Active" : "Invited — pending sign-up"}</Text>
                </View>
                <Pressable onPress={() => removeShare(s.invited_email)} hitSlop={8}>
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            ))}
            {shares.length === 0 && <Text style={styles.empty}>Not shared with anyone yet.</Text>}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "80%",
    width: "100%", maxWidth: 480, alignSelf: "center",
  },
  title: { fontFamily: "Poppins_700Bold" as any, fontWeight: "800", fontSize: 18, color: colors.ink, marginBottom: 6 },
  hint: { color: colors.inkSoft, fontSize: 12, marginBottom: 14, lineHeight: 17 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
  },
  addBtn: { backgroundColor: colors.ink, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 12 },
  addBtnText: { color: colors.paper, fontWeight: "700", fontSize: 13 },
  sectionLabel: {
    color: colors.inkSoft, fontWeight: "700", fontSize: 12,
    textTransform: "uppercase", letterSpacing: 1, marginTop: 20, marginBottom: 8,
  },
  shareRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginBottom: 6,
  },
  shareEmail: { color: colors.ink, fontWeight: "600", fontSize: 13 },
  shareStatus: { color: colors.inkSoft, fontSize: 11, marginTop: 2 },
  removeText: { color: colors.coral, fontWeight: "700", fontSize: 12 },
  empty: { color: colors.inkSoft, fontSize: 12, fontStyle: "italic" },
});
