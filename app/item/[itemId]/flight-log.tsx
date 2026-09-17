import { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import SubpageHeader from "@/components/SubpageHeader";
import { colors, radius, fonts } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { useFlightStatusLog, FlightStatusLogEntry } from "@/lib/flightStatus";

interface FlightHeader { title: string; flightNumber: string | null }

async function fetchFlightHeader(itemId: string): Promise<FlightHeader | null> {
  const { data } = await supabase.from("items").select("title, custom_fields").eq("id", itemId).maybeSingle();
  if (!data) return null;
  return { title: data.title as string, flightNumber: (data.custom_fields as Record<string, unknown>)?.flight_number as string ?? null };
}

function LogEntryRow({ entry }: { entry: FlightStatusLogEntry }) {
  const status = entry.data;
  const when = new Date(entry.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  return (
    <View style={styles.entry}>
      <View style={styles.entryHeader}>
        <Text style={styles.status}>{entry.status ?? "Unknown"}</Text>
        <Text style={styles.when}>{when}</Text>
      </View>
      {entry.previous_status && (
        <Text style={styles.changedFrom}>Changed from {entry.previous_status}</Text>
      )}
      {status && (
        <>
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
        </>
      )}
    </View>
  );
}

export default function FlightLog() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const { entries, loading } = useFlightStatusLog(itemId);
  const [header, setHeader] = useState<FlightHeader | null>(null);

  useEffect(() => { if (itemId) fetchFlightHeader(itemId).then(setHeader); }, [itemId]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SubpageHeader title="Flight status log" />
      <View style={styles.subheader}>
        <Text style={styles.flightTitle}>{header?.title ?? ""}</Text>
        {header?.flightNumber && <Text style={styles.flightNumber}>{header.flightNumber}</Text>}
      </View>
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        data={entries}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <LogEntryRow entry={item} />}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              No status changes recorded yet. Entries appear here automatically once this flight enters its
              tracking window (4 hours before departure) and its status changes.
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  subheader: {
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: colors.paperRaised, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  flightTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 15 },
  flightNumber: { color: colors.inkSoft, fontSize: 12.5, marginTop: 2, fontFamily: fonts.mono },
  entry: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 14, marginBottom: 10,
  },
  entryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  status: { color: colors.lightBlue, fontFamily: fonts.bodyBold, fontSize: 16 },
  when: { color: colors.inkSoft, fontSize: 11.5 },
  changedFrom: { color: colors.inkSoft, fontSize: 12, fontStyle: "italic", marginTop: 2, marginBottom: 6 },
  fieldRow: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line, marginTop: 6 },
  fieldLabel: { color: colors.inkSoft, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5 },
  fieldValue: { color: colors.ink, fontSize: 14, marginTop: 2 },
  empty: { color: colors.inkSoft, fontSize: 13.5, fontStyle: "italic", textAlign: "center", marginTop: 24, lineHeight: 20 },
});
