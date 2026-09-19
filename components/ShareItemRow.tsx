// One itinerary-item row for the public share page — used by both the Day
// detail screen (its main content) and the Overview screen (inside the
// Flights section, styled the same way an item row would look on its own
// day). Kept separate from the app's own item-row components since this one
// is deliberately read-only with no drag handle, edit affordance, or
// navigation on tap.
import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { fonts, radius, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import Icon from "@/components/icons/Icon";
import { normalizeTimeHHMM } from "@/lib/timeFormat";
import { mapIconForItem, itemTypeTag } from "@/lib/itemTypeMeta";
import FlightStatusCard from "@/components/FlightStatusCard";
import { PublicItem, STATUS_LABEL } from "@/lib/shareTypes";
import { FlightStatusRow } from "@/lib/flightStatus";

export default function ShareItemRow({ item, flightStatus }: { item: PublicItem; flightStatus?: FlightStatusRow }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  // Live flight status is never hidden behind the tap — only the address/
  // notes "description" the user asked to collapse.
  const hasDetails = !!item.address || !!item.notes;
  return (
    <Pressable
      style={styles.itemRow}
      onPress={() => hasDetails && setExpanded((e) => !e)}
      disabled={!hasDetails}
    >
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
          {hasDetails && (
            <Icon
              name="forward"
              size={13}
              color={colors.inkSoft}
              style={{ marginLeft: "auto", transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}
            />
          )}
        </View>
        <Text style={styles.itemTitle}>{item.title}</Text>
        {expanded && !!item.address && <Text style={styles.itemMeta}>{item.address}</Text>}
        {expanded && !!item.notes && <Text style={styles.itemMeta}>{item.notes}</Text>}
        {flightStatus && <FlightStatusCard row={flightStatus} loading={false} onRefresh={() => {}} compact />}
      </View>
    </Pressable>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
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
});
