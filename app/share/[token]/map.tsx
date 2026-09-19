// Public share — the full trip map, its own tab (same split as the app's
// own Overview/Map tabs) rather than one more section on an already-long
// Overview scroll.
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useThemeColors } from "@/lib/ThemeContext";
import { buildDayColorMap, buildDateToDayId, NEUTRAL_DAY_COLOR, MapItem } from "@/lib/mapData";
import TripMap from "@/components/TripMap";
import ShareTabBar from "@/components/ShareTabBar";
import { PublicItem } from "@/lib/shareTypes";
import { useSharePayload } from "./_layout";

export default function ShareMap() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const colors = useThemeColors();
  const { trip, days, items, routes } = useSharePayload();

  const dayColors = buildDayColorMap(days);
  const dateToDayId = buildDateToDayId(days);
  const mapItems: MapItem[] = items.filter(
    (i): i is PublicItem & { latitude: number; longitude: number } => i.latitude != null && i.longitude != null
  ) as MapItem[];

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ flex: 1 }}>
        <TripMap
          items={mapItems}
          routes={routes}
          dayColors={dayColors}
          dateToDayId={dateToDayId}
          neutralColor={NEUTRAL_DAY_COLOR}
          visibleDayIds={new Set(days.map((d) => d.id))}
          visibleTypes={new Set(items.map((i) => i.type))}
          tripFocus={trip.latitude != null && trip.longitude != null ? { latitude: trip.latitude, longitude: trip.longitude } : null}
          onItemPress={() => {}}
        />
      </View>
      <ShareTabBar token={token} active="map" />
    </View>
  );
}
