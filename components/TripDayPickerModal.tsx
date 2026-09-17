import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, ScrollView, ActivityIndicator } from "react-native";
import { radius, fonts, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import { supabase } from "@/lib/supabase";
import { Day } from "@/lib/types";
import { fetchTripCities, dayCityLabel } from "@/lib/cities";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";

async function fetchTripDays(tripId: string, includeProposals: boolean): Promise<Day[]> {
  const { data, error } = await supabase.from("days").select("*").eq("trip_id", tripId).order("sort_order");
  if (error) throw error;
  const rows = (data ?? []) as Day[];
  // Proposals (date: null) isn't a real day to land a booked item on unless
  // the caller explicitly wants it offered (the item add/edit day picker
  // does; the Keeper "add to trip" flow doesn't).
  return includeProposals ? rows : rows.filter((d) => d.date !== null);
}

/** Day picker — used both for the Keeper "Add to trip" flow (real days
 * only, so that form's date can come pre-filled) and, with
 * `includeProposals`, as the mandatory day field on the item add/edit form
 * (where Proposals is a legitimate destination for an item with no fixed
 * date yet). */
export default function TripDayPickerModal({
  visible, onClose, tripId, onSelect, includeProposals = false, selectedDayId = null,
}: {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  onSelect: (day: Day) => void;
  includeProposals?: boolean;
  /** Highlights the currently-picked day, if any — purely visual. */
  selectedDayId?: string | null;
}) {
  const [days, setDays] = useState<Day[]>([]);
  const [cityLabels, setCityLabels] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    Promise.all([fetchTripDays(tripId, includeProposals), fetchTripCities(tripId)]).then(([rows, tripCities]) => {
      setDays(rows);
      const labels: Record<string, string | null> = {};
      for (const d of rows) labels[d.id] = d.date ? dayCityLabel(d, tripCities) : null;
      setCityLabels(labels);
      setLoading(false);
    });
  }, [visible, tripId, includeProposals]);

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
                const isProposals = d.date === null;
                const label = [cityLabels[d.id], d.theme].filter(Boolean).join(" · ");
                const selected = d.id === selectedDayId;
                return (
                  <Pressable
                    key={d.id}
                    style={[styles.row, isProposals && styles.rowProposals, selected && styles.rowSelected]}
                    onPress={() => onSelect(d)}
                  >
                    <Text style={[styles.rowDate, isProposals && styles.rowDateProposals]}>
                      {isProposals ? "Proposals" : formatDateDDMMYYYY(d.date!)}
                    </Text>
                    {isProposals ? (
                      <Text style={styles.rowTheme}>No fixed date yet</Text>
                    ) : label ? (
                      <Text style={styles.rowTheme}>{label}</Text>
                    ) : null}
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

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(11,30,63,0.4)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: colors.paperRaised, borderRadius: radius.lg, padding: 20, width: "100%", maxWidth: 420, alignSelf: "center" },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginBottom: 14, textAlign: "center" },
  empty: { color: colors.inkSoft, fontStyle: "italic", fontSize: 13, textAlign: "center", marginVertical: 20 },
  row: {
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  rowProposals: { backgroundColor: colors.goldSoft, borderColor: colors.gold, borderStyle: "dashed" },
  rowSelected: { borderColor: colors.blue, borderWidth: 2 },
  rowDate: { fontFamily: fonts.mono, color: colors.ink, fontSize: 14 },
  rowDateProposals: { fontFamily: fonts.bodySemi, color: colors.gold },
  rowTheme: { color: colors.blue, fontFamily: fonts.bodySemi, fontSize: 12.5, marginTop: 3 },
  cancelBtn: { alignItems: "center", padding: 12, marginTop: 4 },
  cancelText: { color: colors.inkSoft, fontWeight: "600", fontSize: 15 },
});
