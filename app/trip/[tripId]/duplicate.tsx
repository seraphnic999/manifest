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
  itemsByDay: Map<string, Item[]>; // key: day.id — items grouped under a real day
  staySpans: Item[];               // day_id is null — the lodging "stay" span itself, spans a date range
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
  const staySpans: Item[] = [];
  for (const item of (items ?? []) as Item[]) {
    if (!item.day_id) {
      staySpans.push(item);
      continue;
    }
    const list = itemsByDay.get(item.day_id) ?? [];
    list.push(item);
    itemsByDay.set(item.day_id, list);
  }
  staySpans.sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""));

  return { trip: trip as Trip, days: (days ?? []) as Day[], itemsByDay, staySpans };
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

function sourceDayLabel(day: Day, tripStart: string): string {
  if (day.date === null) return "Proposals";
  const dayNum = daysBetween(tripStart, day.date) + 1;
  const base = `Day ${dayNum} · ${formatDateDDMMYYYY(day.date)}`;
  return day.theme ? `${base} — ${day.theme}` : base;
}

interface Mapped {
  date: string | null;     // resolved target date (start date, for spans), null = Proposals / unresolved
  outOfWindow: boolean;    // true = the computed default fell past the new trip's last day
}

export default function DuplicateTrip() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // Items the user has explicitly resolved via the day picker — once
  // touched, their chosen value (possibly null/Proposals) is final and no
  // longer flagged, even if it happens to fall outside the window.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Map<string, string | null>>(new Map());
  const [pickerItemId, setPickerItemId] = useState<string | null>(null);
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

  const daysById = useMemo(() => new Map((data?.days ?? []).map((d) => [d.id, d])), [data]);

  // Default: every item checked, new dates prefilled to match the source
  // trip's own length (a same-length duplicate is then one tap away).
  if (data && !initialized) {
    const allIds = new Set<string>();
    for (const list of data.itemsByDay.values()) for (const item of list) allIds.add(item.id);
    for (const item of data.staySpans) allIds.add(item.id);
    setChecked(allIds);
    setNewStartDate(data.trip.start_date);
    setNewEndDate(data.trip.end_date);
    setInitialized(true);
  }

  const offsetDays = data && newStartDate ? daysBetween(data.trip.start_date, newStartDate) : 0;

  // Every date in the new trip's window, in order — also what fills the
  // day-picker combo boxes, per-item, instead of the source trip's dates.
  const windowDates = useMemo(() => {
    if (!newStartDate || !newEndDate || newEndDate < newStartDate) return [];
    const dates: string[] = [];
    let cur = newStartDate;
    for (let i = 0; i < 730 && cur <= newEndDate; i++) {
      dates.push(cur);
      cur = addDaysIso(cur, 1);
    }
    return dates;
  }, [newStartDate, newEndDate]);

  const datesReady = !!newStartDate && !!newEndDate && newEndDate >= newStartDate;

  // First day of the source trip maps to the first day of the new one,
  // second to second, and so on (a constant offset). If the new trip is
  // shorter, whatever slides past its last day comes back null — needing
  // the user to either pick a day that fits or explicitly send it to
  // Proposals — rather than silently stretching the new trip to fit.
  function computeDefault(anchorDate: string | null): Mapped {
    if (anchorDate === null) return { date: null, outOfWindow: false }; // was already dateless (Proposals) — stays that way
    if (!datesReady) return { date: null, outOfWindow: false };
    const mapped = addDaysIso(anchorDate, offsetDays);
    if (mapped > newEndDate) return { date: null, outOfWindow: true };
    return { date: mapped, outOfWindow: false };
  }

  function computeStaySpanDefault(item: Item): Mapped {
    if (!datesReady || !item.start_date) return { date: null, outOfWindow: false };
    const mappedStart = addDaysIso(item.start_date, offsetDays);
    const mappedEnd = item.end_date ? addDaysIso(item.end_date, offsetDays) : mappedStart;
    if (mappedEnd > newEndDate) return { date: null, outOfWindow: true };
    return { date: mappedStart, outOfWindow: false };
  }

  function resolvedTarget(itemId: string, fallback: Mapped): Mapped {
    if (touched.has(itemId)) return { date: overrides.get(itemId) ?? null, outOfWindow: false };
    return fallback;
  }

  const unresolvedCount = useMemo(() => {
    if (!data) return 0;
    let count = 0;
    for (const [dayId, items] of data.itemsByDay) {
      const day = daysById.get(dayId);
      for (const item of items) {
        if (!checked.has(item.id) || touched.has(item.id)) continue;
        if (computeDefault(day?.date ?? null).outOfWindow) count++;
      }
    }
    for (const item of data.staySpans) {
      if (!checked.has(item.id) || touched.has(item.id)) continue;
      if (computeStaySpanDefault(item).outOfWindow) count++;
    }
    return count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, checked, touched, newStartDate, newEndDate]);

  function toggleItem(itemId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  }

  function toggleDayAll(items: Item[], selectAll: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      for (const item of items) {
        if (selectAll) next.add(item.id); else next.delete(item.id);
      }
      return next;
    });
  }

  function chooseTarget(itemId: string, date: string | null) {
    setOverrides((prev) => new Map(prev).set(itemId, date));
    setTouched((prev) => new Set(prev).add(itemId));
    setPickerItemId(null);
  }

  async function confirmDuplicate() {
    if (!data || !datesReady) {
      Alert.alert("Missing info", "Choose a new start and end date first.");
      return;
    }
    if (checked.size === 0) {
      Alert.alert("Nothing selected", "Choose at least one item to copy.");
      return;
    }
    if (unresolvedCount > 0) {
      Alert.alert(
        "Some items need a day",
        `${unresolvedCount} item${unresolvedCount === 1 ? "" : "s"} fall outside the new trip's dates. Tap each one's date to assign a day, or send it to Proposals, before duplicating.`
      );
      return;
    }

    const itemSelections: { item_id: string; target_date: string | null }[] = [];
    for (const [dayId, items] of data.itemsByDay) {
      const day = daysById.get(dayId);
      for (const item of items) {
        if (!checked.has(item.id)) continue;
        const target = resolvedTarget(item.id, computeDefault(day?.date ?? null)).date;
        itemSelections.push({ item_id: item.id, target_date: target });
      }
    }
    for (const item of data.staySpans) {
      if (!checked.has(item.id)) continue;
      const target = resolvedTarget(item.id, computeStaySpanDefault(item)).date;
      itemSelections.push({ item_id: item.id, target_date: target });
    }

    setSaving(true);
    const { data: newTripId, error } = await supabase.rpc("duplicate_trip", {
      source_trip_id: tripId,
      new_start_date: newStartDate,
      new_end_date: newEndDate,
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

  const pickerItem = pickerItemId
    ? (data.staySpans.find((i) => i.id === pickerItemId) ??
        Array.from(data.itemsByDay.values()).flat().find((i) => i.id === pickerItemId))
    : null;
  const pickerIsStaySpan = !!pickerItem && pickerItem.day_id === null;
  const pickerDuration = pickerIsStaySpan && pickerItem?.start_date && pickerItem?.end_date
    ? daysBetween(pickerItem.start_date, pickerItem.end_date) : 0;
  const pickerDates = pickerIsStaySpan
    ? windowDates.filter((d) => addDaysIso(d, pickerDuration) <= newEndDate)
    : windowDates;

  function renderChip(itemId: string, isChecked: boolean, mapped: Mapped, staySpanItem?: Item) {
    const resolved = resolvedTarget(itemId, mapped);
    const needsAttention = isChecked && !touched.has(itemId) && mapped.outOfWindow;
    let label: string;
    if (needsAttention) label = "Needs a day";
    else if (staySpanItem) {
      const duration = staySpanItem.start_date && staySpanItem.end_date ? daysBetween(staySpanItem.start_date, staySpanItem.end_date) : 0;
      label = resolved.date ? `${formatDateDDMMYYYY(resolved.date)} → ${formatDateDDMMYYYY(addDaysIso(resolved.date, duration))}` : "Needs a day";
    } else {
      label = resolved.date === null ? "Proposals" : formatDateDDMMYYYY(resolved.date);
    }
    return (
      <Pressable
        style={[styles.dayChip, needsAttention && styles.dayChipWarning]}
        onPress={() => setPickerItemId(itemId)}
        disabled={!isChecked}
      >
        <Text style={[
          styles.dayChipText,
          !isChecked && styles.itemTitleDim,
          needsAttention && styles.dayChipWarningText,
        ]}>
          {label}
        </Text>
      </Pressable>
    );
  }

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
          file attachments, the shopping list, expenses, and map routes are never copied. The first day of
          this trip maps to the first day of the new one, and so on — if the new trip is shorter, anything
          that falls past its last day needs a day picked for it, or gets sent to Proposals.
        </Text>

        <View style={styles.row}>
          <DateField label="New start date" value={newStartDate} onChange={setNewStartDate} />
          <View style={{ width: 12 }} />
          <DateField label="New end date" value={newEndDate} onChange={setNewEndDate} />
        </View>
        {newEndDate && newStartDate && newEndDate < newStartDate ? (
          <Text style={styles.warningText}>End date must be on or after the start date.</Text>
        ) : null}

        {unresolvedCount > 0 && (
          <Text style={styles.warningBanner}>
            {unresolvedCount} item{unresolvedCount === 1 ? "" : "s"} fall outside the new dates — tap its date to assign a day.
          </Text>
        )}

        {data.staySpans.length > 0 && (
          <View style={styles.dayGroup}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayTitle}>Stays</Text>
              <Pressable onPress={() => toggleDayAll(data.staySpans, !data.staySpans.every((i) => checked.has(i.id)))}>
                <Text style={styles.selectAllText}>{data.staySpans.every((i) => checked.has(i.id)) ? "Deselect all" : "Select all"}</Text>
              </Pressable>
            </View>
            {data.staySpans.map((item) => {
              const category = categoryForDbType(item.type);
              const isChecked = checked.has(item.id);
              const mapped = computeStaySpanDefault(item);
              return (
                <View key={item.id} style={styles.itemRow}>
                  <Pressable style={styles.checkbox} onPress={() => toggleItem(item.id)}>
                    <Ionicons name={isChecked ? "checkbox" : "square-outline"} size={22} color={isChecked ? colors.teal : colors.inkSoft} />
                  </Pressable>
                  <Ionicons name={category.icon as any} size={18} color={category.tileColor} style={{ marginHorizontal: 8 }} />
                  <Text style={[styles.itemTitle, !isChecked && styles.itemTitleDim]} numberOfLines={1}>{item.title}</Text>
                  {renderChip(item.id, isChecked, mapped, item)}
                </View>
              );
            })}
          </View>
        )}

        {sortedDays.map((day) => {
          const items = (data.itemsByDay.get(day.id) ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
          if (items.length === 0) return null;
          const allChecked = items.every((i) => checked.has(i.id));
          return (
            <View key={day.id} style={styles.dayGroup}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayTitle}>{sourceDayLabel(day, data.trip.start_date)}</Text>
                <Pressable onPress={() => toggleDayAll(items, !allChecked)}>
                  <Text style={styles.selectAllText}>{allChecked ? "Deselect all" : "Select all"}</Text>
                </Pressable>
              </View>
              {items.map((item) => {
                const category = categoryForDbType(item.type);
                const isChecked = checked.has(item.id);
                const mapped = computeDefault(day.date);
                return (
                  <View key={item.id} style={styles.itemRow}>
                    <Pressable style={styles.checkbox} onPress={() => toggleItem(item.id)}>
                      <Ionicons name={isChecked ? "checkbox" : "square-outline"} size={22} color={isChecked ? colors.teal : colors.inkSoft} />
                    </Pressable>
                    <Ionicons name={category.icon as any} size={18} color={category.tileColor} style={{ marginHorizontal: 8 }} />
                    <Text style={[styles.itemTitle, !isChecked && styles.itemTitleDim]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {renderChip(item.id, isChecked, mapped)}
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      <Pressable
        style={[styles.button, (!datesReady || checked.size === 0 || unresolvedCount > 0) && styles.buttonDisabled]}
        onPress={confirmDuplicate}
        disabled={saving || !datesReady || checked.size === 0 || unresolvedCount > 0}
      >
        <Text style={styles.buttonText}>
          {saving ? "Duplicating…" : `Duplicate (${checked.size} item${checked.size === 1 ? "" : "s"})`}
        </Text>
      </Pressable>

      <Modal visible={pickerItemId !== null} transparent animationType="fade" onRequestClose={() => setPickerItemId(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerItemId(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <ScrollView style={{ maxHeight: 420 }}>
              {pickerDates.map((d) => (
                <Pressable key={d} style={styles.modalRow} onPress={() => pickerItemId && chooseTarget(pickerItemId, d)}>
                  <Text style={styles.modalRowText}>
                    {pickerIsStaySpan ? `${formatDateDDMMYYYY(d)} → ${formatDateDDMMYYYY(addDaysIso(d, pickerDuration))}` : formatDateDDMMYYYY(d)}
                  </Text>
                </Pressable>
              ))}
              {!pickerIsStaySpan && (
                <Pressable style={styles.modalRow} onPress={() => pickerItemId && chooseTarget(pickerItemId, null)}>
                  <Text style={styles.modalRowText}>Proposals (no date)</Text>
                </Pressable>
              )}
              {pickerDates.length === 0 && (
                <Text style={styles.hint}>
                  {pickerIsStaySpan ? "No date in the new trip fits this stay's length." : "Set the new trip's dates first."}
                </Text>
              )}
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
  row: { flexDirection: "row" },
  warningText: { color: colors.coral, fontSize: 12, marginTop: 6 },
  warningBanner: {
    color: colors.coral, fontSize: 13, fontWeight: "600", marginTop: 16,
    backgroundColor: "rgba(224,98,60,0.1)", borderRadius: radius.md, padding: 10,
  },
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
  dayChipWarning: { borderColor: colors.coral, backgroundColor: "rgba(224,98,60,0.1)" },
  dayChipText: { color: colors.ink, fontSize: 11, fontFamily: "IBMPlexMono_500Medium" },
  dayChipWarningText: { color: colors.coral, fontWeight: "700" },
  button: {
    position: "absolute", left: 20, right: 20, bottom: 20,
    backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.paper, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.4)", justifyContent: "center", padding: 30 },
  modalCard: { backgroundColor: colors.paperRaised, borderRadius: radius.lg, padding: 8, width: "100%", maxWidth: 420, alignSelf: "center" },
  modalRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  modalRowText: { color: colors.ink, fontSize: 15 },
});
