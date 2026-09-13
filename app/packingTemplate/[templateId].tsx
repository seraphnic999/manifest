import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/lib/alert";
import { supabase } from "@/lib/supabase";
import { colors, radius, fonts } from "@/lib/theme";
import { PackingTemplateItem } from "@/lib/types";
import {
  PACKING_CATEGORIES,
  renamePackingTemplate, deletePackingTemplate,
  addPackingTemplateItem, updatePackingTemplateItem, deletePackingTemplateItem,
} from "@/lib/packing";
import Icon from "@/components/icons/Icon";
import TemplateNameModal from "@/components/TemplateNameModal";
import PackingTemplateItemModal from "@/components/PackingTemplateItemModal";

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
  const insets = useSafeAreaInsets();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [itemModalItem, setItemModalItem] = useState<PackingTemplateItem | "new" | null>(null);

  const { data, refetch } = useQuery({ queryKey: ["packingTemplate", templateId], queryFn: () => fetchTemplate(templateId) });
  const name = data?.name ?? "";
  const items = data?.items ?? [];

  async function saveRename(newName: string) {
    setRenaming(true);
    try {
      await renamePackingTemplate(templateId, newName);
      setRenameOpen(false);
      refetch();
    } catch (e: any) {
      Alert.alert("Couldn't rename template", e?.message ?? "Unknown error");
    }
    setRenaming(false);
  }

  function confirmDeleteTemplate() {
    Alert.alert("Delete template", `Delete "${name}"? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await deletePackingTemplate(templateId);
          router.back();
        },
      },
    ]);
  }

  async function saveItem(itemName: string, category: string | null) {
    if (itemModalItem === "new") {
      const nextOrder = items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0;
      await addPackingTemplateItem(templateId, itemName, category, nextOrder);
    } else if (itemModalItem) {
      await updatePackingTemplateItem(itemModalItem.id, itemName, category);
    }
    setItemModalItem(null);
    refetch();
  }

  async function deleteItem() {
    if (itemModalItem === "new" || !itemModalItem) return;
    await deletePackingTemplateItem(itemModalItem.id);
    setItemModalItem(null);
    refetch();
  }

  const editingItem = itemModalItem === "new" ? null : itemModalItem;

  const grouped = new Map<string, PackingTemplateItem[]>();
  for (const item of items) {
    const key = item.category ?? "Other";
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  const groupOrder = PACKING_CATEGORIES.concat(
    Array.from(grouped.keys()).filter((k) => !PACKING_CATEGORIES.includes(k))
  ).filter((cat) => grouped.has(cat));

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/packingTemplates"))} hitSlop={10} style={styles.backBtn}>
          <Icon name="back" size={25} color={colors.blue} />
        </Pressable>
        <View style={styles.titleGroup}>
          <Text style={styles.title} numberOfLines={1}>{name}</Text>
          <Pressable onPress={() => setRenameOpen(true)} hitSlop={10}>
            <Icon name="edit" size={16} color={colors.blue} />
          </Pressable>
        </View>
        <Pressable onPress={confirmDeleteTemplate} hitSlop={10}>
          <Icon name="trash" size={20} color={colors.coral} />
        </Pressable>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        {groupOrder.map((cat) => (
          <View key={cat} style={styles.group}>
            <Text style={styles.groupLabel}>{cat}</Text>
            {grouped.get(cat)!.map((item) => (
              <Pressable key={item.id} style={styles.itemRow} onPress={() => setItemModalItem(item)}>
                <Text style={styles.itemName}>{item.name}</Text>
              </Pressable>
            ))}
          </View>
        ))}
        {items.length === 0 && <Text style={styles.empty}>No items yet — tap the + button to add one.</Text>}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => setItemModalItem("new")}>
        <Icon name="add" size={24} color="#fff" />
      </Pressable>

      <TemplateNameModal
        visible={renameOpen}
        onClose={() => setRenameOpen(false)}
        onSave={saveRename}
        initialName={name}
        title="Rename template"
        saving={renaming}
      />

      <PackingTemplateItemModal
        visible={itemModalItem !== null}
        onClose={() => setItemModalItem(null)}
        onSave={saveItem}
        onDelete={editingItem ? deleteItem : undefined}
        initialName={editingItem?.name}
        initialCategory={editingItem?.category}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingBottom: 10,
    backgroundColor: colors.paperRaised, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  backBtn: { padding: 2 },
  titleGroup: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  title: { fontFamily: fonts.display, fontSize: 19, color: colors.ink, flexShrink: 1 },
  group: { marginBottom: 16 },
  groupLabel: {
    color: colors.inkSoft, fontWeight: "700", fontSize: 12,
    textTransform: "uppercase", letterSpacing: 1, marginBottom: 6,
  },
  itemRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 14, marginBottom: 8,
  },
  itemName: { color: colors.ink, fontSize: 15, flex: 1 },
  empty: { color: colors.inkSoft, fontStyle: "italic", fontSize: 13, textAlign: "center", marginTop: 30 },
  fab: {
    position: "absolute", bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.ink, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
});
