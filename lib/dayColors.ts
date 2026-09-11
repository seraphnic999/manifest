// Palette sourced from the user's own color-picker reference image (two
// rows of 13 hues — a darker and a lighter shade each — plus a 4-step
// grayscale row). Every swatch below is copied verbatim (exact hex) from
// that image, so this is the single source of truth for both the
// selectable grid and the automatic per-day assignment.
export interface ColorSwatch {
  hex: string;
  label: string;
}

export const DAY_COLOR_SWATCHES: ColorSwatch[] = [
  // Row 1 — darker shade of each hue
  { hex: "#880E4F", label: "Dark pink" },
  { hex: "#A52714", label: "Dark red" },
  { hex: "#E65100", label: "Dark orange" },
  { hex: "#F9A825", label: "Amber" },
  { hex: "#FFD600", label: "Yellow" },
  { hex: "#817717", label: "Olive" },
  { hex: "#558B2F", label: "Dark green" },
  { hex: "#097138", label: "Forest green" },
  { hex: "#006064", label: "Dark teal" },
  { hex: "#01579B", label: "Dark blue" },
  { hex: "#1A237E", label: "Indigo" },
  { hex: "#673AB7", label: "Dark purple" },
  { hex: "#4E342E", label: "Dark brown" },
  // Row 2 — lighter shade of each hue
  { hex: "#C2185B", label: "Pink" },
  { hex: "#FF5252", label: "Red" },
  { hex: "#F57C00", label: "Orange" },
  { hex: "#FBC02D", label: "Gold" },
  { hex: "#FFEA00", label: "Bright yellow" },
  { hex: "#AFB42B", label: "Yellow-green" },
  { hex: "#7CB342", label: "Green" },
  { hex: "#0F9D58", label: "Bright green" },
  { hex: "#0097A7", label: "Teal" },
  { hex: "#0288D1", label: "Blue" },
  { hex: "#3949AB", label: "Blue-indigo" },
  { hex: "#9C27B0", label: "Purple" },
  { hex: "#795548", label: "Brown" },
  // Grayscale
  { hex: "#BDBDBD", label: "Light gray" },
  { hex: "#757575", label: "Gray" },
  { hex: "#424242", label: "Dark gray" },
  { hex: "#000000", label: "Black" },
];

// The sequence auto-assigned to a new trip's days, in order — day 1 gets
// index 0, day 2 index 1, and so on, cycling once a trip runs longer than
// this. The first four (red, bright green, amber, purple) are fixed, per
// the existing app-wide convention; the rest continue through the same
// reference palette, skipping pure yellow (poor contrast on the map's
// light background).
export const AUTO_DAY_COLORS: string[] = [
  "#A52714", // red
  "#0F9D58", // bright green
  "#F9A825", // amber
  "#9C27B0", // purple
  "#880E4F", // dark pink
  "#01579B", // dark blue
  "#006064", // dark teal
  "#4E342E", // dark brown
  "#E65100", // dark orange
  "#1A237E", // indigo
  "#558B2F", // dark green
  "#817717", // olive
  "#757575", // gray
];

export function autoColorForDayIndex(index: number): string {
  return AUTO_DAY_COLORS[index % AUTO_DAY_COLORS.length];
}
