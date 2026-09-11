import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl, ImageBackground } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/lib/alert";
import { supabase } from "@/lib/supabase";
import { colors, radius, fonts } from "@/lib/theme";
import { Trip } from "@/lib/types";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";
import SubpageHeader from "@/components/SubpageHeader";
import { coverPhotoSource } from "@/lib/destinationPhotos";

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
      <Stack.Screen options={{ headerShown: false }} />
      <SubpageHeader title="Archived Trips" />
      <FlatList
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        data={trips}
        keyExtractor={(t) => t.id}
        renderItem={({ item: trip }) => (
          <View style={styles.card}>
            <Pressable onPress={() => router.push(`/trip/${trip.id}`)}>
              <ImageBackground source={coverPhotoSource(trip.cover_photo_id)} style={styles.cardTop} imageStyle={{ borderRadius: radius.lg }}>
                <View style={styles.cardScrim} />
                <Text style={styles.cardTitle}>{trip.name}</Text>
                <Text style={styles.tag}>{trip.type.toUpperCase()}</Text>
              </ImageBackground>
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
    borderRadius: radius.lg, padding: 12, marginBottom: 12,
  },
  cardTop: { height: 100, borderRadius: radius.lg, overflow: "hidden", justifyContent: "flex-end", padding: 10, marginBottom: 8 },
  cardScrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(11,30,63,0.3)" },
  tag: { color: "rgba(255,255,255,0.9)", fontSize: 9, letterSpacing: 1, fontFamily: fonts.bodyBold },
  cardTitle: { color: "#fff", fontFamily: fonts.display, fontSize: 17 },
  dates: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  restoreButton: {
    flex: 1, borderWidth: 1, borderColor: colors.lightBlue, borderRadius: radius.md,
    paddingVertical: 10, alignItems: "center",
  },
  restoreButtonText: { color: colors.lightBlue, fontFamily: fonts.bodyBold, fontSize: 13 },
  deleteButton: {
    flex: 1, borderWidth: 1, borderColor: colors.coral, borderRadius: radius.md,
    paddingVertical: 10, alignItems: "center",
  },
  deleteButtonText: { color: colors.coral, fontFamily: fonts.bodyBold, fontSize: 13 },
  empty: { textAlign: "center", color: colors.inkSoft, marginTop: 40 },
});
