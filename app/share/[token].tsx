// Public, unauthenticated read-only trip view — see app/_layout.tsx's
// auth-redirect exemption for the "share" route segment, and
// supabase/functions/share-trip-data for what's fetched and what's
// deliberately excluded (companions, documents, expenses, packing/shopping,
// private items). No edit affordances anywhere on this screen; it only
// reads the payload the Edge Function hands it.
import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Image, ActivityIndicator, TextInput, ImageBackground } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { radius, fonts, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import Icon from "@/components/icons/Icon";
import { coverPhotoSource } from "@/lib/destinationPhotos";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";
import { normalizeTimeHHMM } from "@/lib/timeFormat";
import { dayCityLabel, TripCityRow } from "@/lib/cities";
import { buildDayColorMap, buildDateToDayId, NEUTRAL_DAY_COLOR, MapItem } from "@/lib/mapData";
import { mapIconForItem, itemTypeTag } from "@/lib/itemTypeMeta";
import WeatherCarousel from "@/components/WeatherCarousel";
import FlightStatusCard from "@/components/FlightStatusCard";
import TripMap from "@/components/TripMap";
import { Day, Trip, ItemType, ItemStatus, MapRoute } from "@/lib/types";
import { DestinationForecast } from "@/lib/weather";
import { FlightStatusRow } from "@/lib/flightStatus";
import { computeDurationMinutes, formatDuration } from "@/lib/duration";

const SHARE_ENDPOINT = "https://yvqptrjxbptloucyuubm.supabase.co/functions/v1/share-trip-data";

// Same shape as Item, minus the four fields the Edge Function strips before
// this ever leaves the server (confirmation_code, booking_source, and the
// app-owner's own reminder settings) — see STRIPPED_ITEM_FIELDS there.
interface PublicItem {
  id: string; day_id: string | null; trip_id: string; parent_item_id: string | null;
  type: ItemType; title: string; start_date: string | null; end_date: string | null;
  time_start: string | null; time_end: string | null; status: ItemStatus; is_stay_span: boolean;
  notes: string | null; address: string | null; phone: string | null; vendor: string | null;
  link: string | null; google_maps_link: string | null; sort_order: number;
  latitude: number | null; longitude: number | null; map_icon: string | null;
  custom_fields: Record<string, unknown>; keeper_id: string | null; is_private: boolean;
}

interface WeatherEntry { label: string; country: string | null; latitude: number; longitude: number; forecast: any }

interface SharePayload {
  trip: Trip;
  days: Day[];
  items: PublicItem[];
  trip_cities: TripCityRow[];
  routes: MapRoute[];
  weather: WeatherEntry[];
  flight_statuses: FlightStatusRow[];
}

const STATUS_LABEL: Record<ItemStatus, string> = { planned: "Planned", booked: "Booked", optional: "Optional" };

function transformForecasts(weather: WeatherEntry[]): DestinationForecast[] {
  return weather
    .filter((w) => w.forecast?.daily?.time)
    .map((w) => ({
      destination: w.label,
      days: w.forecast.daily.time.map((date: string, i: number) => ({
        date,
        weatherCode: w.forecast.daily.weathercode[i],
        tempMax: w.forecast.daily.temperature_2m_max[i],
        tempMin: w.forecast.daily.temperature_2m_min[i],
        precipProb: w.forecast.daily.precipitation_probability_max?.[i] ?? null,
      })),
    }));
}

function sessionPinKey(token: string) { return `manifest_share_pin_${token}`; }

function ItemRow({ item, flightStatus }: { item: PublicItem; flightStatus?: FlightStatusRow }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.itemRow}>
      <View style={styles.itemTimeCol}>
        <Text style={styles.itemTime}>{item.time_start ? normalizeTimeHHMM(item.time_start) : ""}</Text>
        {item.time_end && <Text style={styles.itemTimeEnd}>↓ {normalizeTimeHHMM(item.time_end)}</Text>}
      </View>
      <View style={styles.itemIconWrap}>
        <Icon name={mapIconForItem(item)} size={18} color={colors.blue} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.itemTagRow}>
          <Text style={styles.itemTag}>{itemTypeTag(item.type)}</Text>
          {item.status !== "booked" && <Text style={styles.itemStatusBadge}>{STATUS_LABEL[item.status]}</Text>}
        </View>
        <Text style={styles.itemTitle}>{item.title}</Text>
        {!!item.address && <Text style={styles.itemMeta}>{item.address}</Text>}
        {!!item.notes && <Text style={styles.itemMeta}>{item.notes}</Text>}
        {flightStatus && <FlightStatusCard row={flightStatus} loading={false} onRefresh={() => {}} compact />}
      </View>
    </View>
  );
}

