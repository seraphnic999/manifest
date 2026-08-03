import { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { Day } from "@/lib/types";

// Trip overview: lists days so the user can jump into a specific day's
// itinerary at /trip/[tripId]/day/[date].
export default function TripOverview() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [days, setDays] = useState<Day[]>([]);
  const router = useRouter();

  useEffect(() => {
    supabase
      .from("days")
      .select("*")
      .eq("trip_id", tripId)
      .order("sort_order")
      .then(({ data }) => data && setDays(data as Day[]));
  }, [tripId]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Itinerary" }} />
      <FlatList
        contentContainerStyle={{ padding: 16 }}
        data={days}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.dayRow}
            onPress={() => router.push(`/trip/${tripId}/day/${item.date}`)}
          >
            <Text style={styles.date}>{item.date}</Text>
            {item.theme ? <Text style={styles.theme}>{item.theme}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  dayRow: {
    backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 14, marginBottom: 8,
  },
  date: { fontFamily: "IBMPlexMono_500Medium", color: colors.ink, fontWeight: "600" },
  theme: { color: colors.teal, fontSize: 12, marginTop: 2, fontWeight: "600" },
});
