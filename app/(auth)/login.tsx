import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from "react-native";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert("Sign in failed", error.message);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>MANIFEST</Text>
      <Text style={styles.title}>Where next?</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Pressable style={styles.button} onPress={signIn} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Signing in…" : "Sign in"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: 24, justifyContent: "center" },
  eyebrow: { color: colors.amber, fontWeight: "600", letterSpacing: 2, fontSize: 12, marginBottom: 4 },
  title: { color: colors.ink, fontWeight: "800", fontSize: 28, marginBottom: 24 },
  input: {
    backgroundColor: colors.paperRaised,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 12,
  },
  button: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: colors.paper, fontWeight: "700" },
});
