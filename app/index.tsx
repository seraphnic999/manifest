import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl, TextInput, Image, ImageBackground } from "react-native";
import { useRouter, useFocusEffect, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { colors, radius, fonts } from "@/lib/theme";
import { Trip, Item, tripStatus } from "@/lib/types";
import { formatDateDDMMYYYY, localIsoDate } from "@/lib/dateFormat";
import { normalizeTimeHHMM } from "@/lib/timeFormat";
import { useNetworkStatus } from "@/lib/useNetworkStatus";
import OfflineBanner from "@/components/OfflineBanner";
import Icon from "@/components/icons/Icon";
import HamburgerMenu from "@/components/HamburgerMenu";
import { searchEverything, SearchResult, SEARCH_KIND_LABEL } from "@/lib/search";
import { TripCountdownInline } from "@/components/TripCountdown";
import { coverPhotoSource } from "@/lib/destinationPhotos";
import { fetchDestinationForecast } from "@/lib/weather";
import { weatherIconName } from "@/lib/weather";
import { Alert } from "@/lib/alert";

// Set once a current-trip redirect has been attempted this app session, so
// it only ever fires on the first load after launch — the Home button (the
// only other way back to this screen) must keep working as a real trip list
// even while a trip is current, not bounce straight back to its Overview.
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

interface HeroExtra {
  nextItemTitle: string | null;
  nextItemTime: string | null;
  weatherTemp: number | null;
  weatherCode: number | null;
}

// The ongoing-trip hero needs two things nothing else on this screen fetches:
// the very next scheduled item (today's remainder, or the next day that has
// one), and today's weather for the trip's first destination. Same "next
// item" idea as the Today section on the trip's own Overview screen, just
// trimmed down since the hero only shows one line.
async function fetchHeroExtra(tripId: string, destinations: string[]): Promise<HeroExtra> {
  const iso = localIsoDate();
  const { data: days } = await supabase.from("days").select("id, date").eq("trip_id", tripId).order("sort_order");
  const todayDay = (days ?? []).find((d) => d.date === iso);

  let nextItem: Pick<Item, "title" | "time_start"> | null = null;
  if (todayDay) {
    const { data: items } = await supabase
      .from("items").select("title, time_start").eq("day_id", todayDay.id).is("deleted_at", null)
      .not("time_start", "is", null).order("time_start");
    const now = new Date();
    nextItem = (items ?? []).find((it) => {
      const t = normalizeTimeHHMM(it.time_start);
      return t && new Date(`${iso}T${t}:00`).getTime() >= now.getTime();
    }) ?? null;
  }
  if (!nextItem) {
    const future = (days ?? []).filter((d) => d.date && d.date > iso).sort((a, b) => (a.date! < b.date! ? -1 : 1));
    for (const d of future) {
      const { data: items } = await supabase
        .from("items").select("title, time_start").eq("day_id", d.id).is("deleted_at", null).order("sort_order").limit(1);
      if (items && items.length > 0) { nextItem = items[0]; break; }
    }
  }

  let weatherTemp: number | null = null;
  let weatherCode: number | null = null;
  if (destinations.length > 0) {
    const forecast = await fetchDestinationForecast(destinations[0]);
    if (forecast && forecast.days.length > 0) {
      weatherTemp = Math.round(forecast.days[0].tempMax);
      weatherCode = forecast.days[0].weatherCode;
    }
  }

  return {
    nextItemTitle: nextItem?.title ?? null,
    nextItemTime: nextItem ? normalizeTimeHHMM(nextItem.time_start) : null,
    weatherTemp, weatherCode,
  };
}

function TripPhotoCard({ trip, showCountdown, onArchive }: { trip: Trip; showCountdown: boolean; onArchive?: () => void }) {
  const router = useRouter();
  return (
    <Pressable
      style={styles.tripCard}
      onPress={() => router.push(`/trip/${trip.id}`)}
    >
      <ImageBackground source={coverPhotoSource(trip.cover_photo_id)} style={styles.tripCardTop} imageStyle={{ resizeMode: "cover" }}>
        <View style={styles.tripCardScrim} />
        <View style={styles.tripCardInfo}>
          <Text style={styles.tripCardName} numberOfLines={1}>{trip.name}</Text>
          <Text style={styles.tripCardType}>{trip.type.toUpperCase()}</Text>
        </View>
      </ImageBackground>
      <View style={styles.tripCardBottom}>
        <View>
          <Text style={styles.tripCardDates}>{formatDateDDMMYYYY(trip.start_date)} – {formatDateDDMMYYYY(trip.end_date)}</Text>
          {showCountdown && <TripCountdownInline tripId={trip.id} fallbackDateIso={trip.start_date} />}
        </View>
        {onArchive ? (
          <Pressable onPress={onArchive} hitSlop={10}>
            <Icon name="archive" size={25} color={colors.inkSoft} />
          </Pressable>
        ) : (
          <Text style={styles.chevron}>{"›"}</Text>
        )}
      </View>
    </Pressable>
  );
}

export default function TripList() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isOnline = useNetworkStatus();
  const { data, dataUpdatedAt, refetch, isRefetching } = useQuery({
    queryKey: ["trips"],
    queryFn: fetchTrips,
  });
  const trips = data ?? [];
  const currentTrip = trips.find((t) => tripStatus(t) === "current") ?? null;

  const { data: heroExtra } = useQuery({
    queryKey: ["homeHero", currentTrip?.id],
    queryFn: () => fetchHeroExtra(currentTrip!.id, currentTrip!.destinations),
    enabled: !!currentTrip,
  });

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
    if (current) router.replace(`/trip/${current.id}`);
  }, [data]);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const onRefresh = async () => { await refetch(); };

  function archiveTrip(trip: Trip) {
    Alert.alert("Archive trip", `Archive "${trip.name}"? It'll disappear from your trip list but nothing is deleted — restore it anytime from Archived Trips.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Archive",
        onPress: async () => {
          const { error } = await supabase.from("trips").update({ deleted_at: new Date().toISOString() }).eq("id", trip.id);
          if (error) {
            Alert.alert("Couldn't archive trip", error.message);
            return;
          }
          refetch();
        },
      },
    ]);
  }

  function signOut() {
    Alert.alert("Sign out", "Sign out of Manifest?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out", style: "destructive",
        onPress: () => {
          hasCheckedLaunchRedirect = false;
          supabase.auth.signOut();
        },
      },
    ]);
  }

  // Upcoming = not finished yet (already in progress or still to come, minus
  // the one already shown in the hero), soonest first. Previous = already
  // over, most recently ended first.
  const upcoming = trips
    .filter((t) => tripStatus(t) !== "past" && t.id !== currentTrip?.id)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const previous = trips
    .filter((t) => tripStatus(t) === "past")
    .sort((a, b) => b.start_date.localeCompare(a.start_date));

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.topbar, { paddingTop: insets.top + 14 }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Where next?</Text>
          <View style={styles.headerBtns}>
            <Pressable
              style={styles.addBtn}
              onPress={() => {
                if (!isOnline) {
                  Alert.alert("You're offline", "Connect to the internet to create a new trip.");
                  return;
                }
                router.push("/trip/new");
              }}
              accessibilityLabel="New trip"
            >
              <Icon name="add" size={25} color="#fff" />
            </Pressable>
            <HamburgerMenu
              items={[
                { icon: "archive", label: "Archived Trips", onPress: () => router.push("/archived") },
                { icon: "packing", label: "Packing Templates", onPress: () => router.push("/packingTemplates") },
                { icon: "signOut", label: "Sign Out", onPress: signOut, danger: true },
              ]}
              solid
            />
          </View>
        </View>

        <View style={styles.searchRow}>
          <Icon name="search" size={22} color={colors.inkSoft} />
          <TextInput
            style={styles.searchInput}
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Search trips, items, expenses…"
            placeholderTextColor={colors.inkSoft}
          />
          {searchInput.length > 0 && (
            <Pressable onPress={() => setSearchInput("")} hitSlop={8}>
              <View style={{ transform: [{ rotate: "45deg" }] }}>
                <Icon name="add" size={18} color={colors.inkSoft} strokeWidth={3.5} />
              </View>
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
                  <Pressable key={r.id} style={styles.searchCard} onPress={() => openResult(r)}>
                    <Text style={styles.searchTag}>{r.trip_name}</Text>
                    <Text style={styles.searchTitle}>{r.title}</Text>
                    {!!r.subtitle && <Text style={styles.searchSub}>{r.subtitle}</Text>}
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
            { label: "__hero__", items: currentTrip ? [currentTrip] : [] },
            { label: "Upcoming", items: upcoming },
            { label: "Past", items: previous },
          ]}
          keyExtractor={(s) => s.label}
          renderItem={({ item: section }) => {
            if (section.items.length === 0) return null;
            if (section.label === "__hero__") {
              const trip = section.items[0];
              return (
                <Pressable onPress={() => router.push(`/trip/${trip.id}`)}>
                  <ImageBackground
                    source={coverPhotoSource(trip.cover_photo_id)}
                    style={styles.hero}
                    imageStyle={{ borderRadius: radius.xl }}
                  >
                    <View style={styles.heroScrim} />
                    {heroExtra?.weatherTemp != null && heroExtra.weatherCode != null && (
                      <View style={styles.weatherBadge}>
                        <Icon name={weatherIconName(heroExtra.weatherCode)} size={22} color="#fff" />
                        <Text style={styles.weatherTemp}>{heroExtra.weatherTemp}°</Text>
                      </View>
                    )}
                    <Text style={styles.heroDest}>{trip.destinations[0] ?? trip.name}</Text>
                    {heroExtra?.nextItemTitle ? (
                      <>
                        <Text style={styles.comingUpLabel}>Coming up</Text>
                        <Text style={styles.comingUpTitle} numberOfLines={1}>{heroExtra.nextItemTitle}</Text>
                        {heroExtra.nextItemTime && <Text style={styles.comingUpMeta}>{heroExtra.nextItemTime}</Text>}
                      </>
                    ) : (
                      <Text style={styles.comingUpLabel}>Ongoing</Text>
                    )}
                  </ImageBackground>
                </Pressable>
              );
            }
            return (
              <View>
                <Text style={styles.sectionLabel}>{section.label}</Text>
                {section.items.map((trip) => (
                  <TripPhotoCard
                    key={trip.id}
                    trip={trip}
                    showCountdown={section.label === "Upcoming"}
                    onArchive={section.label === "Past" ? () => archiveTrip(trip) : undefined}
                  />
                ))}
              </View>
            );
          }}
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
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  headerBtns: { flexDirection: "row", gap: 8 },
  addBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.ink,
    alignItems: "center", justifyContent: "center",
  },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, marginTop: 12,
  },
  searchInput: { flex: 1, color: colors.ink, fontSize: 14, padding: 0 },
  sectionLabel: {
    color: colors.ink, fontFamily: fonts.display, fontSize: 18,
    marginTop: 14, marginBottom: 10,
  },
  empty: { textAlign: "center", color: colors.inkSoft, marginTop: 40 },

  hero: { height: 168, borderRadius: radius.xl, overflow: "hidden", padding: 14, justifyContent: "flex-end", marginBottom: 6 },
  heroScrim: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.xl,
    backgroundColor: "rgba(11,30,63,0.15)",
  },
  weatherBadge: {
    position: "absolute", top: 10, right: 12, width: 50, height: 58, borderRadius: 29,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.85)", backgroundColor: "rgba(11,30,63,0.35)",
    alignItems: "center", justifyContent: "center",
  },
  weatherTemp: { color: "#fff", fontFamily: fonts.monoBold, fontSize: 12 },
  heroDest: { color: "#fff", fontFamily: fonts.display, fontSize: 17, marginBottom: 4 },
  comingUpLabel: { color: colors.goldSoft, fontFamily: fonts.bodyBold, fontSize: 9, textTransform: "uppercase", letterSpacing: 1 },
  comingUpTitle: { color: "#fff", fontFamily: fonts.bodyBold, fontSize: 13, marginTop: 1 },
  comingUpMeta: { color: colors.goldSoft, fontFamily: fonts.mono, fontSize: 10, marginTop: 1 },

  tripCard: { borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.line, marginBottom: 10, backgroundColor: colors.paperRaised },
  tripCardTop: { height: 96, justifyContent: "flex-end" },
  tripCardScrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(11,30,63,0.25)" },
  tripCardInfo: { padding: 11 },
  tripCardName: { color: "#fff", fontFamily: fonts.display, fontSize: 15 },
  tripCardType: { color: "rgba(255,255,255,0.9)", fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 0.5, marginTop: 1 },
  tripCardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12 },
  tripCardDates: { color: colors.inkSoft, fontSize: 11 },
  chevron: { color: colors.inkSoft, fontSize: 16 },

  searchCard: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 16, marginBottom: 10,
  },
  searchTag: { color: colors.inkSoft, fontSize: 10, letterSpacing: 1, fontFamily: fonts.bodyBold },
  searchTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 18, marginTop: 4 },
  searchSub: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
});
