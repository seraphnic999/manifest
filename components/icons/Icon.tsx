// The user's generated travel-icon set (travel-icons-svg.zip), inlined as
// React Native SVG components — 64x64 viewBox, 3.2 stroke width, matching
// the source files exactly: flight, lodging, budget, packing, the 7
// weather icons, countdown, map, currency, shopping, search, archive,
// menu, add, home, export, edit, share. Every other name in IconName below
// is hand-drawn (not from that set) to approximate its weight/rounding —
// a placeholder until a matching icon is generated for it.
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
  | "trash" | "duplicate" | "refresh" | "document" | "camera" | "gallery" | "forward";

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
        <Rect x="8" y="8" width="20" height="20" rx="4" {...s} />
        <Rect x="36" y="8" width="20" height="20" rx="4" {...s} />
        <Rect x="8" y="36" width="20" height="20" rx="4" {...s} />
        <Rect x="36" y="36" width="20" height="20" rx="4" {...s} />
      </>;
    case "signOut":
      return <>
        <Path d="M26 10H14a4 4 0 0 0-4 4v36a4 4 0 0 0 4 4h12" {...s} />
        <Path d="M34 32h22M48 22l10 10-10 10" {...s} />
      </>;
    case "back":
      return <Path d="M38 12 18 32l20 20" {...s} />;
    case "swap":
      return <>
        <Path d="M20 14v30M20 44l-9-9M20 44l9-9" {...s} />
        <Path d="M44 50V20M44 20l9 9M44 20l-9 9" {...s} />
      </>;
    case "check":
      return <Path d="M14 33l12 12 24-26" fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />;
    case "transfer":
      return <>
        <Path d="M10 42 12 28c1-3 4-5 7-5h26c3 0 6 2 7 5l2 14" {...s} />
        <Path d="M6 42h52" {...s} />
        <Circle cx="18" cy="46" r="5" {...s} />
        <Circle cx="46" cy="46" r="5" {...s} />
      </>;
    case "transport":
      return <>
        <Rect x="8" y="14" width="48" height="30" rx="6" {...s} />
        <Path d="M8 34h48" {...s} />
        <Path d="M18 20v10M32 20v10M46 20v10" {...s} />
        <Circle cx="18" cy="50" r="5" {...s} />
        <Circle cx="46" cy="50" r="5" {...s} />
      </>;
    case "dining":
      return <>
        <Path d="M14 8v14M18 8v14M22 8v14" {...s} />
        <Path d="M18 22v34" {...s} />
        <Path d="M44 8c8 3 10 10 6 16l-6 4v28" {...s} />
      </>;
    case "activity":
      return <>
        <Path d="M8 50 24 20l10 16 6-8 16 22Z" {...s} />
        <Circle cx="46" cy="16" r="6" {...s} />
      </>;
    case "work":
      return <>
        <Rect x="10" y="24" width="44" height="28" rx="5" {...s} />
        <Path d="M24 24v-6c0-3 2-5 5-5h6c3 0 5 2 5 5v6" {...s} />
        <Path d="M10 36h44" {...s} />
      </>;
    case "other":
      return <>
        <Circle cx="16" cy="32" r="5" fill={color} stroke="none" />
        <Circle cx="32" cy="32" r="5" fill={color} stroke="none" />
        <Circle cx="48" cy="32" r="5" fill={color} stroke="none" />
      </>;
    case "locate":
      return <>
        <Path d="M32 8c-11 0-20 9-20 20 0 15 20 28 20 28s20-13 20-28c0-11-9-20-20-20Z" {...s} />
        <Circle cx="32" cy="28" r="7" {...s} />
      </>;
    case "warning":
      return <>
        <Path d="M32 10 58 54H6Z" {...s} />
        <Path d="M32 26v14" {...s} />
        <Circle cx="32" cy="46" r="1.6" fill={color} stroke="none" />
      </>;
    case "trash":
      return <>
        <Path d="M14 18h36" {...s} />
        <Path d="M24 18v-6h16v6" {...s} />
        <Path d="M18 18l3 36c0 3 2 5 5 5h12c3 0 5-2 5-5l3-36" {...s} />
        <Path d="M26 28v20M38 28v20" {...s} />
      </>;
    case "duplicate":
      return <>
        <Rect x="10" y="18" width="32" height="32" rx="6" {...s} />
        <Path d="M22 18v-4c0-2 2-4 4-4h24c2 0 4 2 4 4v24c0 2-2 4-4 4h-4" {...s} />
      </>;
    case "refresh":
      return <>
        <Path d="M12 32a20 20 0 0 1 34-14l4 4" {...s} />
        <Path d="M50 14v10H40" {...s} />
        <Path d="M52 32a20 20 0 0 1-34 14l-4-4" {...s} />
        <Path d="M14 50V40h10" {...s} />
      </>;
    case "document":
      return <>
        <Path d="M16 8h24l12 12v36a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z" {...s} />
        <Path d="M40 8v12h12" {...s} />
        <Path d="M20 34h24M20 42h24M20 26h12" {...s} />
      </>;
    case "camera":
      return <>
        <Path d="M10 20a4 4 0 0 1 4-4h6l4-6h16l4 6h6a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4Z" {...s} />
        <Circle cx="32" cy="34" r="10" {...s} />
      </>;
    case "gallery":
      return <>
        <Rect x="8" y="12" width="48" height="40" rx="5" {...s} />
        <Circle cx="22" cy="26" r="5" {...s} />
        <Path d="M12 46l14-14 10 10 8-8 14 14" {...s} />
      </>;
    case "forward":
      return <Path d="M26 12l20 20-20 20" {...s} />;
  }
}

export default function Icon({ name, size = 20, color = "#173B8F", strokeWidth = 3.2, style }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" style={style}>
      {renderPaths(name, color, strokeWidth)}
    </Svg>
  );
}
