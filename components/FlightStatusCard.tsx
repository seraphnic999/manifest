import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { colors, radius } from "@/lib/theme";
import Icon from "@/components/icons/Icon";
import { FlightStatusRow } from "@/lib/flightStatus";

interface Props {
  row: FlightStatusRow | null | undefined;
  loading: boolean;
  onRefresh: () => void;
  /** Opens the permanent status-change log for this flight. Shown as a
   * footer link on the card — omit to hide it (there's nothing to show a
   * log for before the item has ever been tracked). */
  onOpenLog?: () => void;
  /** Trip overview's per-flight rows are more cramped than the item detail
   * page's full-width card — trims the vertical padding a touch. */
  compact?: boolean;
}

/** The "live flight status" bubble — same shape on the item detail page and
 * under a tracked flight on the trip overview page, both reading the same
 * flight_status row so a refresh from either place shows up on both. */
export default function FlightStatusCard({ row, loading, onRefresh, onOpenLog, compact }: Props) {
  const status = row?.data;

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.header}>
        <Text style={styles.label}>Flight status</Text>
        <Pressable onPress={onRefresh} disabled={loading} hitSlop={8}>
          {loading ? <ActivityIndicator size="small" color={colors.lightBlue} /> : <Icon name="refresh" size={20} color={colors.blue} />}
        </Pressable>
      </View>

      {row?.last_error && !status ? (
        <Text style={styles.error}>{row.last_error}</Text>
      ) : status ? (
        <>
          <Text style={styles.value}>{status.status ?? "Unknown"}</Text>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Departure</Text>
            <Text style={styles.fieldValue}>
              {(status.departure.revised?.local ?? status.departure.scheduled.local) ?? "—"}
              {status.departure.gate ? ` · Gate ${status.departure.gate}` : ""}
              {status.departure.terminal ? ` · T${status.departure.terminal}` : ""}
            </Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Arrival</Text>
            <Text style={styles.fieldValue}>
              {(status.arrival.revised?.local ?? status.arrival.scheduled.local) ?? "—"}
              {status.arrival.gate ? ` · Gate ${status.arrival.gate}` : ""}
              {status.arrival.terminal ? ` · T${status.arrival.terminal}` : ""}
            </Text>
          </View>
          {row?.checked_at && (
            <Text style={styles.checked}>Last checked {new Date(row.checked_at).toLocaleTimeString()}</Text>
          )}
          {row?.last_error && <Text style={styles.error}>{row.last_error}</Text>}
        </>
      ) : (
        <Text style={styles.empty}>Tap refresh to check live status.</Text>
      )}

      {onOpenLog && row && (
        <Pressable style={styles.logLink} onPress={onOpenLog} hitSlop={8}>
          <Text style={styles.logLinkText}>View full history</Text>
          <Icon name="forward" size={14} color={colors.blue} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, marginTop: 12,
  },
  cardCompact: { padding: 10, marginTop: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: {
    color: colors.inkSoft, fontWeight: "700", fontSize: 11,
    textTransform: "uppercase", letterSpacing: 1,
  },
  value: { color: colors.lightBlue, fontWeight: "700", fontSize: 14, marginTop: 6, marginBottom: 4 },
  fieldRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  fieldLabel: { color: colors.inkSoft, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5 },
  fieldValue: { color: colors.ink, fontSize: 14, marginTop: 2 },
  checked: { color: colors.inkSoft, fontSize: 11, fontStyle: "italic", marginTop: 6 },
  error: { color: colors.coral, fontSize: 12, marginTop: 4 },
  empty: { color: colors.inkSoft, fontSize: 12, fontStyle: "italic", marginTop: 6 },
  logLink: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line,
  },
  logLinkText: { color: colors.blue, fontWeight: "700", fontSize: 12.5 },
});
