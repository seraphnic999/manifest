import { useEffect, useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Modal,
} from "react-native";
import { Alert } from "@/lib/alert";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { Trip, TripType, TripCurrency } from "@/lib/types";
import { tzOffsetLabel, sortedByOffsetDesc, COMMON_TIMEZONES, COMMON_CURRENCIES } from "@/lib/timezone";
import { fetchLiveRateToNis } from "@/lib/currencyRates";
import { DateField } from "@/components/DateTimeFields";
import HomeButton from "@/components/HomeButton";
import CoverPhotoPicker from "@/components/CoverPhotoPicker";
import SubpageHeader from "@/components/SubpageHeader";
import NumberStepper from "@/components/NumberStepper";

const TYPES: TripType[] = ["pleasure", "business", "mixed"];

// Parties (Work, Mom, etc.) aren't editable here — existing allocations
// reference them, so adding/removing needs its own careful design, unlike
// currencies below where "in use" is a simple, checkable question.
export default function EditTrip() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [type, setType] = useState<TripType>("pleasure");
  const [origType, setOrigType] = useState<TripType>("pleasure");
  const [destinations, setDestinations] = useState("");
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("Asia/Jerusalem");
  const [tzPickerOpen, setTzPickerOpen] = useState(false);
  const [customTz, setCustomTz] = useState(false);
  const [budgetAmount, setBudgetAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const [currencies, setCurrencies] = useState<TripCurrency[]>([]);
  const [rateEdits, setRateEdits] = useState<Record<string, string>>({});
  const [newCode, setNewCode] = useState("");
  const [newRate, setNewRate] = useState("");
  const [lookingUpRate, setLookingUpRate] = useState(false);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [customCurrencyInput, setCustomCurrencyInput] = useState("");

  async function lookUpNewRate() {
    if (!newCode) return;
    setLookingUpRate(true);
    const rate = await fetchLiveRateToNis(newCode);
    setLookingUpRate(false);
    if (rate === null) {
      Alert.alert("Couldn't look up rate", `No live rate found for ${newCode}. Enter it manually.`);
      return;
    }
    setNewRate(rate.toFixed(4));
  }

  function loadCurrencies() {
    supabase.from("trip_currencies").select("*").eq("trip_id", tripId)
      .order("is_default", { ascending: false }).order("code")
      .then(({ data }) => data && setCurrencies(data as TripCurrency[]));
  }

  useEffect(() => {
    supabase.from("trips").select("*").eq("id", tripId).single().then(({ data }) => {
      if (!data) return;
      const trip = data as Trip;
      setName(trip.name);
      setStartDate(trip.start_date);
      setEndDate(trip.end_date);
      setType(trip.type);
      setOrigType(trip.type);
      setDestinations(trip.destinations.join(", "));
      setCoverPhotoId(trip.cover_photo_id);
      setTimezone(trip.default_timezone);
      setCustomTz(!COMMON_TIMEZONES.includes(trip.default_timezone));
      setBudgetAmount(trip.budget_amount != null ? String(trip.budget_amount) : "");
      setLoaded(true);
    });
    loadCurrencies();
  }, [tripId]);

  async function addCurrency() {
    const code = newCode.toUpperCase();
    const rate = parseFloat(newRate);
    if (!code || !rate || rate <= 0) {
      Alert.alert("Missing info", "Choose a currency and enter a valid rate to NIS.");
      return;
    }
    const { error } = await supabase.from("trip_currencies").insert({
      trip_id: tripId, code, rate_to_nis: rate, is_default: false,
    });
    if (error) {
      Alert.alert("Couldn't add currency", error.message);
      return;
    }
    setNewCode("");
    setNewRate("");
    loadCurrencies();
  }

  async function removeCurrency(currency: TripCurrency) {
    const { count } = await supabase
      .from("expenses").select("id", { count: "exact", head: true })
      .eq("trip_id", tripId).eq("currency_code", currency.code);

    if ((count ?? 0) > 0) {
      Alert.alert(
        "Currency in use",
        `${count} expense${count === 1 ? "" : "s"} use${count === 1 ? "s" : ""} ${currency.code} — remove or change those first.`
      );
      return;
    }

    Alert.alert("Remove currency", `Remove ${currency.code} from this trip?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          await supabase.from("trip_currencies").delete().eq("id", currency.id);
          loadCurrencies();
        },
      },
    ]);
  }

  function archiveTrip() {
    Alert.alert(
      "Archive trip",
      `Archive "${name}"? It'll disappear from your trip list but nothing is deleted — restore it anytime from Archived Trips.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          onPress: async () => {
            const { error } = await supabase.from("trips").update({ deleted_at: new Date().toISOString() }).eq("id", tripId);
            if (error) {
              Alert.alert("Couldn't archive trip", error.message);
              return;
            }
            if (router.canDismiss()) {
              router.dismissAll();
            } else {
              router.replace("/");
            }
          },
        },
      ]
    );
  }

  async function save() {
    if (!name || !startDate || !endDate) {
      Alert.alert("Missing info", "Name, start date, and end date are required.");
      return;
    }

    // Validate any pending currency-rate edits before saving anything.
    const rateUpdates: { id: string; rate: number }[] = [];
    for (const c of currencies) {
      if (c.is_default) continue;
      const raw = rateEdits[c.id];
      if (raw === undefined) continue;
      const rate = parseFloat(raw);
      if (!rate || rate <= 0) {
        Alert.alert("Invalid rate", `Enter a valid rate to NIS for ${c.code}.`);
        return;
      }
      if (rate !== c.rate_to_nis) rateUpdates.push({ id: c.id, rate });
    }

    setSaving(true);

    const { error } = await supabase.from("trips").update({
      name,
      start_date: startDate,
      end_date: endDate,
      type,
      destinations: destinations.split(",").map((d) => d.trim()).filter(Boolean),
      default_timezone: timezone,
      budget_amount: budgetAmount ? parseFloat(budgetAmount) || null : null,
      cover_photo_id: coverPhotoId,
    }).eq("id", tripId);

    if (error) {
      setSaving(false);
      Alert.alert("Couldn't save", error.message);
      return;
    }

    for (const u of rateUpdates) {
      await supabase.from("trip_currencies").update({ rate_to_nis: u.rate }).eq("id", u.id);
    }

    // Newly business/mixed and no "Work" party yet — add one, same as at
    // creation time. Downgrading away from business doesn't remove it:
    // existing allocations may already reference it.
    if ((type === "business" || type === "mixed") && origType === "pleasure") {
      const { data: existing } = await supabase
        .from("trip_parties").select("id").eq("trip_id", tripId).eq("is_work", true).maybeSingle();
      if (!existing) {
        await supabase.from("trip_parties").insert({ trip_id: tripId, name: "Work", is_work: true });
      }
    }

    setSaving(false);
    router.back();
  }

  if (!loaded) return null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SubpageHeader title="Edit trip" right={<HomeButton />} />
      <ScrollView contentContainerStyle={{ padding: 20 }}>

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
      {(type === "business" || type === "mixed") && origType === "pleasure" && (
        <Text style={styles.hint}>A "Work" party will be added automatically for expense tracking.</Text>
      )}

      <Text style={styles.label}>Destinations (comma-separated)</Text>
      <TextInput style={styles.input} value={destinations} onChangeText={setDestinations} placeholder="Barcelona, Palma, Rome, Naples" />

      <Text style={styles.label}>Planned budget (NIS, optional)</Text>
      <NumberStepper value={budgetAmount} onChange={setBudgetAmount} step={100} placeholder="e.g. 8000" />
      <Text style={styles.hint}>Shows a spend-progress bar on the Money screen. Leave blank to hide it.</Text>

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
      {currencies.map((c) => (
        <View key={c.id} style={styles.currencyRow}>
          <Text style={styles.currencyCode}>{c.code}</Text>
          {c.is_default ? (
            <Text style={styles.currencyRate}>1.000 (default)</Text>
          ) : (
            <>
              <TextInput
                style={[styles.input, styles.currencyRateInput]}
                value={rateEdits[c.id] ?? String(c.rate_to_nis)}
                onChangeText={(v) => setRateEdits((prev) => ({ ...prev, [c.id]: v }))}
                keyboardType="decimal-pad"
              />
              <Pressable onPress={async () => {
                const rate = await fetchLiveRateToNis(c.code);
                if (rate === null) { Alert.alert("Couldn't look up rate", `No live rate found for ${c.code}.`); return; }
                setRateEdits((prev) => ({ ...prev, [c.id]: rate.toFixed(4) }));
              }}>
                <Text style={styles.linkText}>Look up</Text>
              </Pressable>
              <Pressable onPress={() => removeCurrency(c)}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </>
          )}
        </View>
      ))}
      <Text style={styles.hint}>
        Rate changes save with the button below. A currency can only be removed if no expenses use it yet.
        Parties (Work, Mom, etc.) aren't editable here.
      </Text>
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
      <Pressable onPress={lookUpNewRate} disabled={!newCode || lookingUpRate}>
        <Text style={styles.linkText}>{lookingUpRate ? "Looking up…" : "Look up current rate"}</Text>
      </Pressable>

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

      <Pressable style={styles.button} onPress={save} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? "Saving…" : "Save changes"}</Text>
      </Pressable>

      <Pressable style={styles.duplicateButton} onPress={() => router.push(`/trip/${tripId}/duplicate`)}>
        <Text style={styles.duplicateButtonText}>Duplicate trip</Text>
      </Pressable>

      <Pressable style={styles.deleteButton} onPress={archiveTrip}>
        <Text style={styles.deleteButtonText}>Archive trip</Text>
      </Pressable>
      <Text style={[styles.hint, { marginBottom: 20 }]}>Archived trips can be restored, or permanently deleted, from Archived Trips on the home screen.</Text>
      </ScrollView>
    </View>
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
  typeChipActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  typeChipText: { color: colors.inkSoft, fontWeight: "600", fontSize: 13 },
  typeChipTextActive: { color: "#fff" },
  hint: { color: colors.inkSoft, fontSize: 11, marginTop: 6, fontStyle: "italic" },
  linkText: { color: colors.lightBlue, fontSize: 12, fontWeight: "600", marginTop: 8 },
  button: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 28 },
  buttonText: { color: colors.paper, fontWeight: "700" },
  duplicateButton: {
    borderWidth: 1, borderColor: colors.lightBlue, borderRadius: radius.md,
    padding: 14, alignItems: "center", marginTop: 12,
  },
  duplicateButtonText: { color: colors.lightBlue, fontWeight: "700" },
  deleteButton: {
    borderWidth: 1, borderColor: colors.amber, borderRadius: radius.md,
    padding: 14, alignItems: "center", marginTop: 12,
  },
  deleteButtonText: { color: colors.amber, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.4)", justifyContent: "center", padding: 30 },
  modalCard: { backgroundColor: colors.paperRaised, borderRadius: radius.lg, padding: 8, width: "100%", maxWidth: 420, alignSelf: "center" },
  modalRow: {
    padding: 12, borderBottomWidth: 1, borderBottomColor: colors.line,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  modalRowText: { color: colors.ink, fontSize: 15 },
  offsetText: { color: colors.inkSoft, fontSize: 12, fontFamily: "JetBrainsMono_600SemiBold" },
  currencyRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 10, marginBottom: 6,
  },
  currencyCode: { fontFamily: "JetBrainsMono_600SemiBold", fontWeight: "700", color: colors.ink, width: 44 },
  currencyRate: { color: colors.inkSoft, fontSize: 13, flex: 1 },
  currencyRateInput: { flex: 1, padding: 8, fontSize: 13 },
  removeText: { color: colors.coral, fontSize: 12, fontWeight: "600" },
  addCurrencyButton: { backgroundColor: colors.lightBlue, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14 },
  currencyCustomRow: { flexDirection: "row", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
});
