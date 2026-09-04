import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { Day, Item, ItemType, TripPlace, MapRoute, TripType } from "@/lib/types";
import { ITEM_CATEGORIES, categoryByKey } from "@/lib/itemTypeMeta";
import {
  MapItem, buildDayColorMap, fetchTripDays, fetchTripMapItems,
  fetchTripRoutes, fetchTripPlaces, NEUTRAL_DAY_COLOR, PLACE_COLOR,
} from "@/lib/mapData";
import TripMap from "@/components/TripMap";
import TripNavBar from "@/components/TripNavBar";
import AddPlaceModal from "@/components/AddPlaceModal";
import HomeButton from "@/components/HomeButton";
import { formatDateDDMM } from "@/lib/dateFormat";

const ALL_TYPES = new Set<ItemType>(ITEM_CATEGORIES.flatMap((c) => c.dbTypes));
// Flight and transfer pins (airports, transfer pickup points) are usually
// far from the walkable itinerary area, so they start hidden to keep the
// initial view zoomed to the places actually worth looking at.
const DEFAULT_VISIBLE_TYPES = new Set<ItemType>([...ALL_TYPES].filter((t) => t !== "flight" && t !== "transfer"));

// Fixed display order for the map's type filter row — independent of
// ITEM_CATEGORIES's own order (used elsewhere, e.g. the item-type picker
// grid), which stays as-is.
const FILTER_ORDER = ["lodging", "work", "dining", "activity", "shopping", "transport", "transfer", "flight", "other"];

export default function TripMapScreen() {
  const { tripId, focusItemId } = useLocalSearchParams<{ tripId: string; focusItemId?: string }>();
  const router = useRouter();

  const [days, setDays] = useState<Day[]>([]);
  const [items, setItems] = useState<MapItem[]>([]);
  const [routes, setRoutes] = useState<MapRoute[]>([]);
  const [places, setPlaces] = useState<TripPlace[]>([]);
  const [tripType, setTripType] = useState<TripType | null>(null);

  const [visibleDayIds, setVisibleDayIds] = useState<Set<string>>(new Set());
  const [visibleTypes, setVisibleTypes] = useState<Set<ItemType>>(DEFAULT_VISIBLE_TYPES);
  const [showPlaces, setShowPlaces] = useState(false);
  const [placeModalOpen, setPlaceModalOpen] = useState(false);
  const [editingPlace, setEditingPlace] = useState<TripPlace | null>(null);

  const load = useCallback(async () => {
    const [d, i, r, p, tripRes] = await Promise.all([
      fetchTripDays(tripId), fetchTripMapItems(tripId), fetchTripRoutes(tripId), fetchTripPlaces(tripId),
      supabase.from("trips").select("type").eq("id", tripId).single(),
    ]);
    setDays(d);
    setItems(i);
    setRoutes(r);
    setPlaces(p);
    if (tripRes.data) setTripType(tripRes.data.type as TripType);
    setVisibleDayIds((prev) => (prev.size === 0 ? new Set(d.map((day) => day.id)) : prev));

    // Coming from an item's "View on map" link: make sure the day/type
    // filters don't hide it (day is all-visible by default already; type
    // only matters if it's a flight/transfer, hidden by default).
    if (focusItemId) {
      const focused = i.find((it) => it.id === focusItemId);
      if (focused) setVisibleTypes((prev) => new Set(prev).add(focused.type));
    }
  }, [tripId, focusItemId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const dayColors = buildDayColorMap(days);

  function toggleDay(id: string) {
    setVisibleDayIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleType(t: ItemType) {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  }

  function openPlace(place: TripPlace) {
    setEditingPlace(place);
    setPlaceModalOpen(true);
  }

  function openNewPlace() {
    setEditingPlace(null);
    setPlaceModalOpen(true);
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: "Map",
        headerRight: () => (
          <View style={{ marginRight: 14 }}>
            <HomeButton />
          </View>
        ),
      }} />

      <TripNavBar tripId={tripId} active="map" />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={styles.filterRowOuter}>
        {days.map((d, idx) => (
          <Pressable
            key={d.id}
            style={[styles.chip, { borderColor: dayColors.get(d.id) }, visibleDayIds.has(d.id) && { backgroundColor: dayColors.get(d.id) }]}
            onPress={() => toggleDay(d.id)}
          >
            <Text style={[styles.chipText, visibleDayIds.has(d.id) && styles.chipTextActive]}>{formatDateDDMM(d.date)}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.chip, { borderColor: PLACE_COLOR }, showPlaces && { backgroundColor: PLACE_COLOR }]}
          onPress={() => setShowPlaces((v) => !v)}
        >
          <Text style={[styles.chipText, showPlaces && styles.chipTextActive]}>Places</Text>
        </Pressable>
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={styles.filterRowOuter}>
        {FILTER_ORDER
          .filter((key) => key !== "work" || tripType === "business" || tripType === "mixed")
          .map((key) => categoryByKey(key))
          .map((cat) => {
          const active = cat.dbTypes.some((t) => visibleTypes.has(t));
          return (
            <Pressable
              key={cat.key}
              style={[styles.typeChip, active && { backgroundColor: cat.tileColor, borderColor: cat.tileColor }]}
              onPress={() => cat.dbTypes.forEach(toggleType)}
            >
              <Ionicons name={cat.icon as any} size={13} color={active ? "#fff" : colors.inkSoft} />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.mapWrap}>
        <TripMap
          items={items}
          routes={routes}
          places={places}
          dayColors={dayColors}
          neutralColor={NEUTRAL_DAY_COLOR}
          visibleDayIds={visibleDayIds}
          visibleTypes={visibleTypes}
          showPlaces={showPlaces}
          focusItemId={focusItemId}
          onItemPress={(item: Item) => router.push(`/item/${item.id}`)}
          onPlacePress={openPlace}
        />
      </View>

      <Pressable style={styles.fab} onPress={openNewPlace}>
        <Text style={styles.fabText}>+ Add place</Text>
      </Pressable>

      <AddPlaceModal
        visible={placeModalOpen}
        onClose={() => setPlaceModalOpen(false)}
        onSaved={() => { setPlaceModalOpen(false); load(); }}
        tripId={tripId}
        place={editingPlace}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  filterRowOuter: {
    maxHeight: 48, backgroundColor: colors.paperRaised, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  filterRow: { alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  chip: {
    height: 30, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1.5,
    borderColor: colors.line, alignItems: "center", justifyContent: "center",
  },
  chipText: { fontSize: 11, fontWeight: "600", color: colors.inkSoft },
  chipTextActive: { color: "#fff" },
  typeChip: {
    height: 30, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line,
    flexDirection: "row", alignItems: "center", gap: 5, justifyContent: "center",
  },
  mapWrap: { flex: 1 },
  fab: {
    position: "absolute", bottom: 20, alignSelf: "center",
    backgroundColor: colors.ink, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 24,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  fabText: { color: colors.paper, fontWeight: "700" },
});
