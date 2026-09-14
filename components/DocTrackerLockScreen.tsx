import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { colors, fonts, radius } from "@/lib/theme";

/** A simple hand-drawn padlock — this app's curated icon set (components/icons/Icon.tsx)
 * has no lock glyph, and this is the only place one is needed. */
function LockGlyph({ size = 56, color = colors.blue }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path
        d="M20 28V20C20 12.268 25.373 6 32 6C38.627 6 44 12.268 44 20V28"
        stroke={color}
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
      />
      <Rect x="12" y="28" width="40" height="30" rx="6" fill={color} />
      <Rect x="29" y="38" width="6" height="12" rx="3" fill={colors.paperRaised} />
    </Svg>
  );
}

export default function DocTrackerLockScreen({
  checking,
  failed,
  onUnlock,
}: {
  checking: boolean;
  failed: boolean;
  onUnlock: () => void;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <LockGlyph />
      </View>
      <Text style={styles.title}>Doc Tracker is locked</Text>
      <Text style={styles.subtitle}>
        {failed
          ? "That didn't work — try again."
          : "Passport, ID, and visa photos are kept behind an extra check."}
      </Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={onUnlock}
        disabled={checking}
      >
        <Text style={styles.buttonText}>{checking ? "Checking…" : "Unlock"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.ink,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 20,
  },
  button: {
    backgroundColor: colors.blue,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: radius.lg,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    color: colors.paperRaised,
  },
});
