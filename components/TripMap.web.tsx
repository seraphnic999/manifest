import { useEffect, useRef, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import type { Map as MLMap, Marker } from "maplibre-gl";
// A pure CSS side-effect import — no executable JS, so no eager-loading
// risk (that risk is specific to the "maplibre-gl" JS module below, which
// pulls in WebGL/worker code and is loaded dynamically instead). Kept
// static so Expo's build-time CSS extraction (which emits a <link> in the
// HTML head regardless of import timing) reliably picks it up — a plain
// runtime `import()` of a .css file isn't a real loadable JS chunk and
// silently never resolves.
import "maplibre-gl/dist/maplibre-gl.css";
import { Ionicons } from "@expo/vector-icons";
import { categoryForDbType } from "@/lib/itemTypeMeta";
import { MapItem, PLACE_COLOR } from "@/lib/mapData";
import { MapRoute, TripPlace, ItemStatus, ItemType } from "@/lib/types";

// Free, no API key/signup/billing — see MANIFEST-MAP-HANDOFF.md §4.6 for
// why MapLibre was chosen over the Google Maps JS API (one style across
// web+native, no per-load billing).
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export interface TripMapProps {
  items: MapItem[];
  routes: MapRoute[];
  places: TripPlace[];
  dayColors: Map<string, string>;
  neutralColor: string;
  visibleDayIds: Set<string>;
  visibleTypes: Set<ItemType>;
  showPlaces: boolean;
  focusItemId?: string;
  onItemPress: (item: MapItem) => void;
  onPlacePress: (place: TripPlace) => void;
}

function statusOpacity(status: ItemStatus) {
  return status === "optional" ? 0.55 : 1;
}

function MarkerGlyph({ color, icon, opacity, focused }: { color: string; icon: string; opacity: number; focused?: boolean }) {
  const size = focused ? 36 : 28;
  return (
    <div
      style={{
        width: size, height: size, borderRadius: size / 2, background: color, opacity,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: focused
          ? "0 0 0 4px rgba(201,138,46,0.55), 0 1px 6px rgba(0,0,0,0.5)"
          : "0 1px 4px rgba(0,0,0,0.4)",
        border: "2px solid #FFFFFF", cursor: "pointer",
      }}
    >
      <Ionicons name={icon as any} size={focused ? 17 : 14} color="#FFFFFF" />
    </div>
  );
}

export default function TripMap(props: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<{ marker: Marker; root: Root }[]>([]);
  const propsRef = useRef(props);
  propsRef.current = props;

  // maplibre-gl pulls in WebGL/worker machinery and is only ever needed on
  // this one screen — Expo Router's default "sync" import mode eagerly
  // requires every route module (including this one) at app boot, so a
  // top-level `import "maplibre-gl"` here would load it on every page load,
  // not just this screen. Loading it lazily, on mount, keeps it off the
  // startup path entirely.
  const [maplibregl, setMaplibregl] = useState<typeof import("maplibre-gl") | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("maplibre-gl").then((mod) => {
      if (cancelled) return;
      // No bundler (Metro included) makes maplibre-gl's own import.meta.url
      // worker auto-detection resolve to a real, separately-loadable file —
      // every consumer needs to point this at a real static copy
      // explicitly. The file is copied verbatim into public/ (served as-is,
      // unbundled) from node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs.
      mod.setWorkerUrl("/maplibre-gl-worker.mjs");
      setMaplibregl(mod);
    }).catch((e) => {
      console.error("Failed to load maplibre-gl", e);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!maplibregl || !containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [2.3488, 48.8534],
      zoom: 11,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;
    return () => {
      markersRef.current.forEach(({ marker, root }) => { marker.remove(); root.unmount(); });
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [maplibregl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!maplibregl || !map) return;

    function renderMarkers(map: MLMap) {
      markersRef.current.forEach(({ marker, root }) => { marker.remove(); root.unmount(); });
      markersRef.current = [];

      const p = propsRef.current;
      const bounds = new maplibregl!.LngLatBounds();
      let any = false;

      const visibleItems = p.items.filter((item) => {
        if (!p.visibleTypes.has(item.type)) return false;
        if (item.day_id && !p.visibleDayIds.has(item.day_id)) return false;
        return true;
      });

      let focusedItem: typeof visibleItems[number] | undefined;

      visibleItems.forEach((item) => {
        const color = item.day_id ? p.dayColors.get(item.day_id) ?? p.neutralColor : p.neutralColor;
        const focused = item.id === p.focusItemId;
        if (focused) focusedItem = item;
        const el = document.createElement("div");
        const root = createRoot(el);
        root.render(
          <MarkerGlyph color={color} icon={categoryForDbType(item.type).icon} opacity={statusOpacity(item.status)} focused={focused} />
        );
        el.addEventListener("click", () => propsRef.current.onItemPress(item));
        const marker = new maplibregl!.Marker({ element: el, anchor: "center" })
          .setLngLat([item.longitude, item.latitude])
          .addTo(map);
        markersRef.current.push({ marker, root });
        bounds.extend([item.longitude, item.latitude]);
        any = true;
      });

      if (p.showPlaces) {
        p.places.forEach((place) => {
          const el = document.createElement("div");
          const root = createRoot(el);
          root.render(<MarkerGlyph color={PLACE_COLOR} icon="bookmark" opacity={1} />);
          el.addEventListener("click", () => propsRef.current.onPlacePress(place));
          const marker = new maplibregl!.Marker({ element: el, anchor: "center" })
            .setLngLat([place.longitude, place.latitude])
            .addTo(map);
          markersRef.current.push({ marker, root });
          bounds.extend([place.longitude, place.latitude]);
          any = true;
        });
      }

      if (focusedItem) {
        map.flyTo({ center: [focusedItem.longitude, focusedItem.latitude], zoom: 16, duration: 600 });
      } else if (any && !bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 0 });
      }
    }

    if (map.isStyleLoaded()) renderMarkers(map);
    else map.once("load", () => renderMarkers(map));
  }, [maplibregl, props.items, props.places, props.visibleDayIds, props.visibleTypes, props.showPlaces, props.dayColors, props.neutralColor, props.focusItemId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!maplibregl || !map) return;

    function drawRoutes(map: MLMap) {
      const p = propsRef.current;
      p.routes.forEach((route) => {
        const sourceId = `route-${route.id}`;
        if (map.getSource(sourceId)) return;
        const color = route.color ?? (route.day_id ? p.dayColors.get(route.day_id) ?? p.neutralColor : p.neutralColor);
        map.addSource(sourceId, {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: route.geometry as any },
        });
        map.addLayer({
          id: `route-line-${route.id}`,
          type: "line",
          source: sourceId,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": color, "line-width": 3, "line-opacity": 0.85 },
        });
      });
    }

    if (map.isStyleLoaded()) drawRoutes(map);
    else map.once("load", () => drawRoutes(map));
  }, [maplibregl, props.routes, props.dayColors, props.neutralColor]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}
