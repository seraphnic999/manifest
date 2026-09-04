// Ambient module for CSS side-effect imports (e.g. maplibre-gl's stylesheet),
// which Expo's web build extracts as a static asset but TS has no types for.
declare module "*.css";
