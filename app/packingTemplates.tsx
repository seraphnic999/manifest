import { View, Text, FlatList, StyleSheet, Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/lib/alert";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import HomeButton from "@/components/HomeButton";

interface TemplateRow {
  id: string;
  name: string;
  itemCount: number;
}

async function fetchTemplates(): Promise<TemplateRow[]> {
  const { data, error } = await supabase
    .from("packing_templates")
    .select("id, name, packing_template_items(count)")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((t: any) => ({ id: t.id, name: t.name, itemCount: t.packing_template_items?.[0]?.count ?? 0 }));
}

export default function PackingTemplates() {
  const router = useRouter();
  const { data, refetch } = useQuery({ queryKey: ["packingTemplates"], queryFn: fetchTemplates });
  const templates = data ?? [];

  async function createTemplate() {
    const { data: t, error } = await supabase.from("packing_templates").insert({ name: "New template" }).select().single();
    if (error || !t) {
      Alert.alert("Couldn't create template", error?.message ?? "Unknown error");
      return;
    }
    router.push(`/packingTemplate/${t.id}`);
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: "Packing Templates",
        headerRight: () => (
          <View style={{ marginRight: 14 }}>
            <HomeButton />
          </View>
        ),
      }} />
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        data={templates}
        keyExtractor={(t) => t.id}
        onRefresh={refetch}
        refreshing={false}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/packingTemplate/${item.id}`)}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardMeta}>{item.itemCount} item{item.itemCount === 1 ? "" : "s"}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No templates yet — create one to reuse across trips.</Text>
        }
      />
      <Pressable style={styles.fab} onPress={createTemplate}>
        <Text style={styles.fabText}>+ New template</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  card: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 16, marginBottom: 10,
  },
  cardTitle: { color: colors.ink, fontWeight: "700", fontSize: 16 },
  cardMeta: { color: colors.inkSoft, fontSize: 12, marginTop: 4 },
  empty: { textAlign: "center", color: colors.inkSoft, marginTop: 40 },
  fab: {
    position: "absolute", bottom: 20, alignSelf: "center",
    backgroundColor: colors.ink, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 24,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  fabText: { color: colors.paper, fontWeight: "700" },
});
