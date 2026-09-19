// Public, unauthenticated read-only trip view — the layout for the whole
// /share/[token] route group. Owns the one payload fetch (and the PIN gate
// in front of it) and hands the result to every child screen via context,
// so Overview/Day/Map don't each re-fetch or re-implement the gate. See
// app/_layout.tsx's auth-redirect exemption for the "share" segment, and
// supabase/functions/share-trip-data for what's fetched and what's
// deliberately excluded (companions, documents, expenses, packing/shopping,
// private items).
import { createContext, useContext, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, TextInput } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { radius, fonts, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import Icon from "@/components/icons/Icon";
import { SharePayload, fetchSharePayload, readStoredPin } from "@/lib/shareTypes";

const SharePayloadContext = createContext<SharePayload | null>(null);

/** Every screen inside app/share/[token]/ reads the already-fetched payload
 * through this instead of fetching its own — there is exactly one network
 * call for the whole route group, made here in the layout. */
export function useSharePayload(): SharePayload {
  const payload = useContext(SharePayloadContext);
  if (!payload) throw new Error("useSharePayload() called outside the share route group");
  return payload;
}

export default function ShareLayout() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const colors = useThemeColors();
  const styles = makeStyles(colors);

  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  async function load(pin?: string) {
    if (!token) return;
    setLoading(true);
    setPinError(false);
    const result = await fetchSharePayload(token, pin);
    if (result.kind === "not_found") {
      setNotFound(true);
    } else if (result.kind === "pin_required") {
      setPinRequired(true);
      if (result.wrongPin) setPinError(true);
    } else {
      setPinRequired(false);
      setPayload(result.payload);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!token) return;
    load(readStoredPin(token));
  }, [token]);

  if (loading && !payload) {
    return (
      <View style={[styles.center, { backgroundColor: colors.paper }]}>
        <ActivityIndicator color={colors.blue} size="large" />
      </View>
    );
  }

  if (notFound) {
    return (
      <View style={[styles.center, { backgroundColor: colors.paper, padding: 24 }]}>
        <Icon name="warning" size={32} color={colors.inkSoft} />
        <Text style={styles.notFoundTitle}>This link isn't available</Text>
        <Text style={styles.notFoundHint}>It may have been turned off or never existed. Ask whoever sent it for a new one.</Text>
      </View>
    );
  }

  if (pinRequired) {
    return (
      <View style={[styles.center, { backgroundColor: colors.paper, padding: 24 }]}>
        <Icon name="document" size={32} color={colors.blue} />
        <Text style={styles.notFoundTitle}>Enter the PIN to view this trip</Text>
        <TextInput
          style={styles.pinInput}
          value={pinInput}
          onChangeText={(t) => setPinInput(t.replace(/[^0-9]/g, ""))}
          placeholder="PIN"
          placeholderTextColor={colors.inkSoft}
          keyboardType="number-pad"
          maxLength={10}
          secureTextEntry
        />
        {pinError && <Text style={styles.pinError}>That PIN isn't right — try again.</Text>}
        <Pressable style={styles.pinSubmit} onPress={() => load(pinInput.trim())} disabled={pinInput.length < 4}>
          <Text style={styles.pinSubmitText}>View trip</Text>
        </Pressable>
      </View>
    );
  }

  if (!payload) return null;

  return (
    <SharePayloadContext.Provider value={payload}>
      <Stack screenOptions={{ headerShown: false }} />
    </SharePayloadContext.Provider>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  notFoundTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 17, textAlign: "center", marginTop: 8 },
  notFoundHint: { color: colors.inkSoft, fontSize: 13, textAlign: "center", marginTop: 4, maxWidth: 320 },
  pinInput: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    padding: 14, fontSize: 20, color: colors.ink, textAlign: "center", width: 200, marginTop: 14, letterSpacing: 4,
  },
  pinError: { color: colors.coral, fontSize: 12.5, marginTop: 6 },
  pinSubmit: { backgroundColor: colors.ink, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 28, marginTop: 14 },
  pinSubmitText: { color: colors.paper, fontWeight: "700", fontSize: 14 },
});
