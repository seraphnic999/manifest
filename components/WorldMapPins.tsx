// A small, static recap map for the Travel Stats page — not a navigable
// map (see TripMap.tsx for that): a monochrome world silhouette with a pin
// per distinct place visited, colored by the most recent of the last few
// years traveled. See lib/worldMapPath.ts for where the silhouette itself
// comes from and why it's a plain equirectangular projection.
import { useMemo } from "react";
import { View, Text, StyleSheet, useWindowDimensions } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { colors, radius } from "@/lib/theme";
import { CityPin } from "@/lib/travelStats";
import { WORLD_MAP_PATH, WORLD_MAP_VIEW_WIDTH, WORLD_MAP_VIEW_HEIGHT, lonLatToXY } from "@/lib/worldMapPath";

export default function WorldMapPins({ pins }: { pins: CityPin[] }) {
  const { width } = useWindowDimensions();
  const mapWidth = width - 40; // mirrors the page's 20px side padding
  const mapHeight = mapWidth * (WORLD_MAP_VIEW_HEIGHT / WORLD_MAP_VIEW_WIDTH);

  // One legend entry per year actually represented among the pins, newest first.
  const years = useMemo(() => {
    const byYear = new Map<number, string>();
    for (const p of pins) byYear.set(p.year, p.color);
    return [...byYear.entries()].sort((a, b) => b[0] - a[0]);
  }, [pins]);

  if (pins.length === 0) return null;

  return (
    <View style={styles.card}>
      <Svg width={mapWidth} height={mapHeight} viewBox={`0 0 ${WORLD_MAP_VIEW_WIDTH} ${WORLD_MAP_VIEW_HEIGHT}`}>
        <Path d={WORLD_MAP_PATH} fill={colors.line} fillRule="evenodd" />
        {pins.map((pin) => {
          const { x, y } = lonLatToXY(pin.longitude, pin.latitude);
          return <Circle key={pin.key} cx={x} cy={y} r={4.5} fill={pin.color} stroke={colors.paperRaised} strokeWidth={1.2} />;
        })}
      </Svg>
      <View style={styles.legend}>
        {years.map(([year, color]) => (
          <View key={year} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text style={styles.legendText}>{year}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paperRaised, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line,
    padding: 12, marginBottom: 16, alignItems: "center",
  },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 10, justifyContent: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: colors.inkSoft, fontSize: 12, fontWeight: "700" },
});
