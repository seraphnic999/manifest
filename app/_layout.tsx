import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { Session } from "@supabase/supabase-js";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, Platform, StyleSheet, I18nManager } from "react-native";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { claimPendingTripShares } from "@/lib/tripSharing";
import { colors } from "@/lib/theme";
import { queryClient } from "@/lib/queryClient";

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) claimPendingTripShares().catch(() => {});
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) claimPendingTripShares().catch(() => {});
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

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: asyncStoragePersister, maxAge: 7 * 24 * 60 * 60 * 1000 }}
    >
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
