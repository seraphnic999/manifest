import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Modal, Platform } from "react-native";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { RenderItemParams, NestableScrollContainer, NestableDraggableFlatList } from "react-native-draggable-flatlist";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { supabase } from "@/lib/supabase";
import Icon from "@/components/icons/Icon";
import { colors, radius } from "@/lib/theme";
import { Item, Day } from "@/lib/types";
import { renumberedOrders } from "@/lib/reorder";
import { categoryForDbType } from "@/lib/itemTypeMeta";
import ItemTypePickerModal from "@/components/ItemTypePickerModal";
import TripScreenHeader from "@/components/TripScreenHeader";
import TripTabBar from "@/components/TripTabBar";
import { useTripHamburgerMenu } from "@/components/useTripHamburgerMenu";
import { formatDateDDMMYYYY, formatDateDDMM } from "@/lib/dateFormat";
import { normalizeTimeHHMM } from "@/lib/timeFormat";
import { useNetworkStatus } from "@/lib/useNetworkStatus";
import OfflineBanner from "@/components/OfflineBanner";
import { findOverlappingItemIds, isLastTripDay } from "@/lib/conflicts";
import { Alert } from "@/lib/alert";
import { buildDayColorMap } from "@/lib/mapData";
import DayCityPickerModal from "@/components/DayCityPickerModal";
import { CityPick } from "@/components/CityPickerModal";
import { fetchTripCities, fetchAllCities, dayCityLabel, setDayCity, TripCityRow } from "@/lib/cities";
import { DAY_COLOR_SWATCHES } from "@/lib/dayColors";

const STATUS_LABEL: Record<string, string> = {
  booked: "Booked", optional: "Optional", planned: "Planned",
};

function trimTheme(theme: string | null, max = 12) {
  if (!theme) return null;
  return theme.length > max ? theme.slice(0, max - 1) + "\u2026" : theme;
}

// "proposals" is a reserved route segment (not a real date) addressing the
// trip's one special no-date "Proposals" day — see days.date in schema.sql.
const PROPOSALS_SEGMENT = "proposals";

interface DayData {
  allDays: Day[];
  tripCities: TripCityRow[];
  dayId: string | null;
  theme: string | null;
  color: string | null;
  cityId: string | null;
  customCityName: string | null;
  orderable: Item[];
  stayBanners: Item[];
}

async function fetchDayData(tripId: string, date: string, isProposals: boolean): Promise<DayData> {
  const [{ data: days, error: daysError }, tripCities] = await Promise.all([
    supabase.from("days").select("*").eq("trip_id", tripId).order("sort_order"),
    fetchTripCities(tripId),
    fetchAllCities(), // warms the cities cache dayCityLabel() falls back on
  ]);
  if (daysError) throw daysError;
  const allDays = (days ?? []) as Day[];

  const day = isProposals ? allDays.find((d) => d.date === null) : allDays.find((d) => d.date === date);
  if (!day) {
    return {
      allDays, tripCities, dayId: null, theme: null, color: null,
      cityId: null, customCityName: null, orderable: [], stayBanners: [],
    };
  }

  const { data: dayItems, error: itemsError } = await supabase
    .from("items").select("*")
    .eq("day_id", day.id).is("deleted_at", null)
    // Note: not filtering out items with a parent_item_id — that field is
    // also used to link check-in/check-out events back to their lodging
    // span, and those DO belong in the ordered day timeline. Once true
    // multi-leg sub-steps are added, they'll need their own way to be
    // excluded here (e.g. a separate is_substep flag) rather than reusing
    // parent_item_id for both relationships.
    .order("sort_order");
  if (itemsError) throw itemsError;

  // A "stay spans this date" banner doesn't make sense for the Proposals
  // day, which has no date at all. Excludes the checkout day itself
  // (end_date) — that night isn't covered by this stay, so the banner
  // showing here used to hide the "no lodging" gap warning on genuine
  // checkout-with-nothing-booked-next days. Matches lib/conflicts.ts'
  // findLodgingGapDays, which already treats a stay's range as
  // [start_date, end_date).
  let stayBanners: Item[] = [];
  if (!isProposals) {
    const { data: spanningLodging, error } = await supabase
      .from("items").select("*")
      .eq("trip_id", tripId).eq("is_stay_span", true).is("deleted_at", null)
      .lte("start_date", date).gt("end_date", date);
    if (error) throw error;
    stayBanners = (spanningLodging ?? []) as Item[];
  }

  return {
    allDays, tripCities, dayId: day.id, theme: day.theme, color: day.color,
    cityId: day.city_id, customCityName: day.custom_city_name,
    orderable: (dayItems ?? []) as Item[], stayBanners,
  };
}

