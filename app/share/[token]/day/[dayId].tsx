// Public share — a single day's items. Unlike the Overview screen's rolled-
// up Flights section (which exists to summarize the whole trip at a
// glance), a flight due on this day is shown inline here too, same as the
// app's own day view — this is a different screen, so it's not the same
// duplication problem the single-page version had.
import { useMemo } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { fonts, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import Icon from "@/components/icons/Icon";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";
import { dayCityLabel } from "@/lib/cities";
import ShareItemRow from "@/components/ShareItemRow";
import { useSharePayload } from "../_layout";

export default function ShareDay() {
  const { token, dayId } = useLocalSearchParams<{ token: string; dayId: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { days, items, trip_cities: tripCities, flight_statuses: flightStatuses } = useSharePayload();

  const day = days.find((d) => d.id === dayId);
  const flightStatusByItem = new Map(flightStatuses.map((r) => [r.item_id, r]));
  const dayItems = items
    .filter((i) => i.day_id === dayId && !i.is_stay_span)
    .sort((a, b) => a.sort_order - b.sort_order);
  const label = day?.date ? dayCityLabel(day, tripCities) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace(`/share/${token}` as any))}
        >
          <Icon name="back" size={20} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{day?.date ? formatDateDDMMYYYY(day.date) : "Proposals"}</Text>
          {!!label && <Text style={styles.headerSub}>{label}</Text>}
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {dayItems.map((item) => (
          <ShareItemRow key={item.id} item={item} flightStatus={flightStatusByItem.get(item.id)} />
        ))}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 16,
    backgroundColor: colors.paperRaised, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 17 },
  headerSub: { color: colors.inkSoft, fontSize: 12.5, marginTop: 1 },
});
