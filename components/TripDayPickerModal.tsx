import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, ScrollView, ActivityIndicator } from "react-native";
import { colors, radius, fonts } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { Day } from "@/lib/types";
import { fetchTripCities, dayCityLabel } from "@/lib/cities";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";

async function fetchTripDays(tripId: string): Promise<Day[]> {
  const { data, error } = await supabase.from("days").select("*").eq("trip_id", tripId).order("sort_order");
  if (error) throw error;
  // Proposals (date: null) isn't a real day to land a booked item on.
  return ((data ?? []) as Day[]).filter((d) => d.date !== null);
}

/** Day picker for the Keeper "Add to trip" flow — shown after a trip is
 * picked, before landing on the new-item form, so that form's date can
 * come pre-filled rather than left for the user to set by hand. */
export default function TripDayPickerModal({
  visible, onClose, tripId, onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  onSelect: (day: Day) => void;
}) {
  const [days, setDays] = useState<Day[]>([]);
  const [cityLabels, setCityLabels] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    Promise.all([fetchTripDays(tripId), fetchTripCities(tripId)]).then(([rows, tripCities]) => {
      setDays(rows);
      const labels: Record<string, string | null> = {};
      for (const d of rows) labels[d.id] = dayCityLabel(d, tripCities);
      setCityLabels(labels);
      setLoading(false);
    });
  }, [visible, tripId]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Pick a day</Text>
          {loading ? (
            <ActivityIndicator color={colors.blue} style={{ marginVertical: 24 }} />
          ) : (
            <ScrollView style={{ maxHeight: 420 }}>
              {days.length === 0 && <Text style={styles.empty}>This trip has no days yet.</Text>}
              {days.map((d) => {
                const label = [cityLabels[d.id], d.theme].filter(Boolean).join(" · ");
                return (
                  <Pressable key={d.id} style={styles.row} onPress={() => onSelect(d)}>
                    <Text style={styles.rowDate}>{formatDateDDMMYYYY(d.date!)}</Text>
                    {label ? <Text style={styles.rowTheme}>{label}</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(11,30,63,0.4)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: colors.paperRaised, borderRadius: radius.lg, padding: 20, width: "100%", maxWidth: 420, alignSelf: "center" },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginBottom: 14, textAlign: "center" },
  empty: { color: colors.inkSoft, fontStyle: "italic", fontSize: 13, textAlign: "center", marginVertical: 20 },
  row: {
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  rowDate: { fontFamily: fonts.mono, color: colors.ink, fontSize: 14 },
  rowTheme: { color: colors.blue, fontFamily: fonts.bodySemi, fontSize: 12.5, marginTop: 3 },
  cancelBtn: { alignItems: "center", padding: 12, marginTop: 4 },
  cancelText: { color: colors.inkSoft, fontWeight: "600", fontSize: 15 },
});
