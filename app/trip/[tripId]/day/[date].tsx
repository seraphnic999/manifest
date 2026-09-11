import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Modal, Platform } from "react-native";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { RenderItemParams, NestableScrollContainer, NestableDraggableFlatList } from "react-native-draggable-flatlist";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
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
  dayId: string | null;
  theme: string | null;
  orderable: Item[];
  stayBanners: Item[];
}

async function fetchDayData(tripId: string, date: string, isProposals: boolean): Promise<DayData> {
  const { data: days, error: daysError } = await supabase
    .from("days").select("*").eq("trip_id", tripId).order("sort_order");
  if (daysError) throw daysError;
  const allDays = (days ?? []) as Day[];

  const day = isProposals ? allDays.find((d) => d.date === null) : allDays.find((d) => d.date === date);
  if (!day) return { allDays, dayId: null, theme: null, orderable: [], stayBanners: [] };

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

  return { allDays, dayId: day.id, theme: day.theme, orderable: (dayItems ?? []) as Item[], stayBanners };
}

export default function DayView() {
  const { tripId, date } = useLocalSearchParams<{ tripId: string; date: string }>();
  const isProposals = date === PROPOSALS_SEGMENT;
  const isOnline = useNetworkStatus();
  const [stayBanners, setStayBanners] = useState<Item[]>([]);
  const [orderable, setOrderable] = useState<Item[]>([]);
  const [allDays, setAllDays] = useState<Day[]>([]);
  const [dayId, setDayId] = useState<string | null>(null);
  const [theme, setTheme] = useState<string | null>(null);
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [themeDraft, setThemeDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const router = useRouter();
  const { menuItems, shareModal } = useTripHamburgerMenu(tripId);

  const { data, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["day", tripId, date],
    queryFn: () => fetchDayData(tripId, date, isProposals),
  });

  // Query data feeds these as the source of truth on every fetch; mutations
  // below (reorder, theme edit) still update them directly for instant
  // feedback, same as before this screen read through TanStack Query.
  useEffect(() => {
    if (!data) return;
    setAllDays(data.allDays);
    setDayId(data.dayId);
    setTheme(data.theme);
    setOrderable(data.orderable);
    setStayBanners(data.stayBanners);
  }, [data]);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

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

  async function saveTheme() {
    if (!dayId) return;
    await supabase.from("days").update({ theme: themeDraft || null }).eq("id", dayId);
    setTheme(themeDraft || null);
    setThemeModalOpen(false);
    setAllDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, theme: themeDraft || null } : d)));
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
            {isOverlapping && <Ionicons name="warning" size={11} color={colors.coral} style={{ marginTop: 2 }} />}
            {item.type === "flight" && item.time_end ? (
              <>
                <Text style={styles.timeArrowSmall}>{"\u2193"}</Text>
                <Text style={styles.timeTextSecondary}>{normalizeTimeHHMM(item.time_end)}</Text>
              </>
            ) : null}
          </View>
          <View style={styles.body}>
            <View style={styles.row1}>
              <Ionicons name={categoryForDbType(item.type).icon as any} size={12} color={colors.teal} />
              <Text style={styles.typeTag}>{item.type.toUpperCase()}</Text>
              <Text style={styles.statusBadge}>{STATUS_LABEL[item.status]}</Text>
            </View>
            <Text style={styles.itemTitle}>{item.title}</Text>
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
        <Pressable
          style={styles.themeRow}
          onPress={() => { if (requireOnline()) { setThemeDraft(theme ?? ""); setThemeModalOpen(true); } }}
        >
          <Text style={theme ? styles.themeText : styles.themePlaceholder}>
            {theme || "Add a day title\u2026"}
          </Text>
          <Text style={styles.themeEdit}>Edit</Text>
        </Pressable>

        {showLodgingGapWarning && (
          <View style={styles.gapWarning}>
            <Ionicons name="warning" size={14} color={colors.coral} />
            <Text style={styles.gapWarningText}>No lodging booked for this night.</Text>
          </View>
        )}

        {stayBanners.map((item) => (
          <Pressable key={item.id} style={styles.stayBanner} onPress={() => router.push(`/item/${item.id}`)}>
            <Text style={styles.stayBannerLabel}>STAY</Text>
            <Text style={styles.stayBannerTitle}>{item.title}</Text>
          </Pressable>
        ))}

        <NestableDraggableFlatList
          data={orderable}
          keyExtractor={(i) => i.id}
          onDragEnd={({ data }) => persistOrder(data)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={styles.empty}>Nothing planned yet.</Text>}
        />
      </NestableScrollContainer>

      <Pressable style={styles.fab} onPress={() => { if (requireOnline()) setPickerOpen(true); }}>
        <Text style={styles.fabText}>+ Add item</Text>
      </Pressable>

      <ItemTypePickerModal visible={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handleSelectCategory} />

      <Modal visible={themeModalOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setThemeModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalLabel}>Day title</Text>
            <TextInput
              style={styles.modalInput}
              value={themeDraft}
              onChangeText={setThemeDraft}
              placeholder={"e.g. At sea, Working half day\u2026"}
              autoFocus
            />
            <Pressable style={styles.modalSaveBtn} onPress={saveTheme}>
              <Text style={styles.modalSaveText}>Save</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <TripTabBar tripId={tripId} active="overview" />
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
  dayPillTheme: { fontSize: 8, color: colors.teal, marginTop: 1, maxWidth: 60 },
  dayPillTextActive: { color: colors.paper },
  themeRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.paperRaised, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  themeText: { color: colors.teal, fontWeight: "700", fontSize: 14 },
  themePlaceholder: { color: colors.inkSoft, fontStyle: "italic", fontSize: 13 },
  themeEdit: { color: colors.blue, fontSize: 12, fontWeight: "600" },
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
  body: { flex: 1, padding: 10 },
  row1: { flexDirection: "row", alignItems: "center", gap: 6 },
  typeTag: { fontFamily: "JetBrainsMono_600SemiBold", fontSize: 9, color: colors.teal, fontWeight: "600" },
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
    position: "absolute", bottom: 74, alignSelf: "center",
    backgroundColor: colors.ink, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 24,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  fabText: { color: colors.paper, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.4)", justifyContent: "center", padding: 30 },
  modalCard: { backgroundColor: colors.paperRaised, borderRadius: radius.lg, padding: 18, width: "100%", maxWidth: 420, alignSelf: "center" },
  modalLabel: { color: colors.inkSoft, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 },
  modalInput: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink },
  modalSaveBtn: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 12, alignItems: "center", marginTop: 14 },
  modalSaveText: { color: colors.paper, fontWeight: "700" },
});
