import { View, Text, FlatList, StyleSheet, Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/lib/alert";
import { supabase } from "@/lib/supabase";
import { colors, radius, fonts } from "@/lib/theme";
import SubpageHeader from "@/components/SubpageHeader";
import Icon from "@/components/icons/Icon";

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
      <Stack.Screen options={{ headerShown: false }} />
      <SubpageHeader title="Packing Templates" />
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        data={templates}
        keyExtractor={(t) => t.id}
        onRefresh={refetch}
        refreshing={false}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/packingTemplate/${item.id}`)}>
            <View style={styles.cardIconCirc}><Icon name="packing" size={22} color={colors.blue} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardMeta}>{item.itemCount} item{item.itemCount === 1 ? "" : "s"}</Text>
            </View>
            <Text style={styles.chevron}>{"›"}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No templates yet — create one to reuse across trips.</Text>
        }
      />
      <Pressable style={styles.fab} onPress={createTemplate}>
        <Icon name="add" size={24} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 14, marginBottom: 10,
  },
  cardIconCirc: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.paper, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 15 },
  cardMeta: { color: colors.inkSoft, fontSize: 12, marginTop: 3 },
  chevron: { color: colors.inkSoft, fontSize: 18 },
  empty: { textAlign: "center", color: colors.inkSoft, marginTop: 40 },
  fab: {
    position: "absolute", bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.ink, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
});
