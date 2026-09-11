// The user's generated travel-icon set (travel_app_icons_svg_thick.zip, v2),
// inlined as React Native SVG components — 64x64 viewBox, 3.8 stroke width,
// #173B8F default color, matching the source files exactly. Only "other"
// (a generic/misc glyph) has no source file yet and is hand-drawn as a
// placeholder — see the icon-picker proposal for what's still needed.
import Svg, { Path, Circle, Rect } from "react-native-svg";
import { ViewStyle } from "react-native";

export type IconName =
  | "flight" | "lodging" | "budget" | "packing"
  | "weatherSunny" | "weatherCloudy" | "weatherPartlyCloudy" | "weatherRainy"
  | "weatherSnowy" | "weatherThunderstorm" | "weatherWindy"
  | "countdown" | "map" | "currency" | "shopping" | "search" | "archive"
  | "menu" | "add" | "home" | "export" | "edit" | "share"
  | "overview" | "signOut" | "back" | "swap" | "check"
  | "transfer" | "transport" | "dining" | "activity" | "work" | "other" | "locate" | "warning"
  | "trash" | "duplicate" | "refresh" | "document" | "camera" | "gallery" | "forward"
  | "cafe" | "cocktail" | "museum" | "ship" | "star" | "user";

/** The subset of icons that make sense as a marker glyph on the map — used
 * to build the map-icon picker's grid. Excludes chrome (menu/home/back/
 * forward/edit/export/share/search/archive/swap/signOut/overview), weather,
 * and anything else that isn't a place/activity/transport concept. */
export const MAP_PICKER_ICONS: IconName[] = [
  "flight", "transfer", "transport", "ship", "lodging",
  "dining", "cafe", "cocktail", "shopping", "activity", "museum", "star",
  "work", "user", "locate", "budget", "other",
];

type Props = { name: IconName; size?: number; color?: string; strokeWidth?: number; style?: ViewStyle };

