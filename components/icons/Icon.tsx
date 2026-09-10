// The user's generated travel-icon set (travel-icons-svg.zip), inlined as
// React Native SVG components — 64x64 viewBox, 3.2 stroke width, matching
// the source files exactly. Two names (overview, signOut) aren't in that
// set and are hand-drawn to match its weight/rounding.
import Svg, { Path, Circle, Rect } from "react-native-svg";

export type IconName =
  | "flight" | "lodging" | "budget" | "packing"
  | "weatherSunny" | "weatherCloudy" | "weatherPartlyCloudy" | "weatherRainy"
  | "weatherSnowy" | "weatherThunderstorm" | "weatherWindy"
  | "countdown" | "map" | "currency" | "shopping" | "search" | "archive"
  | "menu" | "add" | "home" | "export" | "edit" | "share"
  | "overview" | "signOut" | "back" | "swap" | "check";

type Props = { name: IconName; size?: number; color?: string; strokeWidth?: number };

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
  }
}

export default function Icon({ name, size = 20, color = "#173B8F", strokeWidth = 3.2 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {renderPaths(name, color, strokeWidth)}
    </Svg>
  );
}
