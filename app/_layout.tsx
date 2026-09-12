import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { Session } from "@supabase/supabase-js";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, Platform, StyleSheet, I18nManager } from "react-native";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts, Poppins_600SemiBold, Poppins_700Bold } from "@expo-google-fonts/poppins";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { JetBrainsMono_600SemiBold, JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";
import { supabase } from "@/lib/supabase";
import { claimPendingTripShares } from "@/lib/tripSharing";
import { registerPushToken } from "@/lib/reminders";
import { colors } from "@/lib/theme";
import { queryClient } from "@/lib/queryClient";
import ErrorBoundary from "@/components/ErrorBoundary";

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "MANIFEST_QUERY_CACHE",
});

// This app has no RTL-specific design (no Hebrew/Arabic UI text — the ₪
// symbol is just a currency glyph). But React Native auto-mirrors every
// flexDirection:"row" layout when the device's system language is RTL
// (e.g. Hebrew), which flips things like the day-view row layout (drag
// handle/time-column swap sides) in ways nothing in this codebase accounts
// for. Force LTR regardless of device locale. Native requires a full app
// restart after this changes anything (I18nManager caches the RTL flag at
// native-module init, before this JS runs) — a no-op if already LTR.
if (I18nManager.isRTL) {
  I18nManager.allowRTL(false);
  I18nManager.forceRTL(false);
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const router = useRouter();
  const segments = useSegments();
  const [fontsLoaded] = useFonts({
    Poppins_600SemiBold, Poppins_700Bold,
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
    JetBrainsMono_600SemiBold, JetBrainsMono_700Bold,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        claimPendingTripShares().catch(() => {});
        if (Platform.OS !== "web") registerPushToken();
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        claimPendingTripShares().catch(() => {});
        if (Platform.OS !== "web") registerPushToken();
      }
    });
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

  // Deliberately NOT gating the return on fontsLoaded here: the Stack below
  // is expo-router's root navigator, and the auth redirect effect above can
  // call router.replace() before this component's first render finishes —
  // if that render returned null instead of the Stack, expo-router throws
  // ("Attempted to navigate before mounting the Root Layout component").
  // Text using a not-yet-loaded custom font just shows the system font for
  // a frame or two, then swaps in once useFonts resolves — not worth the
  // navigator race to avoid that.

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: asyncStoragePersister, maxAge: 7 * 24 * 60 * 60 * 1000 }}
    >
      <GestureHandlerRootView style={styles.outer}>
        <View style={styles.inner}>
          <ErrorBoundary>
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
          </ErrorBoundary>
        </View>
      </GestureHandlerRootView>
    </PersistQueryClientProvider>
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
