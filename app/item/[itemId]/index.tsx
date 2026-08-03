import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, Linking, Pressable, Image, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { Item, ItemPhoto, Expense, TripCurrency, TripParty } from "@/lib/types";
import { uploadItemPhoto, fetchItemPhotosWithUrls, deleteItemPhoto } from "@/lib/photos";
import AddExpenseModal from "@/components/AddExpenseModal";
import AddShoppingItemModal from "@/components/AddShoppingItemModal";

type PhotoWithUrl = ItemPhoto & { url: string };

// Everything that's deliberately hidden from the day view lives here:
// booking_source, vendor, link, confirmation_code, address, phone,
// notes, photos, expenses, shopping list links, plus (TODO) sub-steps,
// alternatives.
export default function ItemDetails() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const router = useRouter();
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

  useEffect(() => { loadItem(); loadPhotos(); loadExpenses(); loadShopping(); }, [loadItem, loadPhotos, loadExpenses, loadShopping]);
  useFocusEffect(useCallback(() => { loadItem(); loadPhotos(); loadExpenses(); loadShopping(); }, [loadItem, loadPhotos, loadExpenses, loadShopping]));

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
      await uploadItemPhoto(itemId, result.assets[0].uri);
      loadPhotos();
    } catch (e: any) {
      Alert.alert("Upload failed", e.message ?? "Unknown error");
    }
    setUploading(false);
  }

  async function removePhoto(photo: PhotoWithUrl) {
    Alert.alert("Remove photo", "Delete this photo?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await deleteItemPhoto(photo); loadPhotos(); } },
    ]);
  }

  if (!item) return null;

  const fields: [string, string | null][] = [
    ["Booking source", item.booking_source],
    ["Confirmation", item.confirmation_code],
    ["Vendor", item.vendor],
    ["Address", item.address],
    ["Phone", item.phone],
  ];

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{
        title: item.title,
        headerRight: () => (
          <Pressable onPress={() => router.push(`/item/${itemId}/edit`)}>
            <Text style={{ color: colors.amber, fontWeight: "700" }}>Edit</Text>
          </Pressable>
        ),
      }} />
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

      {item.notes ? (
        <View style={styles.notesBox}>
          <Text style={styles.fieldLabel}>Notes</Text>
          <Text style={styles.notesText}>{item.notes}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Photos</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
        {photos.map((p) => (
          <Pressable key={p.id} onLongPress={() => removePhoto(p)} style={styles.photoWrap}>
            <Image source={{ uri: p.url }} style={styles.photo} />
          </Pressable>
        ))}
        <Pressable style={styles.addPhotoTile} onPress={addPhoto} disabled={uploading}>
          {uploading ? <ActivityIndicator color={colors.inkSoft} /> : <Text style={styles.addPhotoText}>+ Add</Text>}
        </Pressable>
      </ScrollView>
      {photos.length > 0 && <Text style={styles.hint}>Long-press a photo to remove it.</Text>}

      <Text style={styles.sectionLabel}>Expenses</Text>
      {expenses.map((e) => (
        <Pressable key={e.id} style={styles.expenseRow} onPress={() => setEditExpenseId(e.id)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.expenseDesc}>{e.note || "Expense"}</Text>
            {e.expense_date && <Text style={styles.expenseDate}>{e.expense_date}</Text>}
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: 20 },
  typeTag: { fontFamily: "IBMPlexMono_500Medium", color: colors.teal, fontWeight: "600", fontSize: 11 },
  title: { color: colors.ink, fontWeight: "800", fontSize: 22, marginVertical: 6 },
  fieldRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  fieldLabel: { color: colors.inkSoft, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  fieldValue: { color: colors.ink, fontSize: 15, marginTop: 2 },
  linkButton: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 12, alignItems: "center", marginTop: 16 },
  linkButtonText: { color: colors.paper, fontWeight: "700" },
  notesBox: { backgroundColor: colors.paperRaised, borderRadius: radius.md, padding: 14, marginTop: 16, borderWidth: 1, borderColor: colors.line },
  notesText: { color: colors.ink, fontSize: 14, marginTop: 4, lineHeight: 20 },
  sectionLabel: {
    color: colors.inkSoft, fontWeight: "700", fontSize: 12,
    textTransform: "uppercase", letterSpacing: 1, marginTop: 20, marginBottom: 4,
  },
  photoWrap: { marginRight: 8 },
  photo: { width: 90, height: 90, borderRadius: radius.md, backgroundColor: colors.paperRaised },
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
