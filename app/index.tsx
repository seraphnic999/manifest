import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl, TextInput } from "react-native";
import { useRouter, useFocusEffect, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { Trip, tripStatus } from "@/lib/types";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";
import { useNetworkStatus } from "@/lib/useNetworkStatus";
import OfflineBanner from "@/components/OfflineBanner";
import HeaderIconButton from "@/components/HeaderIconButton";
import { searchEverything, SearchResult, SEARCH_KIND_LABEL } from "@/lib/search";
import { Alert } from "@/lib/alert";

// Set once a current-trip redirect has been attempted this app session, so
// it only ever fires on the first load after launch — the Home button (the
// only other way back to this screen) must keep working as a real trip list
// even while a trip is current, not bounce straight back to Today.
let hasCheckedLaunchRedirect = false;

async function fetchTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .is("deleted_at", null)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return data as Trip[];
}

export default function TripList() {
  const router = useRouter();
  const isOnline = useNetworkStatus();
  const { data, dataUpdatedAt, refetch, isRefetching } = useQuery({
    queryKey: ["trips"],
    queryFn: fetchTrips,
  });
  const trips = data ?? [];

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => {
    const handle = setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);
  const searching = searchQuery.length >= 2;
  const { data: searchResults, isFetching: searchLoading } = useQuery({
    queryKey: ["search", searchQuery],
    queryFn: () => searchEverything(searchQuery),
    enabled: searching,
  });
  const resultsByKind = { trip: [], item: [], shopping: [], expense: [] } as Record<SearchResult["kind"], SearchResult[]>;
  for (const r of searchResults ?? []) resultsByKind[r.kind].push(r);

  function openResult(r: SearchResult) {
    if (r.kind === "trip") router.push(`/trip/${r.id}`);
    else if (r.kind === "item") router.push(`/item/${r.id}`);
    else if (r.kind === "shopping") router.push(`/trip/${r.trip_id}/shopping`);
    else router.push(`/trip/${r.trip_id}/money`);
  }

  // Runs once per app session, the first time trip data actually loads —
  // see hasCheckedLaunchRedirect above for why this can't just be "every
  // time this screen loads".
  const redirectChecked = useRef(false);
  useEffect(() => {
    if (!data || redirectChecked.current || hasCheckedLaunchRedirect) return;
    redirectChecked.current = true;
    hasCheckedLaunchRedirect = true;
    const current = data.find((t) => tripStatus(t) === "current");
    if (current) router.replace(`/trip/${current.id}/today`);
  }, [data]);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const onRefresh = async () => { await refetch(); };

  function signOut() {
    Alert.alert("Sign out", "Sign out of Manifest?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out", style: "destructive",
        onPress: () => {
          // So a later sign-in this same app session gets the same
          // straight-to-Today jump a cold launch would, instead of landing
          // on the plain trip list just because launch already happened once.
          hasCheckedLaunchRedirect = false;
          supabase.auth.signOut();
        },
      },
    ]);
  }

  // Upcoming = not finished yet (already in progress or still to come), soonest
  // first. Previous = already over, most recently ended first (going further
  // back in time below that).
  const upcoming = trips
    .filter((t) => tripStatus(t) !== "past")
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const previous = trips
    .filter((t) => tripStatus(t) === "past")
    .sort((a, b) => b.start_date.localeCompare(a.start_date));

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: "Trips",
        headerRight: () => (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <HeaderIconButton onPress={() => router.push("/archived")} accessibilityLabel="Archived trips">
              <Ionicons name="archive-outline" size={16} color={colors.inkSoft} />
            </HeaderIconButton>
            <HeaderIconButton onPress={signOut} accessibilityLabel="Sign out">
              <Ionicons name="log-out-outline" size={16} color={colors.coral} />
            </HeaderIconButton>
          </View>
        ),
      }} />
      <View style={styles.topbar}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View>
            <Text style={styles.eyebrow}>YOUR TRIPS</Text>
            <Text style={styles.title}>Where next?</Text>
          </View>
          <Pressable
            style={styles.newButton}
            onPress={() => {
              if (!isOnline) {
                Alert.alert("You're offline", "Connect to the internet to create a new trip.");
                return;
              }
              router.push("/trip/new");
            }}
          >
            <Text style={styles.newButtonText}>+ New trip</Text>
          </Pressable>
        </View>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={colors.inkSoft} />
          <TextInput
            style={styles.searchInput}
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Search trips, items, shopping, expenses…"
            placeholderTextColor={colors.inkSoft}
          />
          {searchInput.length > 0 && (
            <Pressable onPress={() => setSearchInput("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.inkSoft} />
            </Pressable>
          )}
        </View>
      </View>
      <OfflineBanner dataUpdatedAt={!isOnline ? dataUpdatedAt : undefined} />

      {searching ? (
        <FlatList
          contentContainerStyle={{ padding: 16 }}
          data={(["trip", "item", "shopping", "expense"] as const).map((kind) => ({ kind, items: resultsByKind[kind] }))}
          keyExtractor={(s) => s.kind}
          renderItem={({ item: section }) =>
            section.items.length === 0 ? null : (
              <View>
                <Text style={styles.sectionLabel}>{SEARCH_KIND_LABEL[section.kind]}{section.items.length > 1 ? "s" : ""}</Text>
                {section.items.map((r) => (
                  <Pressable key={r.id} style={styles.card} onPress={() => openResult(r)}>
                    <Text style={styles.tag}>{r.trip_name}</Text>
                    <Text style={styles.cardTitle}>{r.title}</Text>
                    {!!r.subtitle && <Text style={styles.dates}>{r.subtitle}</Text>}
                  </Pressable>
                ))}
              </View>
            )
          }
          ListEmptyComponent={
            <Text style={styles.empty}>{searchLoading ? "Searching…" : "No matches."}</Text>
          }
        />
      ) : (
        <FlatList
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />}
          data={[
            { label: "Upcoming Trips", items: upcoming },
            { label: "Previous Trips", items: previous },
          ]}
          keyExtractor={(s) => s.label}
          renderItem={({ item: section }) =>
            section.items.length === 0 ? null : (
              <View>
                <Text style={styles.sectionLabel}>{section.label}</Text>
                {section.items.map((trip) => (
                  <Pressable
                    key={trip.id}
                    style={styles.card}
                    onPress={() => router.push(
                      tripStatus(trip) === "current" ? `/trip/${trip.id}/today` : `/trip/${trip.id}`
                    )}
                  >
                    <Text style={styles.tag}>{trip.type.toUpperCase()}</Text>
                    <Text style={styles.cardTitle}>{trip.name}</Text>
                    <Text style={styles.dates}>
                      {formatDateDDMMYYYY(trip.start_date)} – {formatDateDDMMYYYY(trip.end_date)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )
          }
          ListEmptyComponent={
            <Text style={styles.empty}>No trips yet — create your first one.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  topbar: { padding: 20, paddingBottom: 8 },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, marginTop: 14,
  },
  searchInput: { flex: 1, color: colors.ink, fontSize: 14, padding: 0 },
  eyebrow: { color: colors.amber, fontWeight: "600", fontSize: 11, letterSpacing: 1 },
  title: { color: colors.ink, fontWeight: "800", fontSize: 24, marginTop: 4 },
  sectionLabel: {
    color: colors.inkSoft, fontWeight: "700", fontSize: 12,
    textTransform: "uppercase", letterSpacing: 1, marginVertical: 10,
  },
  card: {
    backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 16, marginBottom: 10,
  },
  tag: { color: colors.inkSoft, fontSize: 10, letterSpacing: 1, fontWeight: "600" },
  cardTitle: { color: colors.ink, fontWeight: "700", fontSize: 18, marginTop: 4 },
  dates: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
  empty: { textAlign: "center", color: colors.inkSoft, marginTop: 40 },
  newButton: { backgroundColor: colors.ink, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12 },
  newButtonText: { color: colors.paper, fontWeight: "700", fontSize: 12 },
});
