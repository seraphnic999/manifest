import { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, StyleSheet, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { Item, Day } from "@/lib/types";
import { renumberedOrders, needsRenumber } from "@/lib/reorder";
import ItemTypePickerModal from "@/components/ItemTypePickerModal";

const STATUS_LABEL: Record<string, string> = {
  booked: "Booked", optional: "Optional", idea: "Idea", pending: "Pending",
};

export default function DayView() {
  const { tripId, date } = useLocalSearchParams<{ tripId: string; date: string }>();
  const [items, setItems] = useState<Item[]>([]);
  const [allDays, setAllDays] = useState<Day[]>([]);
  const [dayId, setDayId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const { data: days } = await supabase
      .from("days").select("*").eq("trip_id", tripId).order("sort_order");
    if (days) setAllDays(days as Day[]);

    const day = days?.find((d) => d.date === date);
    if (!day) return;
    setDayId(day.id);

    const { data: dayItems } = await supabase
      .from("items").select("*")
      .eq("day_id", day.id).is("deleted_at", null)
      .is("parent_item_id", null) // top-level only; sub-steps fetched on details page
      .order("sort_order");

    const { data: spanningLodging } = await supabase
      .from("items").select("*")
      .eq("trip_id", tripId).eq("is_stay_span", true).is("deleted_at", null)
      .lte("start_date", date).gte("end_date", date);

    setItems([...(spanningLodging ?? []), ...((dayItems ?? []) as Item[])]);
  }, [tripId, date]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load])); // refresh after add/edit

  function handleSelectCategory(categoryKey: string) {
    setPickerOpen(false);
    router.push(`/item/new?tripId=${tripId}&dayId=${dayId}&date=${date}&category=${categoryKey}`);
  }

  // Reorderable items are the plain day items (not lodging-span banners).
  const orderable = items.filter((i) => !i.is_stay_span);

  async function move(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= orderable.length) return;
    const a = orderable[index];
    const b = orderable[targetIndex];

    if (needsRenumber(
      Math.min(a.sort_order, b.sort_order),
      Math.max(a.sort_order, b.sort_order)
    ) === false) {
      // Simple case: swap sort_order values.
      await supabase.from("items").update({ sort_order: b.sort_order }).eq("id", a.id);
      await supabase.from("items").update({ sort_order: a.sort_order }).eq("id", b.id);
    } else {
      // Neighbors ran out of integer room — renumber the whole day with
      // clean 1000-apart gaps, with a and b already swapped.
      const reordered = [...orderable];
      [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
      const renumbered = renumberedOrders(reordered);
      await Promise.all(
        renumbered.map((r) => supabase.from("items").update({ sort_order: r.sort_order }).eq("id", r.id))
      );
    }
    load();
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: date }} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayStrip} contentContainerStyle={{ paddingHorizontal: 12 }}>
        {allDays.map((d) => (
          <Pressable
            key={d.id}
            style={[styles.dayPill, d.date === date && styles.dayPillActive]}
            onPress={() => router.replace(`/trip/${tripId}/day/${d.date}`)}
          >
            <Text style={[styles.dayPillText, d.date === date && styles.dayPillTextActive]}>
              {d.date.slice(5)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => {
          const idx = orderable.findIndex((o) => o.id === item.id);
          return (
            <View style={styles.rowWrap}>
              <Pressable style={styles.row} onPress={() => router.push(`/item/${item.id}`)}>
                <View style={[styles.timeCol, !item.time_start && styles.timeColMuted]}>
                  <Text style={styles.timeText}>
                    {item.is_stay_span ? "STAY" : item.time_start ?? "\u2014"}
                  </Text>
                </View>
                <View style={styles.body}>
                  <View style={styles.row1}>
                    <Text style={styles.typeTag}>{item.type.toUpperCase()}</Text>
                    <Text style={styles.statusBadge}>{STATUS_LABEL[item.status]}</Text>
                  </View>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                </View>
              </Pressable>
              {!item.is_stay_span && (
                <View style={styles.moveCol}>
                  <Pressable
                    disabled={idx <= 0}
                    style={[styles.moveBtn, idx <= 0 && styles.moveBtnDisabled]}
                    onPress={() => move(idx, -1)}
                  >
                    <Text style={styles.moveBtnText}>{"\u2191"}</Text>
                  </Pressable>
                  <Pressable
                    disabled={idx === -1 || idx >= orderable.length - 1}
                    style={[styles.moveBtn, (idx === -1 || idx >= orderable.length - 1) && styles.moveBtnDisabled]}
                    onPress={() => move(idx, 1)}
                  >
                    <Text style={styles.moveBtnText}>{"\u2193"}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Nothing planned yet.</Text>}
      />

      <Pressable style={styles.fab} onPress={() => setPickerOpen(true)}>
        <Text style={styles.fabText}>+ Add item</Text>
      </Pressable>

      <ItemTypePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectCategory}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  dayStrip: { flexGrow: 0, backgroundColor: colors.paperRaised, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 10 },
  dayPill: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, marginRight: 6,
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line,
  },
  dayPillActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  dayPillText: { fontFamily: "IBMPlexMono_500Medium", fontSize: 11, fontWeight: "600", color: colors.inkSoft },
  dayPillTextActive: { color: colors.paper },
  rowWrap: { flexDirection: "row", alignItems: "stretch", marginBottom: 8, gap: 6 },
  row: {
    flex: 1, flexDirection: "row", backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, overflow: "hidden",
  },
  timeCol: { width: 60, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", padding: 6 },
  timeColMuted: { backgroundColor: "#C7BFA9" },
  timeText: { fontFamily: "IBMPlexMono_500Medium", color: colors.paper, fontSize: 11, fontWeight: "600" },
  body: { flex: 1, padding: 10 },
  row1: { flexDirection: "row", alignItems: "center", gap: 6 },
  typeTag: { fontFamily: "IBMPlexMono_500Medium", fontSize: 9, color: colors.teal, fontWeight: "600" },
  statusBadge: { fontSize: 9, color: colors.inkSoft, marginLeft: "auto" },
  itemTitle: { color: colors.ink, fontWeight: "600", fontSize: 14, marginTop: 2 },
  empty: { textAlign: "center", color: colors.inkSoft, marginTop: 40 },
  moveCol: { justifyContent: "center", gap: 4 },
  moveBtn: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center",
  },
  moveBtnDisabled: { opacity: 0.3 },
  moveBtnText: { color: colors.ink, fontWeight: "700" },
  fab: {
    position: "absolute", bottom: 20, alignSelf: "center",
    backgroundColor: colors.ink, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 24,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  fabText: { color: colors.paper, fontWeight: "700" },
});
