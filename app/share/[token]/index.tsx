// Public share — Overview: hero, weather, flights, lodging, then a list of
// days to drill into (each day's items live on their own screen now,
// day/[dayId].tsx — see that file for why flights render there too despite
// already having their own section here; this mirrors the app's own split
// between Trip Overview's rolled-up Flights section and a day's full list).
import { useMemo } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ImageBackground } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { radius, fonts, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import Icon from "@/components/icons/Icon";
import { coverPhotoSource } from "@/lib/destinationPhotos";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";
import { normalizeTimeHHMM } from "@/lib/timeFormat";
import { dayCityLabel } from "@/lib/cities";
import { buildDayColorMap, NEUTRAL_DAY_COLOR } from "@/lib/mapData";
import WeatherCarousel from "@/components/WeatherCarousel";
import FlightStatusCard from "@/components/FlightStatusCard";
import ShareTabBar from "@/components/ShareTabBar";
import { computeDurationMinutes, formatDuration } from "@/lib/duration";
import { transformForecasts } from "@/lib/shareTypes";
import { useSharePayload } from "./_layout";

export default function ShareOverview() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { trip, days, items, trip_cities: tripCities, weather, flight_statuses: flightStatuses } = useSharePayload();

  const flightStatusByItem = new Map(flightStatuses.map((r) => [r.item_id, r]));
  const stays = items.filter((i) => i.is_stay_span);
  // Rolled up here, same as the app's Trip Overview — day/[dayId].tsx still
  // shows a flight inline on its own day too, same as the app's day view.
  const flights = items
    .filter((i) => i.type === "flight")
    .sort((a, b) => `${a.start_date ?? ""}${a.time_start ?? ""}`.localeCompare(`${b.start_date ?? ""}${b.time_start ?? ""}`));
  const dayColors = buildDayColorMap(days);
  const neutral = NEUTRAL_DAY_COLOR;
  const destinations = [...new Set(weather.map((w) => w.label))];
  const forecasts = transformForecasts(weather);

  const dayRows = days
    .map((day) => ({
      day,
      count: items.filter((i) => i.day_id === day.id && !i.is_stay_span).length,
      label: day.date ? dayCityLabel(day, tripCities) : null,
    }))
    .filter((r) => r.count > 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        <ImageBackground source={coverPhotoSource(trip.cover_photo_id)} style={styles.hero}>
          <View style={styles.heroScrim} />
          <Text style={styles.heroName}>{trip.name}</Text>
          <Text style={styles.heroDates}>{formatDateDDMMYYYY(trip.start_date)} – {formatDateDDMMYYYY(trip.end_date)}</Text>
        </ImageBackground>

        <View style={styles.body}>
          <WeatherCarousel tripId={trip.id} destinations={destinations} forecasts={forecasts} />

          {flights.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Flights</Text>
              {flights.map((f) => {
                const flightNumber = (f.custom_fields as any)?.flight_number as string | undefined;
                const durationMinutes = computeDurationMinutes(f.start_date, f.time_start, f.end_date, f.time_end);
                const durationText = durationMinutes !== null && durationMinutes >= 0 ? formatDuration(durationMinutes) : null;
                const status = flightStatusByItem.get(f.id);
                return (
                  <View key={f.id} style={styles.card}>
                    <Icon name="flight" size={18} color={colors.blue} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.itemTag}>{flightNumber ?? "FLIGHT"}</Text>
                      <Text style={styles.itemTitle}>{f.title}</Text>
                      <Text style={styles.itemMeta}>
                        {[normalizeTimeHHMM(f.time_start), formatDateDDMMYYYY(f.start_date), durationText].filter(Boolean).join(" · ")}
                      </Text>
                      {status && <FlightStatusCard row={status} loading={false} onRefresh={() => {}} compact />}
                    </View>
                  </View>
                );
              })}
            </>
          )}

          {stays.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Lodging</Text>
              {stays.map((s) => (
                <View key={s.id} style={styles.card}>
                  <Icon name="lodging" size={18} color={colors.blue} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.itemTitle}>{s.title}</Text>
                    <Text style={styles.itemMeta}>
                      {formatDateDDMMYYYY(s.start_date ?? "")} – {formatDateDDMMYYYY(s.end_date ?? "")}
                    </Text>
                    {!!s.address && <Text style={styles.itemMeta}>{s.address}</Text>}
                  </View>
                </View>
              ))}
            </>
          )}

          <Text style={styles.sectionLabel}>Days</Text>
          {dayRows.map(({ day, count, label }) => (
            <Pressable key={day.id} style={styles.dayCard} onPress={() => router.push(`/share/${token}/day/${day.id}` as any)}>
              <View style={[styles.dayColorDot, { backgroundColor: dayColors.get(day.id) ?? neutral }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.dayCardTitle}>
                  {day.date ? formatDateDDMMYYYY(day.date) : "Proposals"}{label ? ` · ${label}` : ""}
                </Text>
                <Text style={styles.dayCardMeta}>{count} {count === 1 ? "item" : "items"}</Text>
              </View>
              <Icon name="forward" size={18} color={colors.inkSoft} />
            </Pressable>
          ))}

          <Text style={styles.footer}>Shared read-only via Manifest</Text>
        </View>
      </ScrollView>
      <ShareTabBar token={token} active="overview" />
    </View>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  hero: { height: 220, justifyContent: "flex-end", padding: 20 },
  heroScrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(11,30,63,0.35)" },
  heroName: { color: "#fff", fontFamily: fonts.display, fontSize: 24, marginBottom: 4 },
  heroDates: { color: "rgba(255,255,255,0.9)", fontSize: 14 },
  body: { padding: 16 },
  sectionLabel: {
    color: colors.inkSoft, fontFamily: fonts.bodyBold, fontSize: 12, textTransform: "uppercase",
    letterSpacing: 1, marginTop: 22, marginBottom: 10,
  },
  card: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  itemTag: { color: colors.blue, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  itemTitle: { color: colors.ink, fontFamily: fonts.bodySemi, fontSize: 14.5 },
  itemMeta: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
  dayCard: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 14, marginBottom: 8,
  },
  dayColorDot: { width: 12, height: 12, borderRadius: 6 },
  dayCardTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14.5 },
  dayCardMeta: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
  footer: { color: colors.inkSoft, fontSize: 11, textAlign: "center", marginTop: 30 },
});
