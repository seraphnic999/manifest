// Public share — the full trip map, its own tab (same split as the app's
// own Overview/Map tabs) rather than one more section on an already-long
// Overview scroll. Day/type filter chips mirror the app's own map screen
// (app/trip/[tripId]/map.tsx); tapping a pin has nowhere to navigate for a
// read-only guest (no item detail page), so it opens an inline preview
// panel instead of the app's router.push.
import { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { radius, fonts, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import Icon from "@/components/icons/Icon";
import { formatDateDDMM } from "@/lib/dateFormat";
import { normalizeTimeHHMM } from "@/lib/timeFormat";
import { ITEM_CATEGORIES, mapIconForItem, itemTypeTag } from "@/lib/itemTypeMeta";
import { buildDayColorMap, buildDateToDayId, NEUTRAL_DAY_COLOR, MapItem } from "@/lib/mapData";
import TripMap from "@/components/TripMap";
import ShareTabBar from "@/components/ShareTabBar";
import { PublicItem, STATUS_LABEL } from "@/lib/shareTypes";
import { ItemType } from "@/lib/types";
import { useSharePayload } from "./_layout";

// Flight/transfer pins (airports, pickup points) are usually far from the
// walkable itinerary area — same reasoning as the app's map screen for
// starting them hidden, so the initial view stays zoomed to what's worth
// looking at.
const HIDDEN_BY_DEFAULT: ItemType[] = ["flight", "transfer"];

export default function ShareMap() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { trip, days, items, routes } = useSharePayload();

  const dayColors = buildDayColorMap(days);
  const dateToDayId = buildDateToDayId(days);
  const mapItems: MapItem[] = items.filter(
    (i): i is PublicItem & { latitude: number; longitude: number } => i.latitude != null && i.longitude != null
  ) as MapItem[];

  const presentTypes = new Set(mapItems.map((i) => i.type));
  const categories = ITEM_CATEGORIES.filter((cat) => cat.dbTypes.some((t) => presentTypes.has(t)));
  const daysWithItems = days.filter((d) => mapItems.some((i) => i.day_id === d.id));

  const [visibleDayIds, setVisibleDayIds] = useState<Set<string>>(
    () => new Set(daysWithItems.filter((d) => d.date !== null).map((d) => d.id))
  );
  const [visibleTypes, setVisibleTypes] = useState<Set<ItemType>>(
    () => new Set([...presentTypes].filter((t) => !HIDDEN_BY_DEFAULT.includes(t)))
  );
  const [selected, setSelected] = useState<MapItem | null>(null);

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

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      {daysWithItems.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={styles.filterRowOuter}>
          {daysWithItems.map((d) => (
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
      )}

      {categories.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={styles.filterRowOuter}>
          {categories.map((cat) => {
            const active = cat.dbTypes.some((t) => visibleTypes.has(t));
            return (
              <Pressable
                key={cat.key}
                style={[styles.typeChip, active && styles.typeChipActive]}
                onPress={() => cat.dbTypes.forEach(toggleType)}
              >
                <Icon name={cat.icon} size={13} color={active ? "#fff" : colors.inkSoft} />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={{ flex: 1 }}>
        <TripMap
          items={mapItems}
          routes={routes}
          dayColors={dayColors}
          dateToDayId={dateToDayId}
          neutralColor={NEUTRAL_DAY_COLOR}
          visibleDayIds={visibleDayIds}
          visibleTypes={visibleTypes}
          tripFocus={trip.latitude != null && trip.longitude != null ? { latitude: trip.latitude, longitude: trip.longitude } : null}
          onItemPress={(item) => setSelected(item)}
        />

        {selected && (
          <View style={styles.previewPanel}>
            <Pressable style={styles.previewClose} onPress={() => setSelected(null)}>
              <Icon name="add" size={16} color={colors.inkSoft} style={{ transform: [{ rotate: "45deg" }] }} />
            </Pressable>
            <View style={styles.previewRow}>
              <Icon name={mapIconForItem(selected)} size={20} color={colors.blue} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <View style={styles.previewTagRow}>
                  <Text style={styles.previewTag}>{itemTypeTag(selected.type)}</Text>
                  {selected.status !== "booked" && <Text style={styles.previewStatusBadge}>{STATUS_LABEL[selected.status]}</Text>}
                </View>
                <Text style={styles.previewTitle}>{selected.title}</Text>
                {!!selected.time_start && <Text style={styles.previewMeta}>{normalizeTimeHHMM(selected.time_start)}</Text>}
                {!!selected.address && <Text style={styles.previewMeta}>{selected.address}</Text>}
                {!!selected.notes && <Text style={styles.previewMeta}>{selected.notes}</Text>}
              </View>
            </View>
          </View>
        )}
      </View>
      <ShareTabBar token={token} active="map" />
    </View>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
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
    backgroundColor: colors.paperRaised,
    flexDirection: "row", alignItems: "center", gap: 5, justifyContent: "center",
  },
  typeChipActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  previewPanel: {
    position: "absolute", left: 12, right: 12, bottom: 12,
    backgroundColor: colors.paperRaised, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line,
    padding: 14, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  previewClose: { position: "absolute", top: 10, right: 10, padding: 4, zIndex: 1 },
  previewRow: { flexDirection: "row", paddingRight: 20 },
  previewTagRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  previewTag: { color: colors.blue, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  previewStatusBadge: {
    color: colors.inkSoft, fontSize: 9.5, fontWeight: "700", textTransform: "uppercase",
    backgroundColor: colors.line, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1,
  },
  previewTitle: { color: colors.ink, fontFamily: fonts.bodySemi, fontSize: 14.5 },
  previewMeta: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
});
