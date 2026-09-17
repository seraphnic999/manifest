// Design tokens for the v19 "Skyfare" redesign — cool paper base, icon-matched
// navy blue accent (#173B8F, the generated icon set's own default color),
// gold used sparingly for "next up" emphasis. Supersedes the old "boarding
// pass / departure board" palette (ink/amber) used through v17.
//
// v28 added dark mode (see lib/ThemeContext.tsx): `ink` and `paper` swap
// hex values between the two palettes by design — `paper` is always "the
// page background", `ink` is always "the main text color", and dark mode
// is literally paper=navy/ink=off-white where light mode is the reverse.
// Every other token keeps its light-mode role too (accent, soft tint,
// border) with a hand-picked dark-mode value chosen for contrast against a
// navy page rather than a mechanical inversion.
export interface ColorTokens {
  ink: string;
  inkSoft: string;
  paper: string;
  paperRaised: string;
  blue: string;
  blueSoft: string;
  gold: string;
  goldSoft: string;
  lightBlue: string;
  lightBlueSoft: string;
  coral: string;
  coralSoft: string;
  line: string;
  amber: string;
  amberSoft: string;
}

export const lightColors: ColorTokens = {
  ink: "#0B1E3D",
  inkSoft: "#5B6B85",
  paper: "#F7F9FC",
  paperRaised: "#FFFFFF",
  blue: "#173B8F",
  blueSoft: "#E1E7F4",
  gold: "#C9962E",
  goldSoft: "#F7ECD6",
  lightBlue: "#3E82D6",
  lightBlueSoft: "#DCEAFA",
  coral: "#D8503A",
  coralSoft: "#FBE2DC",
  line: "#E3E8F2",

  // Old names kept as aliases during the v19 migration so screens not yet
  // ported over don't hard-crash on an undefined color — remove once every
  // screen has been moved onto the names above.
  amber: "#C9962E",
  amberSoft: "#F7ECD6",
};

export const darkColors: ColorTokens = {
  // The literal swap the design asked for: dark mode's background is
  // light mode's ink navy, and dark mode's main text is light mode's
  // paper off-white.
  paper: "#0B1E3D",
  ink: "#F7F9FC",

  paperRaised: "#132A52", // one step lighter than paper — card/sheet elevation
  inkSoft: "#95A6C6", // secondary text, readable on navy without competing with ink
  line: "#28406E", // borders visible against both paper and paperRaised

  blue: "#5B93E8", // brightened — the light palette's #173B8F is too dark to read on navy
  blueSoft: "#1D3462",
  gold: "#D9A94A", // brightened slightly for the same reason
  goldSoft: "#4A3A1C",
  lightBlue: "#6FA3E8",
  lightBlueSoft: "#1B3055",
  coral: "#E8735E", // brightened for contrast on navy
  coralSoft: "#4A2A22",

  amber: "#D9A94A",
  amberSoft: "#4A3A1C",
};

// Legacy static export — the light palette, for the handful of call sites
// outside any component (e.g. lib/mapData.ts's default day color) that
// can't call useThemeColors() because hooks only work inside components.
// Everything that renders UI should get its colors from useThemeColors()
// (see lib/ThemeContext.tsx) instead, so it responds to the dark mode
// toggle — this export never changes with the theme.
export const colors = lightColors;

export const radius = { sm: 8, md: 12, lg: 14, xl: 20 };

export const fonts = {
  display: "Poppins_700Bold",
  displaySemi: "Poppins_600SemiBold",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemi: "Inter_600SemiBold",
  bodyBold: "Inter_700Bold",
  mono: "JetBrainsMono_600SemiBold", // times, prices, countdowns, confirmation codes
  monoBold: "JetBrainsMono_700Bold",
};
