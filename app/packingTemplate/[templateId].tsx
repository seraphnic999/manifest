import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/lib/alert";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { PackingTemplateItem } from "@/lib/types";
import { PACKING_CATEGORIES } from "@/lib/packing";
import SubpageHeader from "@/components/SubpageHeader";

interface TemplateData {
  name: string;
  items: PackingTemplateItem[];
}

async function fetchTemplate(templateId: string): Promise<TemplateData> {
  const { data: template, error: templateError } = await supabase.from("packing_templates").select("name").eq("id", templateId).single();
  if (templateError) throw templateError;
  const { data: items, error: itemsError } = await supabase
    .from("packing_template_items").select("*").eq("template_id", templateId).order("sort_order");
  if (itemsError) throw itemsError;
  return { name: template?.name ?? "", items: (items ?? []) as PackingTemplateItem[] };
}

export default function PackingTemplateEditor() {
  const { templateId } = useLocalSearchParams<{ templateId: string }>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState<string | null>(null);

  const { data, refetch } = useQuery({ queryKey: ["packingTemplate", templateId], queryFn: () => fetchTemplate(templateId) });
  const items = data?.items ?? [];

  useEffect(() => { if (data) setName(data.name); }, [data?.name]);

  async function saveName() {
    if (!name.trim()) return;
    await supabase.from("packing_templates").update({ name: name.trim() }).eq("id", templateId);
  }

  async function addItem() {
    if (!newItemName.trim()) return;
    const nextOrder = items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0;
    await supabase.from("packing_template_items").insert({
      template_id: templateId, name: newItemName.trim(), category: newItemCategory, sort_order: nextOrder,
    });
    setNewItemName("");
    setNewItemCategory(null);
    refetch();
  }

  async function removeItem(itemId: string) {
    await supabase.from("packing_template_items").delete().eq("id", itemId);
    refetch();
  }

  function deleteTemplate() {
    Alert.alert("Delete template", `Delete "${name}"? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await supabase.from("packing_templates").delete().eq("id", templateId);
          router.back();
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SubpageHeader title="Edit Template" />
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>

      <Text style={styles.label}>Template name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} onBlur={saveName} />

      <Text style={styles.label}>Items</Text>
      {items.map((item) => (
        <View key={item.id} style={styles.itemRow}>
          <Text style={styles.itemName}>{item.name}</Text>
          {item.category && <Text style={styles.itemCategory}>{item.category}</Text>}
          <Pressable onPress={() => removeItem(item.id)}>
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
      ))}
      {items.length === 0 && <Text style={styles.empty}>No items yet.</Text>}

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

      <Pressable style={styles.deleteButton} onPress={deleteTemplate}>
        <Text style={styles.deleteButtonText}>Delete template</Text>
      </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  label: {
    color: colors.inkSoft, fontSize: 12, fontWeight: "600", marginTop: 16, marginBottom: 6,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
  },
  itemRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 10, marginBottom: 6,
  },
  itemName: { color: colors.ink, fontSize: 14, flex: 1 },
  itemCategory: { color: colors.lightBlue, fontSize: 11, fontWeight: "600" },
  removeText: { color: colors.coral, fontSize: 12, fontWeight: "600" },
  empty: { color: colors.inkSoft, fontStyle: "italic", fontSize: 13, marginTop: 4 },
  addCard: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line, borderStyle: "dashed",
    borderRadius: radius.md, padding: 12, marginTop: 10,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  chipActive: { backgroundColor: colors.lightBlue, borderColor: colors.lightBlue },
  chipText: { color: colors.inkSoft, fontWeight: "600", fontSize: 12 },
  chipTextActive: { color: "#fff" },
  addButton: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 12, alignItems: "center", marginTop: 10 },
  addButtonText: { color: colors.paper, fontWeight: "700" },
  deleteButton: {
    borderWidth: 1, borderColor: colors.coral, borderRadius: radius.md,
    padding: 14, alignItems: "center", marginTop: 24,
  },
  deleteButtonText: { color: colors.coral, fontWeight: "700" },
});
