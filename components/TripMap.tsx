import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/lib/theme";
import { MapItem } from "@/lib/mapData";
import { MapRoute, TripPlace, ItemType } from "@/lib/types";

// Native MapLibre rendering is Phase B of the map-view work (requires
// @maplibre/maplibre-react-native + an expo prebuild/rebuild — see
// MANIFEST-MAP-HANDOFF.md). This placeholder keeps the Map screen usable
// on Android in the meantime; the web build resolves TripMap.web.tsx
// instead via Metro's platform-extension resolution.
export interface TripMapProps {
  items: MapItem[];
  routes: MapRoute[];
  places: TripPlace[];
  dayColors: Map<string, string>;
  neutralColor: string;
  visibleDayIds: Set<string>;
  visibleTypes: Set<ItemType>;
  showIdeas: boolean;
  showPlaces: boolean;
  onItemPress: (item: MapItem) => void;
  onPlacePress: (place: TripPlace) => void;
}

export default function TripMap(_props: TripMapProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Map view coming soon on Android</Text>
      <Text style={styles.body}>
        The native map renderer isn’t wired up yet — open this trip on the web version for now.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: colors.paper },
  title: { color: colors.ink, fontWeight: "700", fontSize: 15, textAlign: "center", marginBottom: 8 },
  body: { color: colors.inkSoft, fontSize: 13, textAlign: "center" },
});
