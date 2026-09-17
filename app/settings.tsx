import { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Switch } from "react-native";
import { Stack } from "expo-router";
import { Alert } from "@/lib/alert";
import { supabase } from "@/lib/supabase";
import { setHasCheckedLaunchRedirect } from "@/lib/launchRedirect";
import { radius, fonts, ColorTokens } from "@/lib/theme";
import { useTheme } from "@/lib/ThemeContext";
import SubpageHeader from "@/components/SubpageHeader";
import Icon from "@/components/icons/Icon";

export default function Settings() {
  const { mode, colors, toggleMode } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isDark = mode === "dark";

  function signOut() {
    Alert.alert("Sign out", "Sign out of Manifest?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out", style: "destructive",
        onPress: () => {
          setHasCheckedLaunchRedirect(false);
          supabase.auth.signOut();
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SubpageHeader title="Settings" />

      <View style={styles.body}>
        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.row}>
          <View style={styles.rowIcon}>
            <Icon name="settings" size={20} color={colors.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Dark mode</Text>
            <Text style={styles.rowSub}>Applies across the whole app</Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleMode}
            trackColor={{ false: colors.line, true: colors.blue }}
            thumbColor={colors.paperRaised}
          />
        </View>

        <Text style={styles.sectionLabel}>Account</Text>
        <Pressable style={[styles.row, styles.signOutRow]} onPress={signOut}>
          <View style={styles.rowIcon}>
            <Icon name="signOut" size={20} color={colors.coral} />
          </View>
          <Text style={[styles.rowLabel, { color: colors.coral }]}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  body: { padding: 16 },
  sectionLabel: {
    color: colors.inkSoft, fontFamily: fonts.bodyBold, fontSize: 11.5, textTransform: "uppercase",
    letterSpacing: 1, marginBottom: 8, marginTop: 16,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 14,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.paper,
    alignItems: "center", justifyContent: "center",
  },
  rowLabel: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 15 },
  rowSub: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
  signOutRow: { borderColor: colors.coral },
});
