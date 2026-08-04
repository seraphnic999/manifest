import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { Session } from "@supabase/supabase-js";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, Platform, StyleSheet } from "react-native";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return; // still loading
    const inAuthGroup = segments[0] === "(auth)";
    if (!session && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (session && inAuthGroup) {
      router.replace("/");
    }
  }, [session, segments]);

  return (
    <GestureHandlerRootView style={styles.outer}>
      <View style={styles.inner}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.paperRaised },
            headerTintColor: colors.ink,
            headerTitleStyle: { fontWeight: "700" },
            headerBackTitle: "Back",
            contentStyle: { backgroundColor: colors.paper },
          }}
        >
          <Stack.Screen name="index" options={{ title: "Trips" }} />
          <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
        </Stack>
      </View>
    </GestureHandlerRootView>
  );
}

// On web, a full-bleed stretched layout is hard to read on a wide monitor —
// this app's design is mobile-first, so on web we constrain it to a
// phone-like column with neutral space on either side. Native (Android)
// ignores this entirely (maxWidth: undefined there).
const styles = StyleSheet.create({
  outer: {
    flex: 1,
    ...(Platform.OS === "web" ? { alignItems: "center" as const, backgroundColor: "#DDD6C6" } : {}),
  },
  inner: {
    flex: 1,
    width: "100%",
    ...(Platform.OS === "web" ? { maxWidth: 480, backgroundColor: colors.paper } : {}),
  },
});
