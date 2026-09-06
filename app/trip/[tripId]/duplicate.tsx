import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from "react-native";
import { Alert } from "@/lib/alert";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { Trip, Day, Item } from "@/lib/types";
import { categoryForDbType } from "@/lib/itemTypeMeta";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";
import { DateField } from "@/components/DateTimeFields";
import HomeButton from "@/components/HomeButton";

interface DuplicateData {
  trip: Trip;
  days: Day[];
  itemsByDay: Map<string, Item[]>; // key: day.id
}

async function fetchDuplicateData(tripId: string): Promise<DuplicateData> {
  const [{ data: trip, error: tripError }, { data: days, error: daysError }, { data: items, error: itemsError }] =
    await Promise.all([
      supabase.from("trips").select("*").eq("id", tripId).single(),
      supabase.from("days").select("*").eq("trip_id", tripId).order("sort_order"),
      supabase.from("items").select("*").eq("trip_id", tripId).is("deleted_at", null).order("sort_order"),
    ]);
  if (tripError) throw tripError;
  if (daysError) throw daysError;
  if (itemsError) throw itemsError;

  const itemsByDay = new Map<string, Item[]>();
  for (const item of (items ?? []) as Item[]) {
    if (!item.day_id) continue;
    const list = itemsByDay.get(item.day_id) ?? [];
    list.push(item);
    itemsByDay.set(item.day_id, list);
  }

  return { trip: trip as Trip, days: (days ?? []) as Day[], itemsByDay };
}

