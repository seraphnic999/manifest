import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/lib/alert";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { Trip } from "@/lib/types";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";
import HomeButton from "@/components/HomeButton";

async function fetchArchivedTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) throw error;
  return data as Trip[];
}

export default function ArchivedTrips() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, refetch, isRefetching } = useQuery({
    queryKey: ["archivedTrips"],
    queryFn: fetchArchivedTrips,
  });
  const trips = data ?? [];

  async function unarchive(trip: Trip) {
    const { error } = await supabase.from("trips").update({ deleted_at: null }).eq("id", trip.id);
    if (error) {
      Alert.alert("Couldn't restore trip", error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["trips"] });
    refetch();
  }

  function deleteForever(trip: Trip) {
    Alert.alert(
      "Delete permanently",
      `Permanently delete "${trip.name}" and everything in it — days, items, shopping list, and expenses? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete forever", style: "destructive",
          onPress: async () => {
            const { error } = await supabase.from("trips").delete().eq("id", trip.id);
            if (error) {
              Alert.alert("Couldn't delete trip", error.message);
              return;
            }
            refetch();
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: "Archived Trips",
        headerRight: () => (
          <View style={{ marginRight: 14 }}>
            <HomeButton />
          </View>
        ),
      }} />
      <FlatList
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        data={trips}
        keyExtractor={(t) => t.id}
        renderItem={({ item: trip }) => (
          <View style={styles.card}>
            <Pressable onPress={() => router.push(`/trip/${trip.id}`)}>
              <Text style={styles.tag}>{trip.type.toUpperCase()}</Text>
              <Text style={styles.cardTitle}>{trip.name}</Text>
              <Text style={styles.dates}>
                {formatDateDDMMYYYY(trip.start_date)} – {formatDateDDMMYYYY(trip.end_date)}
              </Text>
            </Pressable>
            <View style={styles.actions}>
              <Pressable style={styles.restoreButton} onPress={() => unarchive(trip)}>
                <Text style={styles.restoreButtonText}>Restore</Text>
              </Pressable>
              <Pressable style={styles.deleteButton} onPress={() => deleteForever(trip)}>
                <Text style={styles.deleteButtonText}>Delete forever</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No archived trips.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  card: {
    backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 16, marginBottom: 10,
  },
  tag: { color: colors.inkSoft, fontSize: 10, letterSpacing: 1, fontWeight: "600" },
  cardTitle: { color: colors.ink, fontWeight: "700", fontSize: 18, marginTop: 4 },
  dates: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  restoreButton: {
    flex: 1, borderWidth: 1, borderColor: colors.teal, borderRadius: radius.md,
    paddingVertical: 10, alignItems: "center",
  },
  restoreButtonText: { color: colors.teal, fontWeight: "700", fontSize: 13 },
  deleteButton: {
    flex: 1, borderWidth: 1, borderColor: colors.coral, borderRadius: radius.md,
    paddingVertical: 10, alignItems: "center",
  },
  deleteButtonText: { color: colors.coral, fontWeight: "700", fontSize: 13 },
  empty: { textAlign: "center", color: colors.inkSoft, marginTop: 40 },
});
