// App-wide dark mode. This is a user preference toggled from the Settings
// screen, independent of the device's own system light/dark setting (the
// app already forces userInterfaceStyle "light" in app.json).
//
// Synced remotely (migration_042's user_settings table) so signing into
// the same account on a second device picks up the same preference —
// AsyncStorage still caches the last-known value locally so the app paints
// the right theme immediately on launch instead of flashing light mode
// while the one network round trip to fetch the remote value is in
// flight. That fetch happens once per app session (on mount, and again on
// sign-in) per the "just load it once" requirement — this deliberately
// does NOT keep polling or subscribe to realtime changes, so a toggle on
// another device won't appear here until this app is relaunched or signed
// in again. Every local toggle writes straight through to the same row.
import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { lightColors, darkColors, ColorTokens } from "./theme";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "MANIFEST_THEME_MODE";

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ColorTokens;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "light",
  colors: lightColors,
  setMode: () => {},
  toggleMode: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("light");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === "dark" || saved === "light") setModeState(saved);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    // getSession() (not getUser()) deliberately — it's the call that waits
    // for the Supabase client to finish rehydrating a persisted session
    // from its own storage, so this doesn't race that restore and read
    // "signed out" on a cold launch that's actually about to sign back in.
    async function loadRemote() {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId || cancelled) return;
      const { data } = await supabase.from("user_settings").select("dark_mode").eq("user_id", userId).maybeSingle();
      if (!data || cancelled) return;
      const remoteMode: ThemeMode = data.dark_mode ? "dark" : "light";
      setModeState(remoteMode);
      AsyncStorage.setItem(STORAGE_KEY, remoteMode).catch(() => {});
    }
    loadRemote();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") loadRemote();
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  function setMode(next: ThemeMode) {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
    supabase.auth.getSession().then(({ data: { session } }) => {
      const userId = session?.user?.id;
      if (!userId) return;
      supabase.from("user_settings").upsert({ user_id: userId, dark_mode: next === "dark" }).then();
    });
  }
  function toggleMode() {
    setMode(mode === "dark" ? "light" : "dark");
  }

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, colors: mode === "dark" ? darkColors : lightColors, setMode, toggleMode }),
    [mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** The common case — a component that only needs the current palette, not
 * the mode flag or the setters. `const colors = useThemeColors();` reads
 * as a drop-in replacement for the old `import { colors } from
 * "@/lib/theme"`, so every screen's existing `colors.xxx` references keep
 * working unchanged once this line shadows the static import. */
export function useThemeColors(): ColorTokens {
  return useContext(ThemeContext).colors;
}
