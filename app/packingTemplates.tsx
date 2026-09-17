import { useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable } from "react-native";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/lib/alert";
import { radius, fonts, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import SubpageHeader from "@/components/SubpageHeader";
import Icon from "@/components/icons/Icon";
import TemplateNameModal from "@/components/TemplateNameModal";
import { fetchPackingTemplates, createPackingTemplate } from "@/lib/packing";

export default function PackingTemplates() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [creating, setCreating] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const { data, refetch } = useQuery({ queryKey: ["packingTemplates"], queryFn: fetchPackingTemplates });
  const templates = data ?? [];

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  async function saveNewTemplate(name: string) {
    setCreating(true);
    try {
      const id = await createPackingTemplate(name);
      setNameModalOpen(false);
      router.push(`/packingTemplate/${id}`);
    } catch (e: any) {
      Alert.alert("Couldn't create template", e?.message ?? "Unknown error");
    }
    setCreating(false);
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
      <Pressable style={styles.fab} onPress={() => setNameModalOpen(true)}>
        <Icon name="add" size={24} color={colors.paper} />
      </Pressable>

      <TemplateNameModal
        visible={nameModalOpen}
        onClose={() => setNameModalOpen(false)}
        onSave={saveNewTemplate}
        title="New template"
        saving={creating}
      />
    </View>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
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
