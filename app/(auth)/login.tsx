import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Image } from "react-native";
import { Alert } from "@/lib/alert";
import { supabase } from "@/lib/supabase";
import { colors, radius, fonts } from "@/lib/theme";

type Mode = "signin" | "signup";

export default function Login() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // Set only after a signup that requires email confirmation (no session
  // came back yet) — shown instead of the form until the user switches
  // back to sign in.
  const [confirmEmailSentTo, setConfirmEmailSentTo] = useState<string | null>(null);

  async function signIn() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert("Sign in failed", error.message);
    // On success, app/_layout.tsx's onAuthStateChange listener picks up the
    // new session and redirects away from this screen automatically.
  }

  async function signUp() {
    if (password.length < 6) {
      Alert.alert("Password too short", "Use at least 6 characters.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert("Sign up failed", error.message);
      return;
    }
    if (data.session) {
      // Email confirmation is off for this project — already signed in;
      // the auth listener in app/_layout.tsx takes it from here.
      return;
    }
    // Confirmation required: nothing more to do until that email is opened.
    setConfirmEmailSentTo(email);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setConfirmEmailSentTo(null);
  }

  if (confirmEmailSentTo) {
    return (
      <View style={styles.container}>
        <Image source={require("../../assets/icon.png")} style={styles.logo} />
        <Text style={styles.eyebrow}>MANIFEST</Text>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.confirmBody}>
          We sent a confirmation link to {confirmEmailSentTo}. Open it, then come back and sign in.
        </Text>
        <Pressable style={styles.button} onPress={() => switchMode("signin")}>
          <Text style={styles.buttonText}>Back to sign in</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Image source={require("../../assets/icon.png")} style={styles.logo} />
      <Text style={styles.eyebrow}>MANIFEST</Text>
      <Text style={styles.title}>{mode === "signin" ? "Where next?" : "Create account"}</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.inkSoft}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={colors.inkSoft}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Pressable
        style={styles.button}
        onPress={mode === "signin" ? signIn : signUp}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? (mode === "signin" ? "Signing in…" : "Creating account…") : (mode === "signin" ? "Sign in" : "Create account")}
        </Text>
      </Pressable>

      <Pressable style={styles.switchRow} onPress={() => switchMode(mode === "signin" ? "signup" : "signin")}>
        <Text style={styles.switchText}>
          {mode === "signin" ? "New here? " : "Already have an account? "}
          <Text style={styles.switchTextLink}>{mode === "signin" ? "Create an account" : "Sign in"}</Text>
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: 24, justifyContent: "center" },
  logo: { width: 68, height: 68, marginBottom: 18, borderRadius: radius.lg },
  eyebrow: { color: colors.blue, fontFamily: fonts.bodyBold, letterSpacing: 2, fontSize: 12, marginBottom: 6 },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 34, marginBottom: 28 },
  input: {
    backgroundColor: colors.paperRaised,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 12,
    color: colors.ink,
  },
  button: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: colors.paper, fontFamily: fonts.bodyBold, fontSize: 15 },
  switchRow: { alignItems: "center", padding: 14, marginTop: 4 },
  switchText: { color: colors.inkSoft, fontSize: 13 },
  switchTextLink: { color: colors.blue, fontFamily: fonts.bodyBold },
  confirmBody: { color: colors.inkSoft, fontSize: 14, lineHeight: 20, marginBottom: 24 },
});