// Pure calendar-date arithmetic — local Date components, no timezone shift
// (these are day offsets, not moments in time).
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function daysBetween(startIso: string, dateIso: string): number {
  const [y1, m1, d1] = startIso.split("-").map(Number);
  const [y2, m2, d2] = dateIso.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

function dayLabel(day: Day, index: number, tripStart: string): string {
  if (day.date === null) return "Proposals";
  const dayNum = daysBetween(tripStart, day.date) + 1;
  const base = `Day ${dayNum} · ${formatDateDDMMYYYY(day.date)}`;
  return day.theme ? `${base} — ${day.theme}` : base;
}

export default function DuplicateTrip() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const [newStartDate, setNewStartDate] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [targetDayId, setTargetDayId] = useState<Map<string, string>>(new Map()); // item id -> chosen source day id
  const [dayPickerForItem, setDayPickerForItem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["duplicateData", tripId],
    queryFn: () => fetchDuplicateData(tripId),
  });

  const sortedDays = useMemo(() => {
    if (!data) return [];
    return [...data.days].sort((a, b) => a.sort_order - b.sort_order);
  }, [data]);

  // Default: every item checked, targeting its own original day.
  if (data && !initialized) {
    const allIds = new Set<string>();
    const defaults = new Map<string, string>();
    for (const list of data.itemsByDay.values()) {
      for (const item of list) {
        allIds.add(item.id);
        defaults.set(item.id, item.day_id!);
      }
    }
    setChecked(allIds);
    setTargetDayId(defaults);
    setInitialized(true);
  }

  function toggleItem(itemId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  }

  function toggleDayAll(dayId: string, items: Item[], selectAll: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      for (const item of items) {
        if (selectAll) next.add(item.id); else next.delete(item.id);
      }
      return next;
    });
  }

  async function confirmDuplicate() {
    if (!data || !newStartDate) {
      Alert.alert("Missing info", "Choose a new start date first.");
      return;
    }
    if (checked.size === 0) {
      Alert.alert("Nothing selected", "Choose at least one item to copy.");
      return;
    }

    const daysById = new Map(data.days.map((d) => [d.id, d]));
    const itemSelections = Array.from(checked).map((itemId) => {
      const sourceDayId = targetDayId.get(itemId);
      const sourceDay = sourceDayId ? daysById.get(sourceDayId) : undefined;
      const target_date = sourceDay?.date == null ? null : addDaysIso(newStartDate, daysBetween(data.trip.start_date, sourceDay.date));
      return { item_id: itemId, target_date };
    });

    setSaving(true);
    const { data: newTripId, error } = await supabase.rpc("duplicate_trip", {
      source_trip_id: tripId,
      new_start_date: newStartDate,
      item_selections: itemSelections,
    });
    setSaving(false);

    if (error) {
      Alert.alert("Couldn't duplicate trip", error.message);
      return;
    }

    router.replace(`/trip/${newTripId}`);
  }

  if (isLoading || !data) return null;

  const dayPickerItem = dayPickerForItem;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: "Duplicate trip",
        headerRight: () => (
          <View style={{ marginRight: 14 }}>
            <HomeButton />
          </View>
        ),
      }} />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        <Text style={styles.hint}>
          Choose what carries over from "{data.trip.name}" into the new trip. Confirmation codes, photos,
          file attachments, the shopping list, expenses, and map routes are never copied.
        </Text>

        <DateField label="New start date" value={newStartDate} onChange={setNewStartDate} />

        {sortedDays.map((day) => {
          const items = (data.itemsByDay.get(day.id) ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
          if (items.length === 0) return null;
          const allChecked = items.every((i) => checked.has(i.id));
          return (
            <View key={day.id} style={styles.dayGroup}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayTitle}>{dayLabel(day, 0, data.trip.start_date)}</Text>
                <Pressable onPress={() => toggleDayAll(day.id, items, !allChecked)}>
                  <Text style={styles.selectAllText}>{allChecked ? "Deselect all" : "Select all"}</Text>
                </Pressable>
              </View>
              {items.map((item) => {
                const category = categoryForDbType(item.type);
                const isChecked = checked.has(item.id);
                const chosenDayId = targetDayId.get(item.id) ?? item.day_id!;
                const chosenDay = data.days.find((d) => d.id === chosenDayId);
                return (
                  <View key={item.id} style={styles.itemRow}>
                    <Pressable style={styles.checkbox} onPress={() => toggleItem(item.id)}>
                      <Ionicons
                        name={isChecked ? "checkbox" : "square-outline"}
                        size={22}
                        color={isChecked ? colors.teal : colors.inkSoft}
                      />
                    </Pressable>
                    <Ionicons name={category.icon as any} size={18} color={category.tileColor} style={{ marginHorizontal: 8 }} />
                    <Text style={[styles.itemTitle, !isChecked && styles.itemTitleDim]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Pressable
                      style={styles.dayChip}
                      onPress={() => setDayPickerForItem(item.id)}
                      disabled={!isChecked}
                    >
                      <Text style={[styles.dayChipText, !isChecked && styles.itemTitleDim]}>
                        {chosenDay ? (chosenDay.date === null ? "Proposals" : formatDateDDMMYYYY(chosenDay.date)) : "—"}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      <Pressable style={styles.button} onPress={confirmDuplicate} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? "Duplicating…" : `Duplicate (${checked.size} item${checked.size === 1 ? "" : "s"})`}</Text>
      </Pressable>

      <Modal visible={dayPickerItem !== null} transparent animationType="fade" onRequestClose={() => setDayPickerForItem(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDayPickerForItem(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <ScrollView style={{ maxHeight: 420 }}>
              {sortedDays.map((day) => (
                <Pressable
                  key={day.id}
                  style={styles.modalRow}
                  onPress={() => {
                    if (dayPickerItem) {
                      setTargetDayId((prev) => new Map(prev).set(dayPickerItem, day.id));
                    }
                    setDayPickerForItem(null);
                  }}
                >
                  <Text style={styles.modalRowText}>{dayLabel(day, 0, data.trip.start_date)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  hint: { color: colors.inkSoft, fontSize: 13, marginBottom: 16, lineHeight: 18 },
  dayGroup: { marginTop: 20 },
  dayHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  dayTitle: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  selectAllText: { color: colors.teal, fontSize: 12, fontWeight: "600" },
  itemRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 10, marginBottom: 6,
  },
  checkbox: { padding: 2 },
  itemTitle: { color: colors.ink, fontSize: 14, flex: 1 },
  itemTitleDim: { color: colors.inkSoft },
  dayChip: {
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line,
    borderRadius: 14, paddingVertical: 4, paddingHorizontal: 10,
  },
  dayChipText: { color: colors.ink, fontSize: 11, fontFamily: "IBMPlexMono_500Medium" },
  button: {
    position: "absolute", left: 20, right: 20, bottom: 20,
    backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center",
  },
  buttonText: { color: colors.paper, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.4)", justifyContent: "center", padding: 30 },
  modalCard: { backgroundColor: colors.paperRaised, borderRadius: radius.lg, padding: 8, width: "100%", maxWidth: 420, alignSelf: "center" },
  modalRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  modalRowText: { color: colors.ink, fontSize: 15 },
});
