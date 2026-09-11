import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Modal } from "react-native";
import { useLocalSearchParams, Stack, useFocusEffect, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { colors, radius, fonts } from "@/lib/theme";
import { PackingItem } from "@/lib/types";
import { PACKING_CATEGORIES, mergePackingItems, fetchTemplateItems, fetchTripPackingAsSource } from "@/lib/packing";
import TripScreenHeader from "@/components/TripScreenHeader";
import TripTabBar from "@/components/TripTabBar";
import { useTripHamburgerMenu } from "@/components/useTripHamburgerMenu";
import Icon from "@/components/icons/Icon";
import Checkbox from "@/components/Checkbox";
import { useNetworkStatus } from "@/lib/useNetworkStatus";
import OfflineBanner from "@/components/OfflineBanner";
import { Alert } from "@/lib/alert";

interface PackingData {
  items: PackingItem[];
  templates: { id: string; name: string }[];
  otherTrips: { id: string; name: string }[];
}

async function fetchPackingData(tripId: string): Promise<PackingData> {
  const [{ data: items, error: itemsError }, { data: templates, error: templatesError }, { data: trips, error: tripsError }] =
    await Promise.all([
      supabase.from("packing_items").select("*").eq("trip_id", tripId).order("sort_order"),
      supabase.from("packing_templates").select("id, name").order("name"),
      supabase.from("trips").select("id, name").is("deleted_at", null).neq("id", tripId).order("start_date", { ascending: false }),
    ]);
  if (itemsError) throw itemsError;
  if (templatesError) throw templatesError;
  if (tripsError) throw tripsError;
  return {
    items: (items ?? []) as PackingItem[],
    templates: templates ?? [],
    otherTrips: trips ?? [],
  };
}

export default function PackingScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const isOnline = useNetworkStatus();
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState<string | null>(null);
  const [populateOpen, setPopulateOpen] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState<"template" | "trip" | null>(null);
  const { menuItems, shareModal } = useTripHamburgerMenu(tripId);

  const { data, dataUpdatedAt, refetch } = useQuery({ queryKey: ["packing", tripId], queryFn: () => fetchPackingData(tripId) });
  const items = data?.items ?? [];
  const templates = data?.templates ?? [];
  const otherTrips = data?.otherTrips ?? [];

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  function requireOnline(): boolean {
    if (isOnline) return true;
    Alert.alert("You're offline", "Connect to the internet to make changes.");
    return false;
  }

  async function togglePacked(item: PackingItem) {
    if (!requireOnline()) return;
    await supabase.from("packing_items").update({ packed: !item.packed }).eq("id", item.id);
    refetch();
  }

  async function addItem() {
    if (!requireOnline() || !newItemName.trim()) return;
    const nextOrder = items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0;
    await supabase.from("packing_items").insert({
      trip_id: tripId, name: newItemName.trim(), category: newItemCategory, sort_order: nextOrder,
    });
    setNewItemName("");
    setNewItemCategory(null);
    refetch();
  }

  async function removeItem(itemId: string) {
    if (!requireOnline()) return;
    await supabase.from("packing_items").delete().eq("id", itemId);
    refetch();
  }

  async function populateFromTemplate(templateId: string) {
    setSourcePickerOpen(null);
    setPopulateOpen(false);
    const source = await fetchTemplateItems(templateId);
    await mergePackingItems(tripId, source);
    refetch();
  }

  async function populateFromTrip(sourceTripId: string) {
    setSourcePickerOpen(null);
    setPopulateOpen(false);
    const source = await fetchTripPackingAsSource(sourceTripId);
    await mergePackingItems(tripId, source);
    refetch();
  }

  const grouped = new Map<string, PackingItem[]>();
  for (const item of items) {
    const key = item.category ?? "Other";
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  const packedCount = items.filter((i) => i.packed).length;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <TripScreenHeader title="Packing" tripId={tripId} menuItems={menuItems} />
      {shareModal}
      <OfflineBanner dataUpdatedAt={!isOnline ? dataUpdatedAt : undefined} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>{packedCount} of {items.length} packed</Text>
          <Pressable style={styles.populateButton} onPress={() => setPopulateOpen(true)}>
            <Text style={styles.populateButtonText}>Populate from…</Text>
          </Pressable>
        </View>

        {PACKING_CATEGORIES.concat(Array.from(grouped.keys()).filter((k) => !PACKING_CATEGORIES.includes(k)))
          .filter((cat) => grouped.has(cat))
          .map((cat) => (
            <View key={cat} style={styles.group}>
              <Text style={styles.groupLabel}>{cat}</Text>
              {grouped.get(cat)!.map((item) => (
                <Pressable key={item.id} style={styles.itemRow} onPress={() => togglePacked(item)}>
                  <Checkbox checked={item.packed} />
                  <Text style={[styles.itemName, item.packed && styles.itemNamePacked]}>{item.name}</Text>
                  <Pressable onPress={() => removeItem(item.id)} hitSlop={8}>
                    <View style={{ transform: [{ rotate: "45deg" }] }}>
                      <Icon name="add" size={18} color={colors.inkSoft} strokeWidth={3} />
                    </View>
                  </Pressable>
                </Pressable>
              ))}
            </View>
          ))}
        {items.length === 0 && <Text style={styles.empty}>Nothing on the list yet — add items below, or populate from a template.</Text>}

        <View style={styles.addCard}>
          <TextInput
            style={styles.input}
            value={newItemName}
            onChangeText={setNewItemName}
            placeholder="e.g. Passport, Charger, Swimsuit"
            onSubmitEditing={addItem}
          />
          <View style={styles.chipRow}>
            {PACKING_CATEGORIES.map((c) => (
              <Pressable
                key={c}
                style={[styles.chip, newItemCategory === c && styles.chipActive]}
                onPress={() => setNewItemCategory(newItemCategory === c ? null : c)}
              >
                <Text style={[styles.chipText, newItemCategory === c && styles.chipTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.addButton} onPress={addItem}>
            <Text style={styles.addButtonText}>+ Add item</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={populateOpen} transparent animationType="fade" onRequestClose={() => setPopulateOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPopulateOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Populate packing list</Text>
            <Text style={styles.modalHint}>Adds anything missing — items already on the list are never duplicated.</Text>
            <Pressable style={styles.modalRow} onPress={() => setSourcePickerOpen("template")}>
              <Text style={styles.modalRowText}>From a template</Text>
            </Pressable>
            <Pressable style={styles.modalRow} onPress={() => setSourcePickerOpen("trip")}>
              <Text style={styles.modalRowText}>Copy from an existing trip</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={sourcePickerOpen !== null} transparent animationType="fade" onRequestClose={() => setSourcePickerOpen(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSourcePickerOpen(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <ScrollView style={{ maxHeight: 420 }}>
              {sourcePickerOpen === "template" ? (
                templates.length === 0 ? (
                  <Text style={styles.modalHint}>
                    No templates yet — create one from the home screen first.
                  </Text>
                ) : templates.map((t) => (
                  <Pressable key={t.id} style={styles.modalRow} onPress={() => populateFromTemplate(t.id)}>
                    <Text style={styles.modalRowText}>{t.name}</Text>
                  </Pressable>
                ))
              ) : (
                otherTrips.length === 0 ? (
                  <Text style={styles.modalHint}>No other trips to copy from.</Text>
                ) : otherTrips.map((t) => (
                  <Pressable key={t.id} style={styles.modalRow} onPress={() => populateFromTrip(t.id)}>
                    <Text style={styles.modalRowText}>{t.name}</Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      <TripTabBar tripId={tripId} active="packing" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  summaryText: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  populateButton: { borderWidth: 1, borderColor: colors.teal, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12 },
  populateButtonText: { color: colors.teal, fontWeight: "700", fontSize: 12 },
  group: { marginBottom: 16 },
  groupLabel: {
    color: colors.inkSoft, fontWeight: "700", fontSize: 12,
    textTransform: "uppercase", letterSpacing: 1, marginBottom: 6,
  },
  itemRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 10, marginBottom: 6,
  },
  itemName: { color: colors.ink, fontSize: 14, flex: 1 },
  itemNamePacked: { color: colors.inkSoft, textDecorationLine: "line-through" },
  empty: { color: colors.inkSoft, fontStyle: "italic", fontSize: 13, textAlign: "center", marginTop: 20, marginBottom: 20 },
  addCard: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line, borderStyle: "dashed",
    borderRadius: radius.md, padding: 12, marginTop: 10,
  },
  input: {
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  chipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { color: colors.inkSoft, fontWeight: "600", fontSize: 12 },
  chipTextActive: { color: "#fff" },
  addButton: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 12, alignItems: "center", marginTop: 10 },
  addButtonText: { color: colors.paper, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.4)", justifyContent: "center", padding: 30 },
  modalCard: { backgroundColor: colors.paperRaised, borderRadius: radius.lg, padding: 16, width: "100%", maxWidth: 420, alignSelf: "center" },
  modalTitle: { color: colors.ink, fontWeight: "700", fontSize: 16, marginBottom: 6 },
  modalHint: { color: colors.inkSoft, fontSize: 12, marginBottom: 12 },
  modalRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  modalRowText: { color: colors.ink, fontSize: 15 },
});
