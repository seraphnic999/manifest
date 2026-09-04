import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Modal, Platform } from "react-native";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import { RenderItemParams, NestableScrollContainer, NestableDraggableFlatList } from "react-native-draggable-flatlist";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { Item, Day } from "@/lib/types";
import { renumberedOrders } from "@/lib/reorder";
import { categoryForDbType } from "@/lib/itemTypeMeta";
import ItemTypePickerModal from "@/components/ItemTypePickerModal";
import TripNavBar from "@/components/TripNavBar";
import { formatDateDDMMYYYY, formatDateDDMM } from "@/lib/dateFormat";
import { normalizeTimeHHMM } from "@/lib/timeFormat";
import HomeButton from "@/components/HomeButton";

const STATUS_LABEL: Record<string, string> = {
  booked: "Booked", optional: "Optional", planned: "Planned",
};

function trimTheme(theme: string | null, max = 12) {
  if (!theme) return null;
  return theme.length > max ? theme.slice(0, max - 1) + "\u2026" : theme;
}

export default function DayView() {
  const { tripId, date } = useLocalSearchParams<{ tripId: string; date: string }>();
  const [stayBanners, setStayBanners] = useState<Item[]>([]);
  const [orderable, setOrderable] = useState<Item[]>([]);
  const [allDays, setAllDays] = useState<Day[]>([]);
  const [dayId, setDayId] = useState<string | null>(null);
  const [theme, setTheme] = useState<string | null>(null);
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [themeDraft, setThemeDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const { data: days } = await supabase
      .from("days").select("*").eq("trip_id", tripId).order("sort_order");
    if (days) setAllDays(days as Day[]);

    const day = days?.find((d) => d.date === date);
    if (!day) return;
    setDayId(day.id);
    setTheme(day.theme);

    const { data: dayItems } = await supabase
      .from("items").select("*")
      .eq("day_id", day.id).is("deleted_at", null)
      // Note: not filtering out items with a parent_item_id — that field is
      // also used to link check-in/check-out events back to their lodging
      // span, and those DO belong in the ordered day timeline. Once true
      // multi-leg sub-steps are added, they'll need their own way to be
      // excluded here (e.g. a separate is_substep flag) rather than reusing
      // parent_item_id for both relationships.
      .order("sort_order");

    const { data: spanningLodging } = await supabase
      .from("items").select("*")
      .eq("trip_id", tripId).eq("is_stay_span", true).is("deleted_at", null)
      .lte("start_date", date).gte("end_date", date);

    setStayBanners((spanningLodging ?? []) as Item[]);
    setOrderable((dayItems ?? []) as Item[]);
  }, [tripId, date]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  function handleSelectCategory(categoryKey: string) {
    setPickerOpen(false);
    router.push(`/item/new?tripId=${tripId}&dayId=${dayId}&date=${date}&category=${categoryKey}`);
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
    const idx = orderable.findIndex((i) => i.id === item.id);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= orderable.length) return;
    const newOrder = [...orderable];
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    persistOrder(newOrder);
  }

  function renderItem({ item, drag, isActive }: RenderItemParams<Item>) {
    const idx = orderable.findIndex((i) => i.id === item.id);
    const isFirst = idx <= 0;
    const isLast = idx === orderable.length - 1;
    return (
      <View style={[styles.row, isActive && styles.rowActive]}>
        <Pressable
          style={styles.rowMain}
          onPress={() => router.push(`/item/${item.id}`)}
          disabled={isActive}
        >
          <View style={[styles.timeCol, !item.time_start && styles.timeColMuted]}>
            <Text style={styles.timeText}>{normalizeTimeHHMM(item.time_start) || "\u2014"}</Text>
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
          <Pressable style={styles.dragHandle} onPressIn={drag} disabled={isActive}>
            <Text style={styles.dragHandleText}>{"\u2630"}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: formatDateDDMMYYYY(date),
        headerRight: () => (
          <View style={{ marginRight: 14 }}>
            <HomeButton />
          </View>
        ),
      }} />

      <TripNavBar tripId={tripId} active="day" />

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
          {allDays.map((d) => (
            <Pressable
              key={d.id}
              style={[styles.dayPill, d.date === date && styles.dayPillActive]}
              onPress={() => router.replace(`/trip/${tripId}/day/${d.date}`)}
            >
              <Text style={[styles.dayPillText, d.date === date && styles.dayPillTextActive]}>
                {formatDateDDMM(d.date)}
              </Text>
              {trimTheme(d.theme) && (
                <Text style={[styles.dayPillTheme, d.date === date && styles.dayPillTextActive]} numberOfLines={1}>
                  {trimTheme(d.theme)}
                </Text>
              )}
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* The theme row, stay banner, and item list are all one scrollable
          page (NestableScrollContainer), with the item list itself using
          the "Nestable" variant of the draggable list \u2014 the library's own
          documented way to embed drag-reorder inside a larger scrolling
          page without the outer scroll and the inner drag gesture fighting
          each other, which a plain DraggableFlatList here would do. */}
      <NestableScrollContainer contentContainerStyle={{ paddingBottom: 90 }}>
        <Pressable style={styles.themeRow} onPress={() => { setThemeDraft(theme ?? ""); setThemeModalOpen(true); }}>
          <Text style={theme ? styles.themeText : styles.themePlaceholder}>
            {theme || "Add a day title\u2026"}
          </Text>
          <Text style={styles.themeEdit}>Edit</Text>
        </Pressable>

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

      <Pressable style={styles.fab} onPress={() => setPickerOpen(true)}>
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
  dayPillText: { fontFamily: "IBMPlexMono_500Medium", fontSize: 11, fontWeight: "600", color: colors.inkSoft },
  dayPillTheme: { fontSize: 8, color: colors.teal, marginTop: 1, maxWidth: 60 },
  dayPillTextActive: { color: colors.paper },
  themeRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.paperRaised, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  themeText: { color: colors.teal, fontWeight: "700", fontSize: 14 },
  themePlaceholder: { color: colors.inkSoft, fontStyle: "italic", fontSize: 13 },
  themeEdit: { color: colors.amber, fontSize: 12, fontWeight: "600" },
  stayBanner: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.amberSoft,
    marginHorizontal: 16, marginTop: 10, padding: 10, borderRadius: radius.md,
  },
  stayBannerLabel: { fontFamily: "IBMPlexMono_500Medium", fontSize: 10, fontWeight: "700", color: "#7A521A" },
  stayBannerTitle: { color: colors.ink, fontWeight: "600", fontSize: 13 },
  row: {
    flexDirection: "row", backgroundColor: colors.paperRaised, alignItems: "stretch",
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, marginBottom: 8, overflow: "hidden",
  },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "stretch" },
  rowActive: { opacity: 0.85, borderColor: colors.amber, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 6 },
  timeCol: { width: 60, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", padding: 6 },
  timeColMuted: { backgroundColor: "#C7BFA9" },
  timeText: { fontFamily: "IBMPlexMono_500Medium", color: colors.paper, fontSize: 11, fontWeight: "600" },
  timeArrowSmall: { color: colors.amberSoft, fontSize: 8, marginVertical: 1 },
  timeTextSecondary: { fontFamily: "IBMPlexMono_500Medium", color: colors.amberSoft, fontSize: 9, fontWeight: "600" },
  body: { flex: 1, padding: 10 },
  row1: { flexDirection: "row", alignItems: "center", gap: 6 },
  typeTag: { fontFamily: "IBMPlexMono_500Medium", fontSize: 9, color: colors.teal, fontWeight: "600" },
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
    position: "absolute", bottom: 20, alignSelf: "center",
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