export default function SharedTrip() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  async function load(pin?: string) {
    if (!token) return;
    setLoading(true);
    setPinError(false);
    try {
      const url = new URL(SHARE_ENDPOINT);
      url.searchParams.set("token", token);
      if (pin) url.searchParams.set("pin", pin);
      const res = await fetch(url.toString());
      const data = await res.json();
      if (data?.error) { setNotFound(true); setLoading(false); return; }
      if (data?.pin_required) {
        setPinRequired(true);
        if (pin) setPinError(true);
        setLoading(false);
        return;
      }
      setPinRequired(false);
      setPayload(data as SharePayload);
      if (pin) {
        try { window.sessionStorage?.setItem(sessionPinKey(token), pin); } catch { /* private browsing, etc. — just re-prompts next load */ }
      }
    } catch {
      setNotFound(true);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!token) return;
    let storedPin: string | undefined;
    try { storedPin = window.sessionStorage?.getItem(sessionPinKey(token)) ?? undefined; } catch { /* ignore */ }
    load(storedPin);
  }, [token]);

  if (loading && !payload) {
    return (
      <View style={[styles.center, { backgroundColor: colors.paper }]}>
        <ActivityIndicator color={colors.blue} size="large" />
      </View>
    );
  }

  if (notFound) {
    return (
      <View style={[styles.center, { backgroundColor: colors.paper, padding: 24 }]}>
        <Icon name="warning" size={32} color={colors.inkSoft} />
        <Text style={styles.notFoundTitle}>This link isn't available</Text>
        <Text style={styles.notFoundHint}>It may have been turned off or never existed. Ask whoever sent it for a new one.</Text>
      </View>
    );
  }

  if (pinRequired) {
    return (
      <View style={[styles.center, { backgroundColor: colors.paper, padding: 24 }]}>
        <Icon name="document" size={32} color={colors.blue} />
        <Text style={styles.notFoundTitle}>Enter the PIN to view this trip</Text>
        <TextInput
          style={styles.pinInput}
          value={pinInput}
          onChangeText={(t) => setPinInput(t.replace(/[^0-9]/g, ""))}
          placeholder="PIN"
          placeholderTextColor={colors.inkSoft}
          keyboardType="number-pad"
          maxLength={10}
          secureTextEntry
        />
        {pinError && <Text style={styles.pinError}>That PIN isn't right — try again.</Text>}
        <Pressable style={styles.pinSubmit} onPress={() => load(pinInput.trim())} disabled={pinInput.length < 4}>
          <Text style={styles.pinSubmitText}>View trip</Text>
        </Pressable>
      </View>
    );
  }

  if (!payload) return null;

  const { trip, days, items, trip_cities: tripCities, routes, weather, flight_statuses: flightStatuses } = payload;
  const flightStatusByItem = new Map(flightStatuses.map((r) => [r.item_id, r]));
  const stays = items.filter((i) => i.is_stay_span);
  // Rolled up into one dedicated section, same as the app's Trip Overview —
  // excluded from the day-by-day itinerary below (rather than shown in
  // both places on what is, here, a single continuous page) to avoid
  // showing the same flight card twice.
  const flights = items
    .filter((i) => i.type === "flight")
    .sort((a, b) => `${a.start_date ?? ""}${a.time_start ?? ""}`.localeCompare(`${b.start_date ?? ""}${b.time_start ?? ""}`));
  const dayColors = buildDayColorMap(days);
  const dateToDayId = buildDateToDayId(days);
  const neutral = NEUTRAL_DAY_COLOR;
  const mapItems: MapItem[] = items.filter((i): i is PublicItem & { latitude: number; longitude: number } => i.latitude != null && i.longitude != null) as MapItem[];
  const destinations = [...new Set(weather.map((w) => w.label))];
  const forecasts = transformForecasts(weather);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.paper }} contentContainerStyle={{ paddingBottom: 60 }}>
      <ImageBackground source={coverPhotoSource(trip.cover_photo_id)} style={styles.hero} imageStyle={{ resizeMode: "cover" }}>
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
                <View key={f.id} style={styles.stayCard}>
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
              <View key={s.id} style={styles.stayCard}>
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

        <Text style={styles.sectionLabel}>Itinerary</Text>
        {days.map((day) => {
          const dayItems = items.filter((i) => i.day_id === day.id && !i.is_stay_span && i.type !== "flight").sort((a, b) => a.sort_order - b.sort_order);
          if (dayItems.length === 0) return null;
          const label = day.date ? dayCityLabel(day, tripCities) : "Proposals";
          return (
            <View key={day.id} style={styles.daySection}>
              <View style={styles.dayHeaderRow}>
                <View style={[styles.dayColorDot, { backgroundColor: dayColors.get(day.id) ?? neutral }]} />
                <Text style={styles.dayHeader}>
                  {day.date ? formatDateDDMMYYYY(day.date) : "Proposals"}{label ? ` · ${label}` : ""}
                </Text>
              </View>
              {dayItems.map((item) => (
                <ItemRow key={item.id} item={item} flightStatus={flightStatusByItem.get(item.id)} />
              ))}
            </View>
          );
        })}

        {mapItems.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Map</Text>
            <View style={styles.mapWrap}>
              <TripMap
                items={mapItems}
                routes={routes}
                dayColors={dayColors}
                dateToDayId={dateToDayId}
                neutralColor={neutral}
                visibleDayIds={new Set(days.map((d) => d.id))}
                visibleTypes={new Set(items.map((i) => i.type))}
                tripFocus={trip.latitude != null && trip.longitude != null ? { latitude: trip.latitude, longitude: trip.longitude } : null}
                onItemPress={() => {}}
              />
            </View>
          </>
        )}

        <Text style={styles.footer}>Shared read-only via Manifest</Text>
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  notFoundTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 17, textAlign: "center", marginTop: 8 },
  notFoundHint: { color: colors.inkSoft, fontSize: 13, textAlign: "center", marginTop: 4, maxWidth: 320 },
  pinInput: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    padding: 14, fontSize: 20, color: colors.ink, textAlign: "center", width: 200, marginTop: 14, letterSpacing: 4,
  },
  pinError: { color: colors.coral, fontSize: 12.5, marginTop: 6 },
  pinSubmit: { backgroundColor: colors.ink, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 28, marginTop: 14 },
  pinSubmitText: { color: colors.paper, fontWeight: "700", fontSize: 14 },
  hero: { height: 220, justifyContent: "flex-end", padding: 20 },
  heroScrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(11,30,63,0.35)" },
  heroName: { color: "#fff", fontFamily: fonts.display, fontSize: 24, marginBottom: 4 },
  heroDates: { color: "rgba(255,255,255,0.9)", fontSize: 14 },
  body: { padding: 16 },
  sectionLabel: {
    color: colors.inkSoft, fontFamily: fonts.bodyBold, fontSize: 12, textTransform: "uppercase",
    letterSpacing: 1, marginTop: 22, marginBottom: 10,
  },
  stayCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  daySection: { marginBottom: 18 },
  dayHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  dayColorDot: { width: 10, height: 10, borderRadius: 5 },
  dayHeader: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14 },
  itemRow: {
    flexDirection: "row", gap: 10, backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  itemTimeCol: { width: 44 },
  itemTime: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 12 },
  itemTimeEnd: { color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 10, marginTop: 2 },
  itemIconWrap: { width: 28, alignItems: "center", paddingTop: 2 },
  itemTagRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  itemTag: { color: colors.blue, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  itemStatusBadge: {
    color: colors.inkSoft, fontSize: 9.5, fontWeight: "700", textTransform: "uppercase",
    backgroundColor: colors.line, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1,
  },
  itemTitle: { color: colors.ink, fontFamily: fonts.bodySemi, fontSize: 14.5 },
  itemMeta: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
  mapWrap: { height: 360, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.line },
  footer: { color: colors.inkSoft, fontSize: 11, textAlign: "center", marginTop: 30 },
});
