import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, Linking, Pressable, Image, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Alert } from "@/lib/alert";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { Item, ItemPhoto, Expense, TripCurrency, TripParty } from "@/lib/types";
import { uploadItemPhoto, uploadItemDocument, fetchItemPhotosWithUrls, deleteItemPhoto, isImageAttachment } from "@/lib/photos";
import { downloadAttachment } from "@/lib/downloadAttachment";
import { fetchLinkedItems, LinkedItemSummary } from "@/lib/itemLinks";
import { categoryForDbType } from "@/lib/itemTypeMeta";
import { computeDurationMinutes, formatDuration } from "@/lib/duration";
import { formatDateDDMMYYYY, formatDateDDMM } from "@/lib/dateFormat";
import { normalizeTimeHHMM } from "@/lib/timeFormat";
import AddExpenseModal from "@/components/AddExpenseModal";
import AddShoppingItemModal from "@/components/AddShoppingItemModal";
import QuickNotesList from "@/components/QuickNotesList";
import HeaderIconButton from "@/components/HeaderIconButton";
import HomeButton from "@/components/HomeButton";

type PhotoWithUrl = ItemPhoto & { url: string };

// Everything that's deliberately hidden from the day view lives here:
// booking_source, vendor, link, confirmation_code, address, phone,
// notes, photos, expenses, shopping list links, plus (TODO) sub-steps,
// alternatives.
export default function ItemDetails() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<Item | null>(null);
  const [photos, setPhotos] = useState<PhotoWithUrl[]>([]);
  const [uploading, setUploading] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [currencies, setCurrencies] = useState<TripCurrency[]>([]);
  const [parties, setParties] = useState<TripParty[]>([]);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [editExpenseId, setEditExpenseId] = useState<string | null>(null);
  const [shoppingFormOpen, setShoppingFormOpen] = useState(false);
  const [editShoppingId, setEditShoppingId] = useState<string | null>(null);
  const [linkedShoppingItems, setLinkedShoppingItems] = useState<
    { id: string; name: string; quantity: number; allocations: { id: string }[] }[]
  >([]);
  const [linkedItems, setLinkedItems] = useState<LinkedItemSummary[]>([]);

  const loadShopping = useCallback(() => {
    supabase.from("shopping_list_items").select("id, name, quantity, allocations(id)").eq("item_id", itemId)
      .then(({ data }) => data && setLinkedShoppingItems(data as any));
  }, [itemId]);

  const loadItem = useCallback(() => {
    supabase.from("items").select("*").eq("id", itemId).single()
      .then(({ data }) => data && setItem(data as Item));
  }, [itemId]);

  const loadPhotos = useCallback(() => {
    fetchItemPhotosWithUrls(itemId).then(setPhotos);
  }, [itemId]);

  const loadExpenses = useCallback(() => {
    supabase.from("expenses").select("*").eq("item_id", itemId).order("expense_date", { ascending: false })
      .then(({ data }) => data && setExpenses(data as Expense[]));
  }, [itemId]);

  const loadLinkedItems = useCallback(() => {
    fetchLinkedItems(itemId).then(setLinkedItems);
  }, [itemId]);

  useEffect(() => { loadItem(); loadPhotos(); loadExpenses(); loadShopping(); loadLinkedItems(); }, [loadItem, loadPhotos, loadExpenses, loadShopping, loadLinkedItems]);
  useFocusEffect(useCallback(() => { loadItem(); loadPhotos(); loadExpenses(); loadShopping(); loadLinkedItems(); }, [loadItem, loadPhotos, loadExpenses, loadShopping, loadLinkedItems]));

  useEffect(() => {
    if (!item) return;
    supabase.from("trip_currencies").select("*").eq("trip_id", item.trip_id)
      .then(({ data }) => data && setCurrencies(data as TripCurrency[]));
    supabase.from("trip_parties").select("*").eq("trip_id", item.trip_id)
      .then(({ data }) => data && setParties(data as TripParty[]));
  }, [item?.trip_id]);

  async function addPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access to attach photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploading(true);
    try {
      await uploadItemPhoto(itemId, result.assets[0]);
      loadPhotos();
    } catch (e: any) {
      Alert.alert("Upload failed", e.message ?? "Unknown error");
    }
    setUploading(false);
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow camera access to take photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploading(true);
    try {
      await uploadItemPhoto(itemId, result.assets[0]);
      loadPhotos();
    } catch (e: any) {
      Alert.alert("Upload failed", e.message ?? "Unknown error");
    }
    setUploading(false);
  }

  async function addDocument() {
    const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;

    setUploading(true);
    try {
      await uploadItemDocument(itemId, result.assets[0]);
      loadPhotos();
    } catch (e: any) {
      Alert.alert("Upload failed", e.message ?? "Unknown error");
    }
    setUploading(false);
  }

  function attachmentDisplayName(photo: PhotoWithUrl): string {
    return photo.file_name || photo.storage_path.split("/").pop() || "attachment";
  }

  function openAttachment(photo: PhotoWithUrl) {
    downloadAttachment(photo.url, attachmentDisplayName(photo)).catch((e: any) => {
      Alert.alert("Download failed", e.message ?? "Unknown error");
    });
  }

  async function removePhoto(photo: PhotoWithUrl) {
    Alert.alert("Remove attachment", "Delete this attachment?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await deleteItemPhoto(photo); loadPhotos(); } },
    ]);
  }

  function duplicateItem() {
    if (!item) return;
    const category = categoryForDbType(item.type).key;
    const params = new URLSearchParams({
      tripId: item.trip_id,
      dayId: item.day_id ?? "",
      date: item.start_date ?? "",
      category,
      duplicateFrom: item.id,
    });
    router.push(`/item/new?${params.toString()}`);
  }

  function deleteItem() {
    Alert.alert("Delete item", "Move this item to the archive?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await supabase.from("items").update({ deleted_at: new Date().toISOString() }).eq("id", itemId);
          router.back();
        },
      },
    ]);
  }

  if (!item) return null;

  const flightNumber = (item.custom_fields as any)?.flight_number as string | undefined;
  const isFlight = item.type === "flight" && !item.is_stay_span;
  const flightDurationMinutes = isFlight
    ? computeDurationMinutes(item.start_date, item.time_start, item.end_date, item.time_end)
    : null;

  const fields: [string, string | null][] = item.is_stay_span
    ? [
        ["Check-in", [formatDateDDMMYYYY(item.start_date), normalizeTimeHHMM(item.time_start)].filter(Boolean).join(" \u00b7 ") || null],
        ["Check-out", [formatDateDDMMYYYY(item.end_date), normalizeTimeHHMM(item.time_end)].filter(Boolean).join(" \u00b7 ") || null],
        ["Booking source", item.booking_source],
        ["Confirmation", item.confirmation_code],
        ["Vendor", item.vendor],
        ["Address", item.address],
        ["Phone", item.phone],
      ]
    : isFlight
    ? [
        ["Departure", [formatDateDDMMYYYY(item.start_date), normalizeTimeHHMM(item.time_start)].filter(Boolean).join(" \u00b7 ") || null],
        ["Arrival", [formatDateDDMMYYYY(item.end_date), normalizeTimeHHMM(item.time_end)].filter(Boolean).join(" \u00b7 ") || null],
        ["Duration", flightDurationMinutes !== null && flightDurationMinutes >= 0 ? formatDuration(flightDurationMinutes) : null],
        ["Vendor", item.vendor],
        ["Flight number", flightNumber ?? null],
        ["Booking source", item.booking_source],
        ["Confirmation", item.confirmation_code],
        ["Address", item.address],
        ["Phone", item.phone],
      ]
    : [
        ["Date", formatDateDDMMYYYY(item.start_date) || null],
        ["Time", normalizeTimeHHMM(item.time_start) || null],
        ["Vendor", item.vendor],
        ["Flight number", flightNumber ?? null],
        ["Booking source", item.booking_source],
        ["Confirmation", item.confirmation_code],
        ["Address", item.address],
        ["Phone", item.phone],
      ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* A fully custom header, not react-navigation's: its web header
          didn't reliably constrain a long title against these header-right
          buttons — at some viewport widths the title text overflowed
          straight past them instead of truncating, since our headerTitle
          override's flex:1 was sized against the library's own internal
          layout assumptions rather than this row's actual content. Owning
          the row directly makes the title/buttons split a plain flexbox
          fact we control. */}
      <View style={[styles.customHeader, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <View style={styles.customHeaderTitleWrap}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.headerTitleText}>{item.title}</Text>
        </View>
        <View style={styles.headerButtons}>
          <HeaderIconButton onPress={deleteItem}>
            <Ionicons name="trash" size={16} color={colors.coral} />
          </HeaderIconButton>
          <HeaderIconButton onPress={duplicateItem} accessibilityLabel="Duplicate item">
            <Ionicons name="copy-outline" size={16} color={colors.teal} />
          </HeaderIconButton>
          <HeaderIconButton onPress={() => router.push(`/item/${itemId}/edit`)}>
            <Ionicons name="pencil" size={16} color={colors.amber} />
          </HeaderIconButton>
          <HomeButton />
        </View>
      </View>

      <ScrollView style={styles.container}>
      <Text style={styles.typeTag}>{item.type.toUpperCase()}</Text>
      <Text style={styles.title}>{item.title}</Text>

      {fields.map(([label, value]) =>
        value ? (
          <View key={label} style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <Text style={styles.fieldValue}>{value}</Text>
          </View>
        ) : null
      )}

      {item.link ? (
        <Pressable onPress={() => Linking.openURL(item.link!)} style={styles.linkButton}>
          <Text style={styles.linkButtonText}>Open link</Text>
        </Pressable>
      ) : null}

      {item.google_maps_link ? (
        <Pressable
          onPress={() => Linking.openURL(item.google_maps_link!)}
          style={styles.mapLinkButton}
        >
          <Ionicons name="logo-google" size={15} color={colors.teal} />
          <Text style={styles.mapLinkButtonText}>Open in Google Maps</Text>
        </Pressable>
      ) : null}

      {item.latitude != null && item.longitude != null ? (
        <Pressable
          onPress={() => router.push(`/trip/${item.trip_id}/map?focusItemId=${item.id}`)}
          style={styles.mapLinkButton}
        >
          <Ionicons name="map-outline" size={15} color={colors.teal} />
          <Text style={styles.mapLinkButtonText}>View on map</Text>
        </Pressable>
      ) : null}

      <Text style={styles.sectionLabel}>Expenses</Text>
      {expenses.map((e) => (
        <Pressable key={e.id} style={styles.expenseRow} onPress={() => setEditExpenseId(e.id)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.expenseDesc}>{e.note || "Expense"}</Text>
            {e.expense_date && <Text style={styles.expenseDate}>{formatDateDDMMYYYY(e.expense_date)}</Text>}
          </View>
          <Text style={styles.expenseAmt}>{e.amount} {e.currency_code}</Text>
        </Pressable>
      ))}
      {expenses.length === 0 && <Text style={styles.empty}>No expenses linked yet.</Text>}
      <Pressable style={styles.addExpenseButton} onPress={() => setExpenseFormOpen(true)}>
        <Text style={styles.addExpenseButtonText}>+ Add expense</Text>
      </Pressable>

      <Text style={styles.sectionLabel}>Shopping list</Text>
      {linkedShoppingItems.map((s) => {
        const bought = s.allocations.length > 0;
        return (
          <Pressable key={s.id} style={styles.expenseRow} onPress={() => setEditShoppingId(s.id)}>
            <View style={[styles.miniCheckbox, bought && styles.miniCheckboxChecked]} />
            <Text style={[styles.expenseDesc, bought && styles.shoppingBought, { flex: 1 }]}>
              {s.name}{s.quantity > 1 ? ` \u00d7${s.quantity}` : ""}
            </Text>
          </Pressable>
        );
      })}
      {linkedShoppingItems.length === 0 && <Text style={styles.empty}>Nothing on the shopping list for this yet.</Text>}
      <Pressable style={styles.addExpenseButton} onPress={() => setShoppingFormOpen(true)}>
        <Text style={styles.addExpenseButtonText}>+ Add to shopping list</Text>
      </Pressable>

      <QuickNotesList itemId={itemId} />

      {linkedItems.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Linked items</Text>
          {linkedItems.map((li) => (
            <Pressable key={li.id} style={styles.expenseRow} onPress={() => router.push(`/item/${li.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.expenseDesc}>{li.title}</Text>
                <Text style={styles.expenseDate}>
                  {[li.day_date ? formatDateDDMM(li.day_date) : null, normalizeTimeHHMM(li.time_start)].filter(Boolean).join(" · ") || li.type.toUpperCase()}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color={colors.inkSoft} />
            </Pressable>
          ))}
        </>
      )}

      <Text style={styles.sectionLabel}>Attachments</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
        {photos.map((p) =>
          isImageAttachment(p) ? (
            <Pressable key={p.id} onPress={() => openAttachment(p)} onLongPress={() => removePhoto(p)} style={styles.photoWrap}>
              <Image source={{ uri: p.url }} style={styles.photo} />
            </Pressable>
          ) : (
            <Pressable key={p.id} onPress={() => openAttachment(p)} onLongPress={() => removePhoto(p)} style={styles.photoWrap}>
              <View style={styles.fileTile}>
                <Ionicons name="document-text" size={28} color={colors.inkSoft} />
                <Text numberOfLines={2} style={styles.fileTileName}>{attachmentDisplayName(p)}</Text>
              </View>
            </Pressable>
          )
        )}
        <Pressable style={styles.addPhotoTile} onPress={takePhoto} disabled={uploading}>
          {uploading ? <ActivityIndicator color={colors.inkSoft} /> : <Text style={styles.addPhotoText}>+ Camera</Text>}
        </Pressable>
        <Pressable style={styles.addPhotoTile} onPress={addPhoto} disabled={uploading}>
          {uploading ? <ActivityIndicator color={colors.inkSoft} /> : <Text style={styles.addPhotoText}>+ Photo</Text>}
        </Pressable>
        <Pressable style={styles.addPhotoTile} onPress={addDocument} disabled={uploading}>
          {uploading ? <ActivityIndicator color={colors.inkSoft} /> : <Text style={styles.addPhotoText}>+ File</Text>}
        </Pressable>
      </ScrollView>
      {photos.length > 0 && <Text style={styles.hint}>Tap an attachment to download it, long-press to remove it.</Text>}

      {item && (
        <>
          <AddExpenseModal
            visible={expenseFormOpen}
            onClose={() => setExpenseFormOpen(false)}
            onSaved={() => { setExpenseFormOpen(false); loadExpenses(); }}
            tripId={item.trip_id}
            currencies={currencies}
            parties={parties}
            presetItemId={item.id}
          />
          <AddExpenseModal
            visible={!!editExpenseId}
            onClose={() => setEditExpenseId(null)}
            onSaved={() => { setEditExpenseId(null); loadExpenses(); }}
            tripId={item.trip_id}
            currencies={currencies}
            parties={parties}
            expenseId={editExpenseId ?? undefined}
          />
          <AddShoppingItemModal
            visible={shoppingFormOpen}
            onClose={() => setShoppingFormOpen(false)}
            onSaved={() => { setShoppingFormOpen(false); loadShopping(); }}
            tripId={item.trip_id}
            presetItemId={item.id}
          />
          <AddShoppingItemModal
            visible={!!editShoppingId}
            onClose={() => setEditShoppingId(null)}
            onSaved={() => { setEditShoppingId(null); loadShopping(); }}
            tripId={item.trip_id}
            editId={editShoppingId ?? undefined}
          />
        </>
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: 20 },
  customHeader: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 10,
    backgroundColor: colors.paperRaised, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  backBtn: { padding: 6, marginRight: 4 },
  customHeaderTitleWrap: { flex: 1, minWidth: 0, marginHorizontal: 4 },
  headerButtons: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 8 },
  headerTitleText: { fontSize: 17, fontWeight: "700", color: colors.ink },
  typeTag: { fontFamily: "IBMPlexMono_500Medium", color: colors.teal, fontWeight: "600", fontSize: 11 },
  title: { color: colors.ink, fontWeight: "800", fontSize: 22, marginVertical: 6 },
  fieldRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  fieldLabel: { color: colors.inkSoft, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  fieldValue: { color: colors.ink, fontSize: 15, marginTop: 2 },
  linkButton: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 12, alignItems: "center", marginTop: 16 },
  linkButtonText: { color: colors.paper, fontWeight: "700" },
  mapLinkButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1, borderColor: colors.teal, borderRadius: radius.md, padding: 12, marginTop: 10,
  },
  mapLinkButtonText: { color: colors.teal, fontWeight: "700" },
  sectionLabel: {
    color: colors.inkSoft, fontWeight: "700", fontSize: 12,
    textTransform: "uppercase", letterSpacing: 1, marginTop: 20, marginBottom: 4,
  },
  photoWrap: { marginRight: 8 },
  photo: { width: 90, height: 90, borderRadius: radius.md, backgroundColor: colors.paperRaised },
  fileTile: {
    width: 90, height: 90, borderRadius: radius.md, backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", padding: 6,
  },
  fileTileName: { color: colors.inkSoft, fontSize: 10, textAlign: "center", marginTop: 4 },
  addPhotoTile: {
    width: 90, height: 90, borderRadius: radius.md, backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center",
  },
  addPhotoText: { color: colors.inkSoft, fontWeight: "600", fontSize: 12 },
  hint: { color: colors.inkSoft, fontSize: 11, marginTop: 6, fontStyle: "italic", marginBottom: 30 },
  expenseRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginBottom: 6,
  },
  expenseDesc: { color: colors.ink, fontWeight: "600", fontSize: 13 },
  expenseDate: { color: colors.inkSoft, fontSize: 11, marginTop: 2 },
  expenseAmt: { fontFamily: "IBMPlexMono_500Medium", color: colors.ink, fontWeight: "600", fontSize: 13 },
  empty: { color: colors.inkSoft, fontSize: 12, fontStyle: "italic", marginTop: 4 },
  addExpenseButton: {
    borderWidth: 1, borderColor: colors.line, borderStyle: "dashed", borderRadius: radius.md,
    padding: 12, alignItems: "center", marginTop: 8, marginBottom: 30,
  },
  addExpenseButtonText: { color: colors.teal, fontWeight: "700", fontSize: 13 },
  miniCheckbox: { width: 16, height: 16, borderRadius: 5, borderWidth: 2, borderColor: colors.teal, marginRight: 10 },
  miniCheckboxChecked: { backgroundColor: colors.teal },
  shoppingBought: { color: colors.inkSoft, textDecorationLine: "line-through" },
});
