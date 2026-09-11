import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import Icon from "@/components/icons/Icon";
import { colors, radius } from "@/lib/theme";
import { Day, Item, ItemType, MapRoute, TripType } from "@/lib/types";
import { ITEM_CATEGORIES, categoryByKey } from "@/lib/itemTypeMeta";
import {
  MapItem, buildDayColorMap, fetchTripDays, fetchTripMapItems,
  fetchTripRoutes, NEUTRAL_DAY_COLOR,
} from "@/lib/mapData";
import TripMap from "@/components/TripMap";
import TripScreenHeader from "@/components/TripScreenHeader";
import TripTabBar from "@/components/TripTabBar";
import { useTripHamburgerMenu } from "@/components/useTripHamburgerMenu";
import ItemTypePickerModal from "@/components/ItemTypePickerModal";
import { formatDateDDMM } from "@/lib/dateFormat";
import { useNetworkStatus } from "@/lib/useNetworkStatus";
import OfflineBanner from "@/components/OfflineBanner";
import { Alert } from "@/lib/alert";
import { categoryForDbType } from "@/lib/itemTypeMeta";
import { fetchCurrentPosition, fetchNearbyItems, formatDistance, NearbyItem } from "@/lib/nearMe";

const ALL_TYPES = new Set<ItemType>(ITEM_CATEGORIES.flatMap((c) => c.dbTypes));
// Flight and transfer pins (airports, transfer pickup points) are usually
// far from the walkable itinerary area, so they start hidden to keep the
// initial view zoomed to the places actually worth looking at.
const DEFAULT_VISIBLE_TYPES = new Set<ItemType>([...ALL_TYPES].filter((t) => t !== "flight" && t !== "transfer"));

// Fixed display order for the map's type filter row — independent of
// ITEM_CATEGORIES's own order (used elsewhere, e.g. the item-type picker
// grid), which stays as-is.
const FILTER_ORDER = ["lodging", "work", "dining", "activity", "shopping", "transport", "transfer", "flight", "other"];

interface TripMapData {
  days: Day[];
  items: MapItem[];
  routes: MapRoute[];
  tripType: TripType | null;
}

async function fetchTripMapData(tripId: string): Promise<TripMapData> {
  const [days, items, routes, tripRes] = await Promise.all([
    fetchTripDays(tripId), fetchTripMapItems(tripId), fetchTripRoutes(tripId),
    supabase.from("trips").select("type").eq("id", tripId).single(),
  ]);
  if (tripRes.error) throw tripRes.error;
  return { days, items, routes, tripType: (tripRes.data?.type as TripType) ?? null };
}

