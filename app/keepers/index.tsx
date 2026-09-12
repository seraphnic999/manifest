import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable } from "react-native";
import { Stack, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import SubpageHeader from "@/components/SubpageHeader";
import Icon from "@/components/icons/Icon";
import { colors, radius, fonts } from "@/lib/theme";
import { Keeper } from "@/lib/types";
import { fetchKeepers, groupKeepersByCity, KeeperCityGroup } from "@/lib/keepers";
import { categoryForDbType } from "@/lib/itemTypeMeta";
import KeeperDetailModal from "@/components/KeeperDetailModal";

function StarRow({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <View style={{ flexDirection: "row", gap: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={13} color={n <= rating ? colors.gold : colors.line} />
      ))}
    </View>
  );
}

export default function Keepers() {
  const { openKeeperId } = useLocalSearchParams<{ openKeeperId?: string }>();
  const { data, refetch } = useQuery({ queryKey: ["keepers"], queryFn: fetchKeepers });
  const groups: KeeperCityGroup[] = groupKeepersByCity(data ?? []);
  const [selected, setSelected] = useState<Keeper | null>(null);

  // The list's 5-minute staleTime (lib/queryClient.ts) is fine for a screen
  // you just browse, but a keeper added moments ago on another screen
  // (item detail's "Add to Keepers") needs to show up the instant you get
  // here, not up to 5 minutes later.
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  // Arriving from an item's "Keeper" badge — jump straight to its detail
  // once the list has loaded, instead of making the user find it again.
  useEffect(() => {
    if (!openKeeperId || !data) return;
    const match = data.find((k) => k.id === openKeeperId);
    if (match) setSelected(match);
  }, [openKeeperId, data]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SubpageHeader title="Keepers" />
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        data={groups}
        keyExtractor={(g) => g.cityLabel}
        renderItem={({ item: group }) => (
          <View style={{ marginBottom: 8 }}>
            <Text style={styles.cityLabel}>{group.cityLabel}</Text>
            {group.keepers.map((k) => (
              <Pressable key={k.id} style={styles.row} onPress={() => setSelected(k)}>
                <Icon name={categoryForDbType(k.item_type).icon} size={22} color={colors.blue} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{k.title}</Text>
                  {k.source_trip_name && <Text style={styles.rowSub} numberOfLines={1}>{k.source_trip_name}</Text>}
                </View>
                <StarRow rating={k.rating} />
              </Pressable>
            ))}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Nothing kept yet — open an item and tap "Add to Keepers" to start your list.
          </Text>
        }
      />

      {selected && (
        <KeeperDetailModal
          visible
          keeper={selected}
          onClose={() => setSelected(null)}
          onChanged={refetch}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  cityLabel: {
    color: colors.ink, fontFamily: fonts.display, fontSize: 18,
    marginTop: 8, marginBottom: 8,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 12, marginBottom: 8,
  },
  rowTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 15 },
  rowSub: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
  empty: { color: colors.inkSoft, fontStyle: "italic", fontSize: 13, textAlign: "center", marginTop: 40 },
});
