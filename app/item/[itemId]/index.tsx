import { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Linking, Pressable } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { Item } from "@/lib/types";

// Everything that's deliberately hidden from the day view lives here:
// booking_source, vendor, link, confirmation_code, address, phone,
// notes, plus (TODO) sub-steps, alternatives, linked expenses, photos.
export default function ItemDetails() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);

  useEffect(() => {
    supabase.from("items").select("*").eq("id", itemId).single()
      .then(({ data }) => data && setItem(data as Item));
  }, [itemId]);

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
});
