import { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, StyleSheet, Pressable } from "react-native";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { Item } from "@/lib/types";
import ItemTypePickerModal from "@/components/ItemTypePickerModal";

const STATUS_LABEL: Record<string, string> = {
  booked: "Booked", optional: "Optional", idea: "Idea", pending: "Pending",
};

export default function DayView() {
  const { tripId, date } = useLocalSearchParams<{ tripId: string; date: string }>();
  const [items, setItems] = useState<Item[]>([]);
  const [dayId, setDayId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    // Resolve the day row for this date, then fetch its ordered items,
    // plus any multi-day (lodging) items whose range touches this date.
    const { data: day } = await supabase
      .from("days").select("id").eq("trip_id", tripId).eq("date", date).single();
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

    setItems([...(spanningLodging ?? []), ...(dayItems ?? [])]);
  }, [tripId, date]);

  useEffect(() => { load(); }, [load]);
  // Refresh whenever we come back from the add-item form.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  function handleSelectCategory(categoryKey: string) {
    setPickerOpen(false);
    router.push(`/item/new?tripId=${tripId}&dayId=${dayId}&date=${date}&category=${categoryKey}`);
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: date }} />
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => router.push(`/item/${item.id}`)}
          >
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
        )}
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
  row: {
    flexDirection: "row", backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    marginBottom: 8, overflow: "hidden",
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
  fab: {
    position: "absolute", bottom: 20, alignSelf: "center",
    backgroundColor: colors.ink, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 24,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  fabText: { color: colors.paper, fontWeight: "700" },
});
