import { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, StyleSheet, Pressable, Image } from "react-native";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import SubpageHeader from "@/components/SubpageHeader";
import Icon from "@/components/icons/Icon";
import { colors, radius, fonts } from "@/lib/theme";
import { Companion } from "@/lib/types";
import {
  fetchCompanions, ensureSelfCompanion, relationshipGroup, relationshipLabel, companionFullName, CompanionGroup,
  fetchCompanionProfileUrl,
} from "@/lib/companions";

interface Section {
  key: "self" | CompanionGroup;
  title: string;
  data: Companion[];
}

async function fetchSections(): Promise<Section[]> {
  await ensureSelfCompanion();
  const companions = await fetchCompanions();
  const self = companions.filter((c) => c.is_self);
  const others = companions.filter((c) => !c.is_self);
  const family = others.filter((c) => relationshipGroup(c) === "family");
  const friends = others.filter((c) => relationshipGroup(c) === "friends");
  const rest = others.filter((c) => relationshipGroup(c) === "others");
  const sections: Section[] = [
    { key: "self", title: "Me", data: self },
    { key: "family", title: "Family", data: family },
    { key: "friends", title: "Friends", data: friends },
    { key: "others", title: "Others", data: rest },
  ];
  return sections.filter((s) => s.data.length > 0);
}

function CompanionRow({ companion }: { companion: Companion }) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { fetchCompanionProfileUrl(companion.profile_photo_path).then(setUrl); }, [companion.profile_photo_path]);
  return (
    <Pressable style={styles.row} onPress={() => router.push(`/doctracker/${companion.id}`)}>
      {url ? (
        <Image source={{ uri: url }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}><Icon name="user" size={22} color={colors.inkSoft} /></View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName}>{companionFullName(companion)}</Text>
        {companion.relationship && <Text style={styles.rowRelationship}>{relationshipLabel(companion.relationship)}</Text>}
      </View>
      <Text style={styles.chevron}>{"›"}</Text>
    </Pressable>
  );
}

export default function DocTracker() {
  const router = useRouter();
  const { data, refetch } = useQuery({ queryKey: ["docTrackerCompanions"], queryFn: fetchSections });
  const sections = data ?? [];

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SubpageHeader title="Doc Tracker" />
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        data={sections}
        keyExtractor={(s) => s.key}
        onRefresh={refetch}
        refreshing={false}
        renderItem={({ item }) => (
          <View style={{ marginBottom: 8 }}>
            <Text style={styles.sectionLabel}>{item.title}</Text>
            {item.data.map((c) => <CompanionRow key={c.id} companion={c} />)}
          </View>
        )}
      />
      <Pressable style={styles.fab} onPress={() => router.push("/doctracker/new")}>
        <Icon name="add" size={24} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  sectionLabel: {
    color: colors.inkSoft, fontFamily: fonts.bodyBold, fontSize: 11.5, textTransform: "uppercase",
    letterSpacing: 1, marginBottom: 8, marginTop: 8,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 12, marginBottom: 8,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.paper,
    borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center",
  },
  rowName: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 15 },
  rowRelationship: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
  chevron: { color: colors.inkSoft, fontSize: 18 },
  fab: {
    position: "absolute", bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.ink, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
});