export default function DayView() {
  const { tripId, date } = useLocalSearchParams<{ tripId: string; date: string }>();
  const isProposals = date === PROPOSALS_SEGMENT;
  const isOnline = useNetworkStatus();
  const [stayBanners, setStayBanners] = useState<Item[]>([]);
  const [orderable, setOrderable] = useState<Item[]>([]);
  const [allDays, setAllDays] = useState<Day[]>([]);
  const [tripCities, setTripCities] = useState<TripCityRow[]>([]);
  const [dayId, setDayId] = useState<string | null>(null);
  const [theme, setTheme] = useState<string | null>(null);
  const [dayCityId, setDayCityId] = useState<string | null>(null);
  const [dayCustomCityName, setDayCustomCityName] = useState<string | null>(null);
  const [dayColor, setDayColor] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Unified day-edit modal (city + title + color), opened by tapping the
  // title block.
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editThemeDraft, setEditThemeDraft] = useState("");
  const [editCityPick, setEditCityPick] = useState<CityPick | null>(null);
  const [editColorDraft, setEditColorDraft] = useState<string>(colors.blue);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);

  const router = useRouter();
  const { menuItems, shareModal } = useTripHamburgerMenu(tripId);

  const { data, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["day", tripId, date],
    queryFn: () => fetchDayData(tripId, date, isProposals),
  });

  // Query data feeds these as the source of truth on every fetch; mutations
  // below (reorder, day edit) still update them directly for instant
  // feedback, same as before this screen read through TanStack Query.
  useEffect(() => {
    if (!data) return;
    setAllDays(data.allDays);
    setTripCities(data.tripCities);
    setDayId(data.dayId);
    setTheme(data.theme);
    setDayCityId(data.cityId);
    setDayCustomCityName(data.customCityName);
    setDayColor(data.color);
    setOrderable(data.orderable);
    setStayBanners(data.stayBanners);
  }, [data]);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  // Day-pill strip: auto-scroll to bring the current day into view instead
  // of leaving the user to scroll a long trip's strip by hand every time
  // they land here from elsewhere.
  const stripScrollRef = useRef<ScrollView>(null);
  const pillOffsets = useRef<Record<string, number>>({});
  const scrolledForKey = useRef<string | null>(null);

  function maybeScrollToActive() {
    const key = `${tripId}:${date}`;
    if (scrolledForKey.current === key) return;
    const activeId = isProposals ? allDays.find((d) => d.date === null)?.id : allDays.find((d) => d.date === date)?.id;
    if (!activeId) return;
    const x = pillOffsets.current[activeId];
    if (x == null || !stripScrollRef.current) return;
    stripScrollRef.current.scrollTo({ x: Math.max(0, x - 80), animated: false });
    scrolledForKey.current = key;
  }

  function requireOnline(): boolean {
    if (isOnline) return true;
    Alert.alert("You're offline", "Connect to the internet to make changes.");
    return false;
  }

  function handleSelectCategory(categoryKey: string) {
    setPickerOpen(false);
    const dateParam = isProposals ? "" : date;
    router.push(`/item/new?tripId=${tripId}&dayId=${dayId}&date=${dateParam}&category=${categoryKey}`);
  }

  function openEditModal() {
    if (!requireOnline()) return;
    setEditThemeDraft(theme ?? "");
    setEditCityPick(
      dayCityId || dayCustomCityName
        ? { cityId: dayCityId, customName: dayCustomCityName, label: dayCityLabel({ city_id: dayCityId, custom_city_name: dayCustomCityName }, tripCities) ?? "" }
        : null
    );
    setEditColorDraft(effectiveDayColor);
    setEditModalOpen(true);
  }

  // Persists all three day-edit fields together (single Save action for the
  // unified city + title + color modal).
  async function saveDayEdits() {
    if (!dayId) return;
    await setDayCity(dayId, tripId, { cityId: editCityPick?.cityId ?? null, customName: editCityPick?.customName ?? null });
    await supabase.from("days").update({ theme: editThemeDraft || null, color: editColorDraft }).eq("id", dayId);
    setTheme(editThemeDraft || null);
    setDayCityId(editCityPick?.cityId ?? null);
    setDayCustomCityName(editCityPick?.customName ?? null);
    setDayColor(editColorDraft);
    setAllDays((prev) => prev.map((d) => (d.id === dayId
      ? { ...d, theme: editThemeDraft || null, color: editColorDraft, city_id: editCityPick?.cityId ?? null, custom_city_name: editCityPick?.customName ?? null }
      : d)));
    if (editCityPick && !tripCities.some((r) => r.city_id === editCityPick.cityId && r.custom_name === editCityPick.customName)) {
      setTripCities(await fetchTripCities(tripId));
    }
    setEditModalOpen(false);
  }

  async function persistOrder(newOrder: Item[]) {
    setOrderable(newOrder); // optimistic
    const renumbered = renumberedOrders(newOrder);
    await Promise.all(
      renumbered.map((r) => supabase.from("items").update({ sort_order: r.sort_order }).eq("id", r.id))
    );
  }

  // Web-only fallback: react-native-gesture-handler's pan tracking doesn't
  // work on web in this setup (the drag "starts" but never tracks pointer
  // movement or fires a drop), so web gets plain up/down buttons that swap
  // adjacent items instead of fighting that library further. Native keeps
  // the real drag handle, where it works.
  function moveItem(item: Item, direction: -1 | 1) {
    if (!requireOnline()) return;
    const idx = orderable.findIndex((i) => i.id === item.id);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= orderable.length) return;
    const newOrder = [...orderable];
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    persistOrder(newOrder);
  }

  const overlappingIds = findOverlappingItemIds(orderable);
  const showLodgingGapWarning = !isProposals && stayBanners.length === 0 && !isLastTripDay(date, allDays);
  // Same lookup the map itself uses, so the square shown here always
  // matches what this day's items are colored on the map.
  const effectiveDayColor = dayId ? buildDayColorMap(allDays).get(dayId) ?? colors.blue : colors.blue;
  const effectiveCityLabel = dayCityLabel({ city_id: dayCityId, custom_city_name: dayCustomCityName }, tripCities);

  // Prev/next day navigation is scoped to dated days only — Proposals has
  // no chronological place among them.
  const datedDays = allDays.filter((d) => d.date !== null).sort((a, b) => (a.date! < b.date! ? -1 : 1));
  const datedIdx = isProposals ? -1 : datedDays.findIndex((d) => d.date === date);
  const prevDay = datedIdx > 0 ? datedDays[datedIdx - 1] : null;
  const nextDay = datedIdx >= 0 && datedIdx < datedDays.length - 1 ? datedDays[datedIdx + 1] : null;

  // Swipe left/right over the item list to move a day — scoped to just
  // that section (not the whole page) via activeOffsetX/failOffsetY so an
  // ordinary vertical scroll or the drag-reorder handle still wins for any
  // gesture that isn't a clearly horizontal swipe.
  const swipeGesture = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onEnd((e) => {
      if (e.translationX < -60 && nextDay) router.replace(`/trip/${tripId}/day/${nextDay.date}`);
      else if (e.translationX > 60 && prevDay) router.replace(`/trip/${tripId}/day/${prevDay.date}`);
    });

  function renderItem({ item, drag, isActive }: RenderItemParams<Item>) {
    const idx = orderable.findIndex((i) => i.id === item.id);
    const isFirst = idx <= 0;
    const isLast = idx === orderable.length - 1;
    const isOverlapping = overlappingIds.has(item.id);
    return (
      <View style={[styles.row, isActive && styles.rowActive, isOverlapping && styles.rowOverlap]}>
        <Pressable
          style={styles.rowMain}
          onPress={() => router.push(`/item/${item.id}`)}
          disabled={isActive}
        >
          <View style={[styles.timeCol, !item.time_start && styles.timeColMuted]}>
            <Text style={styles.timeText}>{normalizeTimeHHMM(item.time_start) || "\u2014"}</Text>
            {isOverlapping && <Icon name="warning" size={11} color={colors.coral} style={{ marginTop: 2 }} />}
            {item.type === "flight" && item.time_end ? (
              <>
                <Text style={styles.timeArrowSmall}>{"\u2193"}</Text>
                <Text style={styles.timeTextSecondary}>{normalizeTimeHHMM(item.time_end)}</Text>
              </>
            ) : null}
          </View>
          <View style={styles.body}>
            <View style={styles.itemIconCol}>
              <Icon name={categoryForDbType(item.type).icon} size={24} color={colors.blue} />
            </View>
            <View style={styles.itemTextCol}>
              <View style={styles.row1}>
                <Text style={styles.typeTag}>{item.type.toUpperCase()}</Text>
                <Text style={styles.statusBadge}>{STATUS_LABEL[item.status]}</Text>
              </View>
              <Text style={styles.itemTitle}>{item.title}</Text>
            </View>
          </View>
        </Pressable>
        {Platform.OS === "web" ? (
          <View style={styles.reorderButtons}>
            <Pressable
              style={[styles.reorderBtn, isFirst && styles.reorderBtnDisabled]}
              onPress={() => moveItem(item, -1)}
              disabled={isFirst}
            >
              <Text style={styles.reorderBtnText}>{"\u25b2"}</Text>
            </Pressable>
            <Pressable
              style={[styles.reorderBtn, isLast && styles.reorderBtnDisabled]}
              onPress={() => moveItem(item, 1)}
              disabled={isLast}
            >
              <Text style={styles.reorderBtnText}>{"\u25bc"}</Text>
            </Pressable>
          </View>
        ) : (
          // Drag trigger is isolated to this handle only \u2014 onPressIn (not
          // onLongPress) is react-native-draggable-flatlist's documented
          // pattern for a dedicated handle, and keeping it a separate
          // Pressable (not overlapping the row's own tap-to-open area)
          // avoids the two touch handlers fighting over the same gesture.
          <Pressable style={styles.dragHandle} onPressIn={() => { if (requireOnline()) drag(); }} disabled={isActive}>
            <Text style={styles.dragHandleText}>{"\u2630"}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <TripScreenHeader
        title={isProposals ? "Proposals" : formatDateDDMMYYYY(date)}
        tripId={tripId}
        menuItems={menuItems}
        onBack={() => (router.canGoBack() ? router.back() : router.push(`/trip/${tripId}`))}
      />
      {shareModal}
      <OfflineBanner dataUpdatedAt={!isOnline ? dataUpdatedAt : undefined} />

      <View style={styles.dayStripOuter}>
        <ScrollView
          ref={stripScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dayStripContent}
          // Web: a horizontal-only ScrollView doesn't respond to a plain
          // (vertical) mouse wheel at all — that's standard browser
          // behavior for overflow-x scrollers, not something RN's
          // horizontal prop changes. Redirect vertical wheel delta into
          // horizontal scroll so a normal mouse (not just trackpad/shift)
          // can scroll the day-pill strip.
          {...(Platform.OS === "web" ? {
            onWheel: (e: any) => {
              if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.currentTarget.scrollLeft += e.deltaY;
                e.preventDefault();
              }
            },
          } : {})}
        >
          {allDays.map((d) => {
            const active = d.date === null ? isProposals : d.date === date;
            const href = d.date === null ? `/trip/${tripId}/day/${PROPOSALS_SEGMENT}` : `/trip/${tripId}/day/${d.date}`;
            return (
              <Pressable
                key={d.id}
                style={[styles.dayPill, active && styles.dayPillActive]}
                onPress={() => router.replace(href)}
                onLayout={(e) => { pillOffsets.current[d.id] = e.nativeEvent.layout.x; maybeScrollToActive(); }}
              >
                <Text style={[styles.dayPillText, active && styles.dayPillTextActive]}>
                  {d.date === null ? "Proposals" : formatDateDDMM(d.date)}
                </Text>
                {trimTheme(d.theme) && d.date !== null && (
                  <Text style={[styles.dayPillTheme, active && styles.dayPillTextActive]} numberOfLines={1}>
                    {trimTheme(d.theme)}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* The theme row, stay banner, and item list are all one scrollable
          page (NestableScrollContainer), with the item list itself using
          the "Nestable" variant of the draggable list \u2014 the library's own
          documented way to embed drag-reorder inside a larger scrolling
          page without the outer scroll and the inner drag gesture fighting
          each other, which a plain DraggableFlatList here would do. */}
      <NestableScrollContainer contentContainerStyle={{ paddingBottom: 90 }}>
        <View style={styles.themeRow}>
          <Pressable style={styles.themeMain} onPress={openEditModal}>
            <Text style={effectiveCityLabel ? styles.themeText : styles.themePlaceholder}>
              {effectiveCityLabel || "Add a destination\u2026"}
            </Text>
            {theme && (
              <Text style={styles.dayTitleSecondary} numberOfLines={1}>{theme}</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.colorSquare, { backgroundColor: effectiveDayColor }]}
            onPress={openEditModal}
            accessibilityLabel="Change this day's map color"
          />
        </View>

        {showLodgingGapWarning && (
          <View style={styles.gapWarning}>
            <Icon name="warning" size={14} color={colors.coral} />
            <Text style={styles.gapWarningText}>No lodging booked for this night.</Text>
          </View>
        )}

        {stayBanners.map((item) => (
          <Pressable key={item.id} style={styles.stayBanner} onPress={() => router.push(`/item/${item.id}`)}>
            <Text style={styles.stayBannerLabel}>STAY</Text>
            <Text style={styles.stayBannerTitle}>{item.title}</Text>
          </Pressable>
        ))}

        <GestureDetector gesture={swipeGesture}>
          <View>
            <NestableDraggableFlatList
              data={orderable}
              keyExtractor={(i) => i.id}
              onDragEnd={({ data }) => persistOrder(data)}
              renderItem={renderItem}
              contentContainerStyle={{ padding: 16 }}
              ListEmptyComponent={<Text style={styles.empty}>Nothing planned yet.</Text>}
            />
          </View>
        </GestureDetector>
      </NestableScrollContainer>

      <Pressable
        style={[styles.floatingNavArrow, styles.floatingNavArrowLeft, !prevDay && styles.floatingNavArrowDisabled]}
        disabled={!prevDay}
        onPress={() => prevDay && router.replace(`/trip/${tripId}/day/${prevDay.date}`)}
        accessibilityLabel="Previous day"
      >
        <Icon name="back" size={20} color="#fff" />
      </Pressable>
      <Pressable
        style={[styles.floatingNavArrow, styles.floatingNavArrowRight, !nextDay && styles.floatingNavArrowDisabled]}
        disabled={!nextDay}
        onPress={() => nextDay && router.replace(`/trip/${tripId}/day/${nextDay.date}`)}
        accessibilityLabel="Next day"
      >
        <Icon name="forward" size={20} color="#fff" />
      </Pressable>

      <Pressable style={styles.fab} onPress={() => { if (requireOnline()) setPickerOpen(true); }}>
        <Icon name="add" size={24} color="#fff" />
      </Pressable>

      <ItemTypePickerModal visible={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handleSelectCategory} />

      <Modal visible={editModalOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setEditModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalLabel}>City</Text>
            <Pressable style={styles.editCityRow} onPress={() => setCityPickerOpen(true)}>
              <Text style={styles.editCityRowText}>
                {editCityPick?.label || dayCityLabel({ city_id: null, custom_city_name: null }, tripCities) || "Pick a city\u2026"}
              </Text>
              <Icon name="edit" size={14} color={colors.blue} />
            </Pressable>

            <Text style={[styles.modalLabel, { marginTop: 16 }]}>Day title</Text>
            <TextInput
              style={styles.modalInput}
              value={editThemeDraft}
              onChangeText={setEditThemeDraft}
              placeholder={"e.g. At sea, Working half day\u2026"}
            />

            <Text style={[styles.modalLabel, { marginTop: 16 }]}>Day color</Text>
            <View style={styles.editColorGrid}>
              {DAY_COLOR_SWATCHES.map((swatch) => {
                const isSelected = swatch.hex.toLowerCase() === editColorDraft.toLowerCase();
                return (
                  <Pressable
                    key={swatch.hex}
                    style={[styles.editColorSwatch, { backgroundColor: swatch.hex }, isSelected && styles.editColorSwatchActive]}
                    onPress={() => setEditColorDraft(swatch.hex)}
                    accessibilityLabel={swatch.label}
                  >
                    {isSelected && <Icon name="check" size={14} color="#fff" />}
                  </Pressable>
                );
              })}
            </View>

            <Pressable style={styles.modalSaveBtn} onPress={saveDayEdits}>
              <Text style={styles.modalSaveText}>Save</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <DayCityPickerModal
        visible={cityPickerOpen}
        onClose={() => setCityPickerOpen(false)}
        tripCities={tripCities}
        current={editCityPick}
        onSelect={setEditCityPick}
      />

      <TripTabBar tripId={tripId} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  dayStripOuter: {
    height: 56, backgroundColor: colors.paperRaised,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  dayStripContent: { alignItems: "center", paddingHorizontal: 12 },
  dayPill: {
    height: 40, justifyContent: "center",
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, marginRight: 6,
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, minWidth: 56, alignItems: "center",
  },
  dayPillActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  dayPillText: { fontFamily: "JetBrainsMono_600SemiBold", fontSize: 11, fontWeight: "600", color: colors.inkSoft },
  dayPillTheme: { fontSize: 8, color: colors.lightBlue, marginTop: 1, maxWidth: 60 },
  dayPillTextActive: { color: colors.paper },
  themeRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.paperRaised, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  themeMain: { flex: 1, justifyContent: "center" },
  colorSquare: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: colors.line },
  themeText: { color: colors.lightBlue, fontWeight: "700", fontSize: 14 },
  themePlaceholder: { color: colors.inkSoft, fontStyle: "italic", fontSize: 13 },
  dayTitleSecondary: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
  editCityRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12,
  },
  editCityRowText: { color: colors.ink, fontWeight: "600", fontSize: 14, flex: 1 },
  editColorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  editColorSwatch: {
    width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.line,
  },
  editColorSwatchActive: { borderWidth: 3, borderColor: colors.gold },
  gapWarning: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(193,84,63,0.1)",
    marginHorizontal: 16, marginTop: 10, padding: 10, borderRadius: radius.md,
  },
  gapWarningText: { color: colors.coral, fontWeight: "600", fontSize: 12 },
  rowOverlap: { borderColor: colors.coral, borderWidth: 2 },
  stayBanner: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.amberSoft,
    marginHorizontal: 16, marginTop: 10, padding: 10, borderRadius: radius.md,
  },
  stayBannerLabel: { fontFamily: "JetBrainsMono_600SemiBold", fontSize: 10, fontWeight: "700", color: "#7A521A" },
  stayBannerTitle: { color: colors.ink, fontWeight: "600", fontSize: 13 },
  row: {
    flexDirection: "row", backgroundColor: colors.paperRaised, alignItems: "stretch",
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, marginBottom: 8, overflow: "hidden",
  },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "stretch" },
  rowActive: { opacity: 0.85, borderColor: colors.blue, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 6 },
  timeCol: { width: 60, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", padding: 6 },
  timeColMuted: { backgroundColor: "#C7BFA9" },
  timeText: { fontFamily: "JetBrainsMono_600SemiBold", color: colors.paper, fontSize: 11, fontWeight: "600" },
  timeArrowSmall: { color: colors.amberSoft, fontSize: 8, marginVertical: 1 },
  timeTextSecondary: { fontFamily: "JetBrainsMono_600SemiBold", color: colors.amberSoft, fontSize: 9, fontWeight: "600" },
  body: { flex: 1, padding: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  itemIconCol: { alignItems: "center", justifyContent: "center" },
  itemTextCol: { flex: 1 },
  row1: { flexDirection: "row", alignItems: "center", gap: 6 },
  typeTag: { fontFamily: "JetBrainsMono_600SemiBold", fontSize: 9, color: colors.lightBlue, fontWeight: "600" },
  statusBadge: { fontSize: 9, color: colors.inkSoft, marginLeft: "auto" },
  itemTitle: { color: colors.ink, fontWeight: "600", fontSize: 14, marginTop: 2 },
  empty: { textAlign: "center", color: colors.inkSoft, marginTop: 40 },
  dragHandle: { width: 34, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper },
  dragHandleText: { color: colors.inkSoft, fontSize: 16 },
  reorderButtons: { width: 34, backgroundColor: colors.paper, justifyContent: "center" },
  reorderBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 6 },
  reorderBtnDisabled: { opacity: 0.25 },
  reorderBtnText: { color: colors.inkSoft, fontSize: 13, fontWeight: "700" },
  fab: {
    position: "absolute", bottom: 74, right: 16, width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.ink, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  floatingNavArrow: {
    position: "absolute", bottom: 74, width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.ink, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  floatingNavArrowLeft: { left: 16 },
  floatingNavArrowRight: { right: 80 },
  floatingNavArrowDisabled: { opacity: 0.35 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.4)", justifyContent: "center", padding: 30 },
  modalCard: { backgroundColor: colors.paperRaised, borderRadius: radius.lg, padding: 18, width: "100%", maxWidth: 420, alignSelf: "center" },
  modalLabel: { color: colors.inkSoft, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 },
  modalInput: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink },
  modalSaveBtn: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 12, alignItems: "center", marginTop: 14 },
  modalSaveText: { color: colors.paper, fontWeight: "700" },
});
