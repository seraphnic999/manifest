import { useState, useEffect } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Modal,
} from "react-native";
import { Alert } from "@/lib/alert";
import { useRouter, Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { Companion, TripType } from "@/lib/types";
import { setTripCompanions, companionFullName } from "@/lib/companions";
import CompanionPickerModal from "@/components/CompanionPickerModal";
import { tzOffsetLabel, sortedByOffsetDesc, COMMON_TIMEZONES, COMMON_CURRENCIES } from "@/lib/timezone";
import { fetchLiveRateToNis } from "@/lib/currencyRates";
import { fetchAllCities, saveTripCities } from "@/lib/cities";
import { mergePackingItems, fetchTemplateItems, fetchTripPackingAsSource } from "@/lib/packing";
import { DateField } from "@/components/DateTimeFields";
import HomeButton from "@/components/HomeButton";
import CoverPhotoPicker from "@/components/CoverPhotoPicker";
import CityPickerModal, { CityPick } from "@/components/CityPickerModal";
import SubpageHeader from "@/components/SubpageHeader";

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
  const [cityPicks, setCityPicks] = useState<CityPick[]>([]);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [syncingCities, setSyncingCities] = useState(false);
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

  const [companions, setCompanions] = useState<Companion[]>([]);
  const [companionPickerOpen, setCompanionPickerOpen] = useState(false);

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

  // Adds any currency implied by the picked cities that isn't already in
  // the list — never removes one, so a manually added or since-unpicked
  // currency is left alone. Runs after every city-picker change.
  async function syncCurrenciesToCities(picks: CityPick[], currentCurrencies: CurrencyRow[]) {
    const cities = await fetchAllCities();
    const activeCodes = new Set(
      picks.map((p) => (p.cityId ? cities.find((c) => c.id === p.cityId)?.currency_code : undefined)).filter((c): c is string => !!c)
    );
    const missing = [...activeCodes].filter((code) => code !== "NIS" && !currentCurrencies.some((c) => c.code === code));
    if (missing.length === 0) return;
    setSyncingCities(true);
    const additions: CurrencyRow[] = [];
    for (const code of missing) {
      const rate = await fetchLiveRateToNis(code);
      additions.push({ code, rate: rate !== null ? rate.toFixed(4) : "1" });
    }
    setCurrencies((prev) => [...prev, ...additions]);
    setSyncingCities(false);
  }

  async function handleCityPicksChange(next: CityPick[]) {
    const firstAdded = next.length > 0 && cityPicks.length === 0;
    setCityPicks(next);

    if (firstAdded && next[0].cityId) {
      const cities = await fetchAllCities();
      const first = cities.find((c) => c.id === next[0].cityId);
      if (first) {
        if (coverPhotoId === null) setCoverPhotoId(first.cover_photo_id);
        if (timezone === "Asia/Jerusalem") setTimezone(first.timezone);
      }
    }

    await syncCurrenciesToCities(next, currencies);
  }

  // Explicitly promoting a city to primary — unlike the passive first-pick
  // auto-fill above, this always overwrites cover photo + timezone from the
  // new primary (it's a deliberate user action, not a side effect of adding
  // another destination). Map focus follows automatically at save() time,
  // since that always reads cityPicks[0].
  async function makePrimary(index: number) {
    if (index === 0) return;
    const next = [...cityPicks];
    const [picked] = next.splice(index, 1);
    next.unshift(picked);
    setCityPicks(next);

    if (picked.cityId) {
      const cities = await fetchAllCities();
      const city = cities.find((c) => c.id === picked.cityId);
      if (city) {
        setCoverPhotoId(city.cover_photo_id);
        setTimezone(city.timezone);
      }
    }
  }

  async function save() {
    if (!name || !startDate || !endDate) {
      Alert.alert("Missing info", "Name, start date, and end date are required.");
      return;
    }
    setSaving(true);

    const cities = await fetchAllCities();
    const primary = cityPicks[0]?.cityId ? cities.find((c) => c.id === cityPicks[0].cityId) : null;

    const { data: trip, error } = await supabase
      .from("trips")
      .insert({
        name,
        start_date: startDate,
        end_date: endDate,
        type,
        destinations: cityPicks.map((p) => p.label),
        default_timezone: timezone,
        cover_photo_id: coverPhotoId,
        latitude: primary?.latitude ?? null,
        longitude: primary?.longitude ?? null,
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

    if (cityPicks.length > 0) {
      await saveTripCities(trip.id, cityPicks.map((p) => ({ cityId: p.cityId, customName: p.customName })));
    }

    if (companions.length > 0) {
      await setTripCompanions(trip.id, companions.map((c) => c.id));
    }

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
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SubpageHeader title="New Trip" right={<HomeButton />} />
      <ScrollView contentContainerStyle={{ padding: 20 }}>

      <Text style={styles.label}>Trip name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Summer road trip" />

      <Text style={styles.label}>Destinations</Text>
      <Pressable style={styles.addDestinationButton} onPress={() => setCityPickerOpen(true)}>
        <Text style={styles.addDestinationButtonText}>+ Add destination</Text>
      </Pressable>
      {cityPicks.map((p, i) => (
        <View key={p.cityId ?? `custom-${i}`} style={styles.currencyRow}>
          <Text style={[styles.currencyRate, i === 0 && styles.primaryCityText]}>{p.label}</Text>
          {i !== 0 && (
            <Pressable onPress={() => makePrimary(i)}>
              <Text style={styles.primeText}>Prime</Text>
            </Pressable>
          )}
          <Pressable onPress={() => handleCityPicksChange(cityPicks.filter((_, j) => j !== i))}>
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
      ))}
      {syncingCities && <Text style={styles.hint}>Updating currencies…</Text>}
      <Text style={styles.hint}>The primary city (bold) sets the cover photo, timezone, and map focus.</Text>

      <CityPickerModal
        visible={cityPickerOpen}
        onClose={() => setCityPickerOpen(false)}
        selected={cityPicks}
        onChange={handleCityPicksChange}
        onMakePrimary={makePrimary}
      />

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

      {/* --- Traveling with --- */}
      <Text style={styles.label}>Traveling with</Text>
      <Pressable style={styles.addDestinationButton} onPress={() => setCompanionPickerOpen(true)}>
        <Text style={styles.addDestinationButtonText}>+ Add companions</Text>
      </Pressable>
      {companions.map((c) => (
        <View key={c.id} style={styles.currencyRow}>
          <Text style={styles.currencyRate}>{companionFullName(c)}</Text>
          <Pressable onPress={() => setCompanions(companions.filter((x) => x.id !== c.id))}>
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
      ))}

      <CompanionPickerModal
        visible={companionPickerOpen}
        onClose={() => setCompanionPickerOpen(false)}
        selectedIds={companions.map((c) => c.id)}
        onChange={(_, picked) => setCompanions(picked)}
      />

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
  addDestinationButton: {
    backgroundColor: colors.lightBlue, borderRadius: radius.md, paddingVertical: 12,
    alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 16,
  },
  addDestinationButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  primaryCityText: { color: colors.ink, fontWeight: "700" },
  primeText: { color: colors.lightBlue, fontSize: 12, fontWeight: "600" },
  button: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 28 },
  buttonText: { color: colors.paper, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.4)", justifyContent: "center", padding: 30 },
  modalCard: { backgroundColor: colors.paperRaised, borderRadius: radius.lg, padding: 8, width: "100%", maxWidth: 420, alignSelf: "center" },
  modalRow: {
    padding: 12, borderBottomWidth: 1, borderBottomColor: colors.line,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  modalRowText: { color: colors.ink, fontSize: 15 },
  offsetText: { color: colors.inkSoft, fontSize: 12, fontFamily: "JetBrainsMono_600SemiBold" },
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
  currencyCode: { fontFamily: "JetBrainsMono_600SemiBold", fontWeight: "700", color: colors.ink, width: 44 },
  currencyRate: { color: colors.inkSoft, fontSize: 13, flex: 1 },
  removeText: { color: colors.coral, fontSize: 12, fontWeight: "600" },
  addCurrencyButton: { backgroundColor: colors.lightBlue, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14 },
  currencyCustomRow: { flexDirection: "row", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
});
