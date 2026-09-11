import { useEffect, useMemo, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { MapView, Camera, PointAnnotation, ShapeSource, LineLayer, type CameraStop, type PointAnnotationRef } from "@maplibre/maplibre-react-native";
import Icon, { IconName } from "@/components/icons/Icon";
import { mapIconForItem } from "@/lib/itemTypeMeta";
import { MapItem, colorForMapItem } from "@/lib/mapData";
import { MapRoute, ItemStatus, ItemType } from "@/lib/types";

// Same free, no-API-key OpenFreeMap style used on web — see
// MANIFEST-MAP-HANDOFF.md §4.6 for why MapLibre over Google Maps.
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export interface TripMapProps {
  items: MapItem[];
  routes: MapRoute[];
  dayColors: Map<string, string>;
  dateToDayId: Map<string, string>;
  neutralColor: string;
  visibleDayIds: Set<string>;
  visibleTypes: Set<ItemType>;
  focusItemId?: string;
  tripFocus: { latitude: number; longitude: number } | null;
  onItemPress: (item: MapItem) => void;
}

function statusOpacity(status: ItemStatus) {
  return status === "optional" ? 0.55 : 1;
}

function MarkerGlyph({ color, icon, opacity, focused }: { color: string; icon: IconName; opacity: number; focused?: boolean }) {
  const size = focused ? 36 : 28;
  return (
    <View
      style={[
        styles.glyph,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity },
        focused && styles.glyphFocused,
      ]}
    >
      <Icon name={icon} size={focused ? 17 : 14} color="#FFFFFF" />
    </View>
  );
}

export default function TripMap(props: TripMapProps) {
  // PointAnnotation renders its children onto a bitmap once on Android —
  // if that snapshot happens before the icon glyph's font has painted, the
  // marker is left blank. `.refresh()` forces a re-snapshot; a short delay
  // after each (re)render reliably lands after that first paint.
  const annotationRefs = useRef<Map<string, PointAnnotationRef>>(new Map());

  const visibleItems = useMemo(() => props.items.filter((item) => {
    if (!props.visibleTypes.has(item.type)) return false;
    if (item.day_id && !props.visibleDayIds.has(item.day_id)) return false;
    return true;
  }), [props.items, props.visibleTypes, props.visibleDayIds]);

  const focusedItem = useMemo(
    () => visibleItems.find((item) => item.id === props.focusItemId),
    [visibleItems, props.focusItemId]
  );

  useEffect(() => {
    const t = setTimeout(() => {
      annotationRefs.current.forEach((ref) => ref?.refresh());
    }, 350);
    return () => clearTimeout(t);
  }, [visibleItems]);

  // Declarative camera props (not an imperative ref call) so the very
  // first render already has the right view — no waiting on a native ref
  // to become ready.
  const cameraStop: CameraStop = useMemo(() => {
    if (focusedItem) {
      return { centerCoordinate: [focusedItem.longitude, focusedItem.latitude], zoomLevel: 16, animationDuration: 600 };
    }
    if (visibleItems.length > 0) {
      const lons = visibleItems.map((i) => i.longitude);
      const lats = visibleItems.map((i) => i.latitude);
      return {
        bounds: {
          ne: [Math.max(...lons), Math.max(...lats)],
          sw: [Math.min(...lons), Math.min(...lats)],
          paddingTop: 60, paddingBottom: 60, paddingLeft: 60, paddingRight: 60,
        },
        animationDuration: 0,
      };
    }
    if (props.tripFocus) {
      return { centerCoordinate: [props.tripFocus.longitude, props.tripFocus.latitude], zoomLevel: 11 };
    }
    // Last-resort fallback for a trip with no cities picked and no
    // geocoded items yet (e.g. a very old trip predating both features).
    return { centerCoordinate: [2.3488, 48.8534], zoomLevel: 11 };
  }, [visibleItems, focusedItem, props.tripFocus]);

  return (
    <View style={styles.container}>
      <MapView style={styles.map} mapStyle={STYLE_URL}>
        <Camera {...cameraStop} />

        {props.routes.map((route) => {
          const color = route.color ?? (route.day_id ? props.dayColors.get(route.day_id) ?? props.neutralColor : props.neutralColor);
          return (
            <ShapeSource
              key={route.id}
              id={`route-${route.id}`}
              shape={{ type: "Feature", properties: {}, geometry: route.geometry as any }}
            >
              <LineLayer
                id={`route-line-${route.id}`}
                style={{ lineColor: color, lineWidth: 3, lineOpacity: 0.85, lineJoin: "round", lineCap: "round" }}
              />
            </ShapeSource>
          );
        })}

        {visibleItems.map((item) => {
          const color = colorForMapItem(item, props.dayColors, props.dateToDayId, props.neutralColor);
          const focused = item.id === props.focusItemId;
          const icon = mapIconForItem(item);
          return (
            // PointAnnotation snapshots its children to a bitmap once and
            // never re-snapshots on a prop change on its own (see the
            // .refresh() workaround below, for the initial-paint race) —
            // keying on color+icon+focus forces a full remount instead,
            // which is the one thing guaranteed to produce a fresh
            // snapshot, so a day-color edit is reflected immediately
            // rather than only after some unrelated filter change.
            <PointAnnotation
              key={`${item.id}-${color}-${icon}-${focused}`}
              ref={(r) => { if (r) annotationRefs.current.set(item.id, r); else annotationRefs.current.delete(item.id); }}
              id={item.id}
              coordinate={[item.longitude, item.latitude]}
              onSelected={() => props.onItemPress(item)}
            >
              <MarkerGlyph color={color} icon={icon} opacity={statusOpacity(item.status)} focused={focused} />
            </PointAnnotation>
          );
        })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  glyph: {
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#FFFFFF",
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 4,
  },
  glyphFocused: {
    shadowColor: "#C98A2E", shadowOpacity: 0.55, shadowRadius: 6, elevation: 6,
  },
});
