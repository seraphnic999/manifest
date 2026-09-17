// App-wide dark mode. This is a user preference toggled from the Settings
// screen, independent of the device's own system light/dark setting (the
// app already forces userInterfaceStyle "light" in app.json) — so it's
// stored locally via AsyncStorage rather than following useColorScheme().
import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
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

  function setMode(next: ThemeMode) {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
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
