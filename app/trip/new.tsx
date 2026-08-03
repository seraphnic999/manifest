import { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { TripType } from "@/lib/types";

const TYPES: TripType[] = ["pleasure", "business", "mixed"];

export default function NewTrip() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(""); // YYYY-MM-DD
  const [endDate, setEndDate] = useState("");
  const [type, setType] = useState<TripType>("pleasure");
  const [destinations, setDestinations] = useState(""); // comma-separated
  const [timezone, setTimezone] = useState("Asia/Jerusalem");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name || !startDate || !endDate) {
      Alert.alert("Missing info", "Name, start date, and end date are required.");
      return;
    }
    setSaving(true);

    const { data: trip, error } = await supabase
      .from("trips")
      .insert({
        name,
        start_date: startDate,
        end_date: endDate,
        type,
        destinations: destinations.split(",").map((d) => d.trim()).filter(Boolean),
        default_timezone: timezone,
      })
      .select()
      .single();

    if (error || !trip) {
      setSaving(false);
      Alert.alert("Couldn't create trip", error?.message ?? "Unknown error");
      return;
    }

    // App-level seeding (not enforced in SQL — see schema.sql notes):
    // 1. NIS is always the default currency.
    await supabase.from("trip_currencies").insert({
      trip_id: trip.id, code: "NIS", rate_to_nis: 1, is_default: true,
    });

    // 2. "Work" party is auto-added only for business/mixed trips.
    if (type === "business" || type === "mixed") {
      await supabase.from("trip_parties").insert({
        trip_id: trip.id, name: "Work", is_work: true,
      });
    }

    setSaving(false);
    router.replace(`/trip/${trip.id}`);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Stack.Screen options={{ title: "New Trip" }} />

      <Text style={styles.label}>Trip name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Barcelona & Cruise" />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Start date</Text>
          <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="2026-08-05" />
        </View>
        <View style={{ width: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>End date</Text>
          <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="2026-08-16" />
        </View>
      </View>

      <Text style={styles.label}>Type</Text>
      <View style={styles.typeRow}>
        {TYPES.map((t) => (
          <Pressable
            key={t}
            style={[styles.typeChip, type === t && styles.typeChipActive]}
            onPress={() => setType(t)}
          >
            <Text style={[styles.typeChipText, type === t && styles.typeChipTextActive]}>
              {t[0].toUpperCase() + t.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
      {(type === "business" || type === "mixed") && (
        <Text style={styles.hint}>A "Work" party will be added automatically for expense tracking.</Text>
      )}

      <Text style={styles.label}>Destinations (comma-separated)</Text>
      <TextInput style={styles.input} value={destinations} onChangeText={setDestinations} placeholder="Barcelona, Palma, Rome, Naples" />

      <Text style={styles.label}>Default timezone (IANA name)</Text>
      <TextInput style={styles.input} value={timezone} onChangeText={setTimezone} placeholder="Asia/Jerusalem" />
      <Text style={styles.hint}>New items inherit this; individual items can override it (e.g. the airport taxi in local time).</Text>

      <Pressable style={styles.button} onPress={save} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? "Creating…" : "Create trip"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  label: { color: colors.inkSoft, fontSize: 12, fontWeight: "600", marginTop: 16, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
  },
  row: { flexDirection: "row" },
  typeRow: { flexDirection: "row", gap: 8 },
  typeChip: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paperRaised,
  },
  typeChipActive: { backgroundColor: colors.amber, borderColor: colors.amber },
  typeChipText: { color: colors.inkSoft, fontWeight: "600", fontSize: 13 },
  typeChipTextActive: { color: "#fff" },
  hint: { color: colors.inkSoft, fontSize: 11, marginTop: 6, fontStyle: "italic" },
  button: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 28 },
  buttonText: { color: colors.paper, fontWeight: "700" },
});
