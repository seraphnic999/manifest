// Design tokens for the v19 "Skyfare" redesign — cool paper base, icon-matched
// navy blue accent (#173B8F, the generated icon set's own default color),
// gold used sparingly for "next up" emphasis. Supersedes the old "boarding
// pass / departure board" palette (ink/amber) used through v17.
export const colors = {
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