const commonStroke = { fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function renderPaths(name: IconName, color: string, strokeWidth: number) {
  const s = { ...commonStroke, stroke: color, strokeWidth };
  switch (name) {
    case "flight":
      return <>
        <Path d="M8 28 55 9 37 55 29 37 8 28Z" {...s} />
        <Path d="M29 37 55 9" {...s} />
        <Path d="M29 37 27 49 35 42" {...s} />
      </>;
    case "lodging":
      return <>
        <Path d="M10 50V27c0-4 3-7 7-7h30c4 0 7 3 7 7v23" {...s} />
        <Path d="M10 39h44" {...s} />
        <Path d="M18 39V32c0-3 2-5 5-5h7c3 0 5 2 5 5v7" {...s} />
        <Path d="M10 48h44" {...s} />
      </>;
    case "budget":
      return <>
        <Rect x="10" y="20" width="42" height="31" rx="7" {...s} />
        <Path d="M18 20 42 10c3-1 6 0 7 3l2 7" {...s} />
        <Path d="M46 31h9v11h-9a5.5 5.5 0 0 1 0-11Z" {...s} />
        <Circle cx="48" cy="36.5" r="1.5" fill={color} stroke="none" />
      </>;
    case "packing":
      return <>
        <Rect x="16" y="14" width="32" height="37" rx="8" {...s} />
        <Path d="M25 14V9c0-2 2-4 4-4h6c2 0 4 2 4 4v5" {...s} />
        <Path d="M25 25v14M32 25v14M39 25v14" {...s} />
        <Circle cx="22" cy="54" r="3" {...s} />
        <Circle cx="42" cy="54" r="3" {...s} />
      </>;
    case "weatherSunny":
      return <>
        <Circle cx="32" cy="32" r="10" {...s} />
        <Path d="M32 7v8M32 49v8M7 32h8M49 32h8M14.5 14.5l5.7 5.7M43.8 43.8l5.7 5.7M49.5 14.5l-5.7 5.7M20.2 43.8l-5.7 5.7" {...s} />
      </>;
    case "weatherCloudy":
      return <Path d="M16 47h31a9 9 0 0 0 1-18 13 13 0 0 0-24-5 11 11 0 0 0-8 23Z" {...s} />;
    case "weatherPartlyCloudy":
      return <>
        <Circle cx="23" cy="23" r="8" {...s} />
        <Path d="M23 8v5M10.5 13.5l3.5 3.5M8 23h5M13.5 35.5l3.5-3.5" {...s} />
        <Path d="M20 45h27a8 8 0 0 0 1-16 12 12 0 0 0-22-4 10 10 0 0 0-6 20Z" {...s} />
      </>;
    case "weatherRainy":
      return <>
        <Path d="M16 39h31a9 9 0 0 0 1-18 13 13 0 0 0-24-5 11 11 0 0 0-8 23Z" {...s} />
        <Path d="M22 46v8M32 46v10M42 46v8" {...s} />
      </>;
    case "weatherSnowy":
      return <>
        <Path d="M16 35h31a9 9 0 0 0 1-18 13 13 0 0 0-24-5 11 11 0 0 0-8 23Z" {...s} />
        <Path d="M32 40v18M24.2 44.5 39.8 53.5M39.8 44.5 24.2 53.5" {...s} />
        <Path d="m32 40-3 3M32 40l3 3M32 58l-3-3M32 58l3-3" {...s} />
      </>;
    case "weatherThunderstorm":
      return <>
        <Path d="M16 37h31a9 9 0 0 0 1-18 13 13 0 0 0-24-5 11 11 0 0 0-8 23Z" {...s} />
        <Path d="m34 35-8 13h7l-3 10 11-15h-7l4-8" {...s} />
      </>;
    case "weatherWindy":
      return <>
        <Path d="M8 22h30c5 0 7-8 2-10-3-1-5 1-5 3" {...s} />
        <Path d="M8 32h41c6 0 8-9 2-12-4-2-7 1-7 4" {...s} />
        <Path d="M8 42h27c5 0 7 8 2 10-3 1-5-1-5-3" {...s} />
      </>;
    case "countdown":
      return <>
        <Path d="M18 8h28M18 56h28" {...s} />
        <Path d="M20 8c0 11 4 16 12 24-8 8-12 13-12 24" {...s} />
        <Path d="M44 8c0 11-4 16-12 24 8 8 12 13 12 24" {...s} />
        <Path d="M26 50h12l-6-6-6 6Z" {...s} />
      </>;
    case "map":
      return <>
        <Path d="m8 17 15-6 18 6 15-6v39l-15 6-18-6-15 6V17Z" {...s} />
        <Path d="M23 11v39M41 17v39" {...s} />
        <Path d="M39 27c0 6-7 14-7 14s-7-8-7-14a7 7 0 1 1 14 0Z" {...s} />
        <Circle cx="32" cy="27" r="2.5" {...s} />
      </>;
    case "currency":
      return <>
        <Path d="M45 18a18 18 0 0 0-30 10" {...s} />
        <Path d="m39 12 7 5-5 7" {...s} />
        <Path d="M19 46a18 18 0 0 0 30-10" {...s} />
        <Path d="m25 52-7-5 5-7" {...s} />
        <Path d="M32 20v24M38 25c-2-2-4-3-7-3-4 0-7 2-7 5 0 7 14 4 14 11 0 3-3 5-7 5-3 0-6-1-8-3" {...s} />
      </>;
    case "shopping":
      return <>
        <Path d="M15 22h34l4 34H11l4-34Z" {...s} />
        <Path d="M23 24v-6a9 9 0 0 1 18 0v6" {...s} />
      </>;
    case "search":
      return <>
        <Circle cx="27" cy="27" r="15" {...s} />
        <Path d="m38 38 15 15" {...s} />
      </>;
    case "archive":
      return <>
        <Path d="m11 26 21-11 21 11-21 11-21-11Z" {...s} />
        <Path d="M14 30v20l18 9 18-9V30" {...s} />
        <Path d="M32 5v19" {...s} />
        <Path d="m25 17 7 7 7-7" {...s} />
      </>;
    case "menu":
      return <Path d="M12 18h40M12 32h40M12 46h40" {...s} />;
    case "add":
      return <Path d="M32 12v40M12 32h40" {...s} />;
    case "home":
      return <>
        <Path d="m8 30 24-21 24 21" {...s} />
        <Path d="M13 27v29h15V40h8v16h15V27" {...s} />
      </>;
    case "export":
      return <>
        <Path d="M39 10h13v13" {...s} />
        <Path d="m52 10-23 23" {...s} />
        <Path d="M44 35v18H12V21h18" {...s} />
      </>;
    case "edit":
      return <>
        <Path d="m14 48 3-11 26-26a6 6 0 0 1 8 8L25 45l-11 3Z" {...s} />
        <Path d="m39 15 10 10" {...s} />
        <Path d="m17 37 8 8" {...s} />
      </>;
    case "share":
      return <>
        <Circle cx="15" cy="32" r="6" {...s} />
        <Circle cx="48" cy="14" r="6" {...s} />
        <Circle cx="48" cy="50" r="6" {...s} />
        <Path d="m20 29 22-12M20 35l22 12" {...s} />
      </>;
    case "overview":
      return <>
        <Rect x="12" y="12" width="16" height="16" rx="3" {...s} />
        <Rect x="36" y="12" width="16" height="16" rx="3" {...s} />
        <Rect x="12" y="36" width="16" height="16" rx="3" {...s} />
        <Rect x="36" y="36" width="16" height="16" rx="3" {...s} />
      </>;
    case "signOut":
      return <>
        <Path d="M28 12H14a4 4 0 0 0-4 4v32a4 4 0 0 0 4 4h14" {...s} />
        <Path d="M34 32h20" {...s} />
        <Path d="m46 20 12 12-12 12" {...s} />
      </>;
    case "back":
      return <>
        <Path d="M54 32H14" {...s} />
        <Path d="m26 18-14 14 14 14" {...s} />
      </>;
    case "swap":
      return <>
        <Path d="M10 22h36" {...s} />
        <Path d="m34 10 12 12-12 12" {...s} />
        <Path d="M54 42H18" {...s} />
        <Path d="m30 30-12 12 12 12" {...s} />
      </>;
    case "check":
      return <Path d="m12 34 12 12 28-28" {...s} />;
    case "transfer":
      return <>
        <Path d="M18 38h28l-3-10a7 7 0 0 0-7-5H28a7 7 0 0 0-7 5l-3 10Z" {...s} />
        <Path d="M14 38h36a4 4 0 0 1 4 4v4H10v-4a4 4 0 0 1 4-4Z" {...s} />
        <Path d="M24 23h16" {...s} />
        <Circle cx="18" cy="48" r="3" {...s} />
        <Circle cx="46" cy="48" r="3" {...s} />
      </>;
    case "transport":
      return <>
        <Rect x="18" y="10" width="28" height="34" rx="7" {...s} />
        <Rect x="24" y="18" width="16" height="10" rx="2" {...s} />
        <Path d="M25 48 20 54M39 48l5 6M22 54h20" {...s} />
        <Circle cx="26" cy="35" r="2" {...s} />
        <Circle cx="38" cy="35" r="2" {...s} />
      </>;
    case "dining":
      return <>
        <Path d="M18 8v22c0 4 3 7 7 7v19" {...s} />
        <Path d="M12 8v12M18 8v12M24 8v12" {...s} />
        <Path d="M40 8v48" {...s} />
        <Path d="M40 8c8 5 8 15 0 20" {...s} />
      </>;
    case "activity":
      return <Path d="m8 46 14-18 10 10 12-18 12 26H8Z" {...s} />;
    case "work":
      return <>
        <Rect x="10" y="20" width="44" height="30" rx="5" {...s} />
        <Path d="M24 20v-4a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4" {...s} />
        <Path d="M10 32h44" {...s} />
      </>;
    case "other":
      return <>
        <Circle cx="16" cy="32" r="5" fill={color} stroke="none" />
        <Circle cx="32" cy="32" r="5" fill={color} stroke="none" />
        <Circle cx="48" cy="32" r="5" fill={color} stroke="none" />
      </>;
    case "locate":
      return <>
        <Path d="M32 56s-13-14-13-26a13 13 0 1 1 26 0c0 12-13 26-13 26Z" {...s} />
        <Circle cx="32" cy="30" r="5" {...s} />
      </>;
    case "warning":
      return <>
        <Path d="M32 10 56 52H8L32 10Z" {...s} />
        <Path d="M32 24v14" {...s} />
        <Circle cx="32" cy="45" r="2" fill={color} stroke="none" />
      </>;
    case "trash":
      return <>
        <Path d="M18 18h28" {...s} />
        <Path d="M24 18v-4h16v4" {...s} />
        <Rect x="20" y="18" width="24" height="34" rx="3" {...s} />
        <Path d="M28 26v18M36 26v18" {...s} />
      </>;
    case "duplicate":
      return <>
        <Rect x="14" y="18" width="24" height="30" rx="3" {...s} />
        <Rect x="26" y="14" width="24" height="30" rx="3" {...s} />
      </>;
    case "refresh":
      return <>
        <Path d="M46 20a18 18 0 0 0-28-2" {...s} />
        <Path d="m42 12 7 1-1 7" {...s} />
        <Path d="M18 44a18 18 0 0 0 28 2" {...s} />
        <Path d="m22 52-7-1 1-7" {...s} />
      </>;
    case "document":
      return <>
        <Path d="M18 10h20l10 10v34H18Z" {...s} />
        <Path d="M38 10v10h10" {...s} />
        <Path d="M24 34h16M24 42h12" {...s} />
      </>;
    case "camera":
      return <>
        <Path d="M16 22h8l3-5h10l3 5h8a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V26a4 4 0 0 1 4-4Z" {...s} />
        <Circle cx="32" cy="36" r="9" {...s} />
      </>;
    case "gallery":
      return <>
        <Rect x="10" y="16" width="44" height="32" rx="4" {...s} />
        <Path d="m18 40 9-9 8 8 6-6 9 9" {...s} />
        <Circle cx="22" cy="24" r="3" {...s} />
      </>;
    case "forward":
      return <>
        <Path d="M10 32h40" {...s} />
        <Path d="m38 18 14 14-14 14" {...s} />
      </>;
    case "cafe":
      return <>
        <Path d="M21 26h24v7a13 13 0 0 1-13 13h-5a13 13 0 0 1-13-13v-7a0 0 0 0 1 0 0Z" {...s} />
        <Path d="M38 28h5a7 7 0 0 1 0 14h-5" {...s} />
        <Path d="M18 49h26" {...s} />
        <Path d="M22 14c0 4-2 4-2 8M30 14c0 4-2 4-2 8M38 14c0 4-2 4-2 8" {...s} />
      </>;
    case "cocktail":
      return <>
        <Path d="M16 14h32L34 30v16" {...s} />
        <Path d="M22 54h20" {...s} />
        <Path d="M32 46v8" {...s} />
        <Path d="m41 18 7-7" {...s} />
        <Circle cx="50" cy="10" r="3" {...s} />
      </>;
    case "museum":
      return <>
        <Path d="M10 22h44L32 10 10 22Z" {...s} />
        <Path d="M14 22v20M24 22v20M34 22v20M44 22v20" {...s} />
        <Path d="M10 46h44M8 54h48" {...s} />
      </>;
    case "ship":
      return <>
        <Path d="M24 14h16v8h6l6 15H12l6-15h6v-8Z" {...s} />
        <Path d="M12 44c4 4 8 4 12 0 4 4 8 4 12 0 4 4 8 4 12 0 4 4 8 4 12 0" {...s} />
        <Path d="M28 14h8M26 22h12" {...s} />
      </>;
    case "star":
      return <Path d="m32 10 6.8 13.8 15.2 2.2-11 10.7 2.6 15.1L32 44.6 18.4 51.8 21 36.7 10 26l15.2-2.2L32 10Z" {...s} />;
    case "user":
      return <>
        <Circle cx="32" cy="22" r="10" {...s} />
        <Path d="M14 54c2-10 9-16 18-16s16 6 18 16" {...s} />
      </>;
  }
}

export default function Icon({ name, size = 20, color = "#173B8F", strokeWidth = 3.8, style }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" style={style}>
      {renderPaths(name, color, strokeWidth)}
    </Svg>
  );
}
