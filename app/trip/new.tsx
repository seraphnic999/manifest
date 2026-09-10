import { useState, useEffect } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Modal,
} from "react-native";
import { Alert } from "@/lib/alert";
import { useRouter, Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { TripType } from "@/lib/types";
import { tzOffsetLabel, sortedByOffsetDesc, COMMON_TIMEZONES, COMMON_CURRENCIES } from "@/lib/timezone";
import { mergePackingItems, fetchTemplateItems, fetchTripPackingAsSource } from "@/lib/packing";
import { DateField } from "@/components/DateTimeFields";
import HomeButton from "@/components/HomeButton";
import CoverPhotoPicker from "@/components/CoverPhotoPicker";

type PackingSource = "empty" | "template" | "trip";

const TYPES: TripType[] = ["pleasure", "business", "mixed"];

interface CurrencyRow {
  code: string;
  rate: string; // kept as text while editing
}

export default function NewTrip() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [type, setType] = useState<TripType>("pleasure");
  const [destinations, setDestinations] = useState("");
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("Asia/Jerusalem");
  const [tzPickerOpen, setTzPickerOpen] = useState(false);
  const [customTz, setCustomTz] = useState(false);
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([]); // NIS is implicit, always added
  const [newCode, setNewCode] = useState("");
  const [newRate, setNewRate] = useState("");
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [customCurrencyInput, setCustomCurrencyInput] = useState("");
  const [saving, setSaving] = useState(false);

  const [packingSource, setPackingSource] = useState<PackingSource>("empty");
  const [packingSourceId, setPackingSourceId] = useState<string | null>(null);
  const [packingPickerOpen, setPackingPickerOpen] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [existingTrips, setExistingTrips] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    supabase.from("packing_templates").select("id, name").order("name").then(({ data }) => setTemplates(data ?? []));
    supabase.from("trips").select("id, name").is("deleted_at", null).order("start_date", { ascending: false }).then(({ data }) => setExistingTrips(data ?? []));
  }, []);

  function packingSourceLabel(): string {
    if (packingSource === "empty") return "Empty";
    const list = packingSource === "template" ? templates : existingTrips;
    return list.find((x) => x.id === packingSourceId)?.name ?? "Choose one…";
  }

  function addCurrency() {
    if (!newCode || !newRate) return;
    setCurrencies([...currencies, { code: newCode.toUpperCase(), rate: newRate }]);
    setNewCode("");
    setNewRate("");
  }

  function removeCurrency(code: string) {
    setCurrencies(currencies.filter((c) => c.code !== code));
  }

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
        cover_photo_id: coverPhotoId,
      })
      .select()
      .single();

    if (error || !trip) {
      setSaving(false);
      Alert.alert("Couldn't create trip", error?.message ?? "Unknown error");
      return;
    }

    // NIS is always the default currency, plus any extra currencies added here.
    const currencyRows = [
      { trip_id: trip.id, code: "NIS", rate_to_nis: 1, is_default: true },
      ...currencies.map((c) => ({
        trip_id: trip.id, code: c.code, rate_to_nis: parseFloat(c.rate) || 1, is_default: false,
      })),
    ];
    await supabase.from("trip_currencies").insert(currencyRows);

    // "Work" party is auto-added only for business/mixed trips.
    if (type === "business" || type === "mixed") {
      await supabase.from("trip_parties").insert({
        trip_id: trip.id, name: "Work", is_work: true,
      });
    }

    if (packingSource !== "empty" && packingSourceId) {
      const source = packingSource === "template"
        ? await fetchTemplateItems(packingSourceId)
        : await fetchTripPackingAsSource(packingSourceId);
      await mergePackingItems(trip.id, source);
    }

    setSaving(false);
    router.replace(`/trip/${trip.id}`);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Stack.Screen options={{
        title: "New Trip",
        headerRight: () => (
          <View style={{ marginRight: 14 }}>
            <HomeButton />
          </View>
        ),
      }} />

      <Text style={styles.label}>Trip name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Summer road trip" />

      <Text style={styles.label}>Cover photo</Text>
      <CoverPhotoPicker value={coverPhotoId} onChange={setCoverPhotoId} />

      <View style={styles.row}>
        <DateField label="Start date" value={startDate} onChange={setStartDate} />
        <View style={{ width: 12 }} />
        <DateField label="End date" value={endDate} onChange={setEndDate} />
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

      {/* --- Timezone --- */}
      <Text style={styles.label}>Default timezone</Text>
      {!customTz ? (
        <Pressable style={styles.input} onPress={() => setTzPickerOpen(true)}>
          <Text style={{ color: colors.ink }}>{timezone} <Text style={styles.offsetText}>({tzOffsetLabel(timezone)})</Text></Text>
        </Pressable>
      ) : (
        <TextInput style={styles.input} value={timezone} onChangeText={setTimezone} placeholder="e.g. Pacific/Auckland" />
      )}
      <Pressable onPress={() => setCustomTz(!customTz)}>
        <Text style={styles.linkText}>{customTz ? "Choose from list instead" : "Type a custom timezone instead"}</Text>
      </Pressable>
      <Text style={styles.hint}>New items inherit this; individual items can override it (e.g. the airport taxi in local time).</Text>

      <Modal visible={tzPickerOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setTzPickerOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <ScrollView style={{ maxHeight: 420 }}>
              {sortedByOffsetDesc(COMMON_TIMEZONES).map((tz) => (
                <Pressable key={tz} style={styles.modalRow} onPress={() => { setTimezone(tz); setTzPickerOpen(false); }}>
                  <Text style={styles.modalRowText}>{tz}</Text>
                  <Text style={styles.offsetText}>{tzOffsetLabel(tz)}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable onPress={() => { setTzPickerOpen(false); setCustomTz(true); }}>
              <Text style={styles.linkText}>Not listed? Type a custom timezone instead</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* --- Currencies --- */}
      <Text style={styles.label}>Currencies</Text>
      <View style={styles.currencyRow}>
        <Text style={styles.currencyCode}>NIS</Text>
        <Text style={styles.currencyRate}>1.000 (default)</Text>
      </View>
      {currencies.map((c) => (
        <View key={c.code} style={styles.currencyRow}>
          <Text style={styles.currencyCode}>{c.code}</Text>
          <Text style={styles.currencyRate}>{c.rate} -&gt; NIS</Text>
          <Pressable onPress={() => removeCurrency(c.code)}>
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
      ))}
      <Text style={styles.hint}>Pick a currency, set its rate to NIS, then add it.</Text>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Pressable style={styles.input} onPress={() => setCurrencyPickerOpen(true)}>
            <Text style={{ color: newCode ? colors.ink : colors.inkSoft }}>{newCode || "Choose currency"}</Text>
          </Pressable>
        </View>
        <View style={{ width: 8 }} />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={newRate}
          onChangeText={setNewRate}
          placeholder="Rate to NIS (e.g. 4.05)"
          placeholderTextColor={colors.inkSoft}
          keyboardType="decimal-pad"
        />
        <View style={{ width: 8 }} />
        <Pressable style={styles.addCurrencyButton} onPress={addCurrency}>
          <Text style={styles.buttonText}>Add</Text>
        </Pressable>
      </View>

      <Modal visible={currencyPickerOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setCurrencyPickerOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <ScrollView style={{ maxHeight: 300 }}>
              {COMMON_CURRENCIES.filter((c) => !currencies.some((r) => r.code === c)).map((c) => (
                <Pressable key={c} style={styles.modalRow} onPress={() => { setNewCode(c); setCurrencyPickerOpen(false); }}>
                  <Text style={styles.modalRowText}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.currencyCustomRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={customCurrencyInput}
                onChangeText={(t) => setCustomCurrencyInput(t.toUpperCase())}
                placeholder="Other code (e.g. AED)"
                placeholderTextColor={colors.inkSoft}
                autoCapitalize="characters"
                maxLength={3}
              />
              <View style={{ width: 8 }} />
              <Pressable
                style={styles.addCurrencyButton}
                onPress={() => { if (customCurrencyInput) { setNewCode(customCurrencyInput); setCustomCurrencyInput(""); setCurrencyPickerOpen(false); } }}
              >
                <Text style={styles.buttonText}>Use</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* --- Packing list --- */}
      <Text style={styles.label}>Packing list</Text>
      <View style={styles.typeRow}>
        {(["empty", "template", "trip"] as PackingSource[]).map((s) => (
          <Pressable
            key={s}
            style={[styles.typeChip, packingSource === s && styles.typeChipActive]}
            onPress={() => { setPackingSource(s); setPackingSourceId(null); if (s !== "empty") setPackingPickerOpen(true); }}
          >
            <Text style={[styles.typeChipText, packingSource === s && styles.typeChipTextActive]}>
              {s === "empty" ? "Empty" : s === "template" ? "From template" : "Copy from trip"}
            </Text>
          </Pressable>
        ))}
      </View>
      {packingSource !== "empty" && (
        <Pressable style={styles.input} onPress={() => setPackingPickerOpen(true)}>
          <Text style={{ color: packingSourceId ? colors.ink : colors.inkSoft }}>{packingSourceLabel()}</Text>
        </Pressable>
      )}

      <Modal visible={packingPickerOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setPackingPickerOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <ScrollView style={{ maxHeight: 360 }}>
              {(packingSource === "template" ? templates : existingTrips).map((x) => (
                <Pressable key={x.id} style={styles.modalRow} onPress={() => { setPackingSourceId(x.id); setPackingPickerOpen(false); }}>
                  <Text style={styles.modalRowText}>{x.name}</Text>
                </Pressable>
              ))}
              {(packingSource === "template" ? templates : existingTrips).length === 0 && (
                <Text style={styles.hint}>
                  {packingSource === "template" ? "No templates yet." : "No other trips yet."}
                </Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Pressable style={styles.button} onPress={save} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? "Creating..." : "Create trip"}</Text>
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
  row: { flexDirection: "row", alignItems: "center" },
  typeRow: { flexDirection: "row", gap: 8 },
  typeChip: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paperRaised,
  },
  typeChipActive: { backgroundColor: colors.amber, borderColor: colors.amber },
  typeChipText: { color: colors.inkSoft, fontWeight: "600", fontSize: 13 },
  typeChipTextActive: { color: "#fff" },
  hint: { color: colors.inkSoft, fontSize: 11, marginTop: 6, fontStyle: "italic" },
  linkText: { color: colors.teal, fontSize: 12, fontWeight: "600", marginTop: 8 },
  button: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 28 },
  buttonText: { color: colors.paper, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.4)", justifyContent: "center", padding: 30 },
  modalCard: { backgroundColor: colors.paperRaised, borderRadius: radius.lg, padding: 8, width: "100%", maxWidth: 420, alignSelf: "center" },
  modalRow: {
    padding: 12, borderBottomWidth: 1, borderBottomColor: colors.line,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  modalRowText: { color: colors.ink, fontSize: 15 },
  offsetText: { color: colors.inkSoft, fontSize: 12, fontFamily: "IBMPlexMono_500Medium" },
  currencyChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  currencyChip: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paperRaised,
  },
  currencyChipText: { color: colors.ink, fontWeight: "600", fontSize: 12 },
  currencyRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 10, marginBottom: 6,
  },
  currencyCode: { fontFamily: "IBMPlexMono_500Medium", fontWeight: "700", color: colors.ink, width: 44 },
  currencyRate: { color: colors.inkSoft, fontSize: 13, flex: 1 },
  removeText: { color: colors.coral, fontSize: 12, fontWeight: "600" },
  addCurrencyButton: { backgroundColor: colors.teal, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14 },
  currencyCustomRow: { flexDirection: "row", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
});
