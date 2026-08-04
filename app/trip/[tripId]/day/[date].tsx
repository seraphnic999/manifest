import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Modal } from "react-native";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import DraggableFlatList, { RenderItemParams } from "react-native-draggable-flatlist";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { Item, Day } from "@/lib/types";
import { renumberedOrders } from "@/lib/reorder";
import ItemTypePickerModal from "@/components/ItemTypePickerModal";
import TripNavBar from "@/components/TripNavBar";

const STATUS_LABEL: Record<string, string> = {
  booked: "Booked", optional: "Optional", idea: "Idea", pending: "Pending",
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

  async function handleDragEnd(newOrder: Item[]) {
    setOrderable(newOrder); // optimistic
    const renumbered = renumberedOrders(newOrder);
    await Promise.all(
      renumbered.map((r) => supabase.from("items").update({ sort_order: r.sort_order }).eq("id", r.id))
    );
  }

  function renderItem({ item, drag, isActive }: RenderItemParams<Item>) {
    return (
      <Pressable
        style={[styles.row, isActive && styles.rowActive]}
        onLongPress={drag}
        onPress={() => router.push(`/item/${item.id}`)}
        delayLongPress={150}
      >
        <View style={[styles.timeCol, !item.time_start && styles.timeColMuted]}>
          <Text style={styles.timeText}>{item.time_start ?? "\u2014"}</Text>
        </View>
        <View style={styles.body}>
          <View style={styles.row1}>
            <Text style={styles.typeTag}>{item.type.toUpperCase()}</Text>
            <Text style={styles.statusBadge}>{STATUS_LABEL[item.status]}</Text>
          </View>
          <Text style={styles.itemTitle}>{item.title}</Text>
        </View>
        <View style={styles.dragHandle}><Text style={styles.dragHandleText}>{"\u2630"}</Text></View>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: date }} />

      <TripNavBar tripId={tripId} active="day" />

      <View style={styles.dayStripOuter}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStripContent}>
          {allDays.map((d) => (
            <Pressable
              key={d.id}
              style={[styles.dayPill, d.date === date && styles.dayPillActive]}
              onPress={() => router.replace(`/trip/${tripId}/day/${d.date}`)}
            >
              <Text style={[styles.dayPillText, d.date === date && styles.dayPillTextActive]}>
                {d.date.slice(5)}
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

      <DraggableFlatList
        data={orderable}
        keyExtractor={(i) => i.id}
        onDragEnd={({ data }) => handleDragEnd(data)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        ListEmptyComponent={<Text style={styles.empty}>Nothing planned yet.</Text>}
      />

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
  rowActive: { opacity: 0.85, borderColor: colors.amber, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 6 },
  timeCol: { width: 60, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", padding: 6 },
  timeColMuted: { backgroundColor: "#C7BFA9" },
  timeText: { fontFamily: "IBMPlexMono_500Medium", color: colors.paper, fontSize: 11, fontWeight: "600" },
  body: { flex: 1, padding: 10 },
  row1: { flexDirection: "row", alignItems: "center", gap: 6 },
  typeTag: { fontFamily: "IBMPlexMono_500Medium", fontSize: 9, color: colors.teal, fontWeight: "600" },
  statusBadge: { fontSize: 9, color: colors.inkSoft, marginLeft: "auto" },
  itemTitle: { color: colors.ink, fontWeight: "600", fontSize: 14, marginTop: 2 },
  empty: { textAlign: "center", color: colors.inkSoft, marginTop: 40 },
  dragHandle: { width: 34, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper },
  dragHandleText: { color: colors.inkSoft, fontSize: 16 },
  fab: {
    position: "absolute", bottom: 20, alignSelf: "center",
    backgroundColor: colors.ink, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 24,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  fabText: { color: colors.paper, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.4)", justifyContent: "center", padding: 30 },
  modalCard: { backgroundColor: colors.paperRaised, borderRadius: radius.lg, padding: 18 },
  modalLabel: { color: colors.inkSoft, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 },
  modalInput: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink },
  modalSaveBtn: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 12, alignItems: "center", marginTop: 14 },
  modalSaveText: { color: colors.paper, fontWeight: "700" },
});
