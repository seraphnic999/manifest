import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "@/lib/theme";
import { Day, Item, ItemType, TripPlace, MapRoute } from "@/lib/types";
import { ITEM_CATEGORIES, categoryForDbType } from "@/lib/itemTypeMeta";
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

export default function TripMapScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();

  const [days, setDays] = useState<Day[]>([]);
  const [items, setItems] = useState<MapItem[]>([]);
  const [routes, setRoutes] = useState<MapRoute[]>([]);
  const [places, setPlaces] = useState<TripPlace[]>([]);

  const [visibleDayIds, setVisibleDayIds] = useState<Set<string>>(new Set());
  const [visibleTypes, setVisibleTypes] = useState<Set<ItemType>>(ALL_TYPES);
  const [showIdeas, setShowIdeas] = useState(false);
  const [showPlaces, setShowPlaces] = useState(true);
  const [placeModalOpen, setPlaceModalOpen] = useState(false);
  const [editingPlace, setEditingPlace] = useState<TripPlace | null>(null);

  const load = useCallback(async () => {
    const [d, i, r, p] = await Promise.all([
      fetchTripDays(tripId), fetchTripMapItems(tripId), fetchTripRoutes(tripId), fetchTripPlaces(tripId),
    ]);
    setDays(d);
    setItems(i);
    setRoutes(r);
    setPlaces(p);
    setVisibleDayIds((prev) => (prev.size === 0 ? new Set(d.map((day) => day.id)) : prev));
  }, [tripId]);

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
        <Pressable
          style={[styles.chip, showIdeas && styles.chipActiveNeutral]}
          onPress={() => setShowIdeas((v) => !v)}
        >
          <Text style={[styles.chipText, showIdeas && styles.chipTextActive]}>Ideas</Text>
        </Pressable>
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={styles.filterRowOuter}>
        {ITEM_CATEGORIES.map((cat) => {
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
          showIdeas={showIdeas}
          showPlaces={showPlaces}
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
  chipActiveNeutral: { backgroundColor: colors.inkSoft, borderColor: colors.inkSoft },
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