export default function TripMapScreen() {
  const { tripId, focusItemId } = useLocalSearchParams<{ tripId: string; focusItemId?: string }>();
  const router = useRouter();
  const isOnline = useNetworkStatus();

  const [visibleDayIds, setVisibleDayIds] = useState<Set<string>>(new Set());
  const [visibleTypes, setVisibleTypes] = useState<Set<ItemType>>(DEFAULT_VISIBLE_TYPES);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [nearMeOn, setNearMeOn] = useState(false);
  const [locating, setLocating] = useState(false);
  const [nearbyItems, setNearbyItems] = useState<NearbyItem[]>([]);
  const { menuItems, shareModal } = useTripHamburgerMenu(tripId);

  const { data, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["tripMap", tripId],
    queryFn: () => fetchTripMapData(tripId),
  });
  const days = data?.days ?? [];
  const items = data?.items ?? [];
  const routes = data?.routes ?? [];
  const tripType = data?.tripType ?? null;

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  useEffect(() => {
    if (!data) return;
    // The "Proposals" day (date === null) starts off — everything else on.
    setVisibleDayIds((prev) => (prev.size === 0 ? new Set(data.days.filter((day) => day.date !== null).map((day) => day.id)) : prev));

    // Coming from an item's "View on map" link: make sure the day/type
    // filters don't hide it.
    if (focusItemId) {
      const focused = data.items.find((it) => it.id === focusItemId);
      if (focused) {
        setVisibleTypes((prev) => new Set(prev).add(focused.type));
        if (focused.day_id) setVisibleDayIds((prev) => new Set(prev).add(focused.day_id!));
      }
    }
  }, [data, focusItemId]);

  // Memoized so its identity only changes when `days` itself does (e.g.
  // after a color edit refetches) — TripMap's marker-refresh effect keys
  // off this reference to know when it needs to re-snapshot marker bitmaps.
  const dayColors = useMemo(() => buildDayColorMap(days), [days]);
  const proposalsDayId = days.find((d) => d.date === null)?.id;

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

  function handleSelectCategory(categoryKey: string) {
    setPickerOpen(false);
    if (!proposalsDayId) return;
    router.push(`/item/new?tripId=${tripId}&dayId=${proposalsDayId}&category=${categoryKey}`);
  }

  async function toggleNearMe() {
    if (nearMeOn) {
      setNearMeOn(false);
      setNearbyItems([]);
      return;
    }
    if (!isOnline) {
      Alert.alert("You're offline", "Connect to the internet to use Near me.");
      return;
    }
    setLocating(true);
    try {
      const pos = await fetchCurrentPosition();
      if (!pos) {
        Alert.alert("Location needed", "Allow location access to see what's nearby.");
        return;
      }
      const nearby = await fetchNearbyItems(tripId, pos.lat, pos.lon);
      setNearbyItems(nearby);
      setNearMeOn(true);
    } catch (e: any) {
      Alert.alert("Couldn't get nearby places", e.message ?? "Unknown error");
    } finally {
      setLocating(false);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <TripScreenHeader title="Map" tripId={tripId} menuItems={menuItems} />
      {shareModal}
      <OfflineBanner dataUpdatedAt={!isOnline ? dataUpdatedAt : undefined} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={styles.filterRowOuter}>
        {days.map((d) => (
          <Pressable
            key={d.id}
            style={[styles.chip, { borderColor: dayColors.get(d.id) }, visibleDayIds.has(d.id) && { backgroundColor: dayColors.get(d.id) }]}
            onPress={() => toggleDay(d.id)}
          >
            <Text style={[styles.chipText, visibleDayIds.has(d.id) && styles.chipTextActive]}>
              {d.date === null ? "Proposals" : formatDateDDMM(d.date)}
            </Text>
          </Pressable>
        ))}
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
              <Icon name={cat.icon} size={13} color={active ? "#fff" : colors.inkSoft} />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat.label}</Text>
            </Pressable>
          );
        })}
        <Pressable
          style={[styles.nearMeChip, nearMeOn && styles.nearMeChipActive]}
          onPress={toggleNearMe}
          disabled={locating}
        >
          <Icon name="locate" size={13} color={nearMeOn ? "#fff" : colors.lightBlue} />
          <Text style={[styles.chipText, { color: colors.lightBlue }, nearMeOn && styles.chipTextActive]}>
            {locating ? "Locating…" : "Near me"}
          </Text>
        </Pressable>
      </ScrollView>

      <View style={styles.mapWrap}>
        <TripMap
          items={items}
          routes={routes}
          dayColors={dayColors}
          neutralColor={NEUTRAL_DAY_COLOR}
          visibleDayIds={visibleDayIds}
          visibleTypes={visibleTypes}
          focusItemId={focusItemId}
          onItemPress={(item: Item) => router.push(`/item/${item.id}`)}
        />

        {nearMeOn && (
          <View style={styles.nearMePanel}>
            <Text style={styles.nearMePanelTitle}>Nearby, closest first</Text>
            <ScrollView style={{ maxHeight: 220 }}>
              {nearbyItems.map(({ item, distance_m }) => (
                <Pressable key={item.id} style={styles.nearMeRow} onPress={() => router.push(`/item/${item.id}`)}>
                  <Icon name={categoryForDbType(item.type).icon} size={14} color={colors.lightBlue} />
                  <Text style={styles.nearMeRowTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.nearMeRowDistance}>{formatDistance(distance_m)}</Text>
                </Pressable>
              ))}
              {nearbyItems.length === 0 && <Text style={styles.empty}>No items with coordinates on this trip.</Text>}
            </ScrollView>
          </View>
        )}
      </View>

      <Pressable
        style={styles.fab}
        onPress={() => {
          if (!isOnline) { Alert.alert("You're offline", "Connect to the internet to add a proposal."); return; }
          setPickerOpen(true);
        }}
      >
        <Icon name="add" size={24} color="#fff" />
      </Pressable>

      <ItemTypePickerModal visible={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handleSelectCategory} />
      <TripTabBar tripId={tripId} active="map" />
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
  nearMeChip: {
    height: 30, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1.5, borderColor: colors.lightBlue,
    flexDirection: "row", alignItems: "center", gap: 5, justifyContent: "center",
  },
  nearMeChipActive: { backgroundColor: colors.lightBlue },
  nearMePanel: {
    position: "absolute", left: 12, right: 12, bottom: 140,
    backgroundColor: colors.paperRaised, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line,
    padding: 12, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  nearMePanelTitle: {
    color: colors.inkSoft, fontWeight: "700", fontSize: 11,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8,
  },
  nearMeRow: {
    flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  nearMeRowTitle: { flex: 1, color: colors.ink, fontWeight: "600", fontSize: 13 },
  nearMeRowDistance: { fontFamily: "JetBrainsMono_600SemiBold", color: colors.lightBlue, fontSize: 11, fontWeight: "600" },
  empty: { color: colors.inkSoft, fontSize: 12, fontStyle: "italic", paddingVertical: 8 },
  fab: {
    position: "absolute", bottom: 74, right: 16, width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.ink, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
});
