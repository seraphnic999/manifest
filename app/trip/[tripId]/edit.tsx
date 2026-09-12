import { useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Modal,
} from "react-native";
import { Alert } from "@/lib/alert";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { Companion, Trip, TripType, TripCurrency, Day } from "@/lib/types";
import { tzOffsetLabel, sortedByOffsetDesc, COMMON_TIMEZONES, COMMON_CURRENCIES } from "@/lib/timezone";
import { fetchLiveRateToNis } from "@/lib/currencyRates";
import { fetchAllCities, fetchTripCities, saveTripCities } from "@/lib/cities";
import { fetchTripCompanions, setTripCompanions, companionFullName } from "@/lib/companions";
import CompanionPickerModal from "@/components/CompanionPickerModal";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";
import { useUnsavedChangesGuard } from "@/lib/useUnsavedChangesGuard";
import { DateField } from "@/components/DateTimeFields";
import HomeButton from "@/components/HomeButton";
import CoverPhotoPicker from "@/components/CoverPhotoPicker";
import CityPickerModal, { CityPick } from "@/components/CityPickerModal";
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
  const [origStartDate, setOrigStartDate] = useState("");
  const [origEndDate, setOrigEndDate] = useState("");
  const [type, setType] = useState<TripType>("pleasure");
  const [origType, setOrigType] = useState<TripType>("pleasure");
  const [cityPicks, setCityPicks] = useState<CityPick[]>([]);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [syncingCities, setSyncingCities] = useState(false);
  const [hadCitiesOnLoad, setHadCitiesOnLoad] = useState(false);
  const [origDestinations, setOrigDestinations] = useState<string[]>([]);
  const [origLatLon, setOrigLatLon] = useState<{ latitude: number | null; longitude: number | null }>({ latitude: null, longitude: null });
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(null);
  const [initialCoverPhotoId, setInitialCoverPhotoId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("Asia/Jerusalem");
  const [initialTimezone, setInitialTimezone] = useState("Asia/Jerusalem");
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

  const [companions, setCompanions] = useState<Companion[]>([]);
  const [companionPickerOpen, setCompanionPickerOpen] = useState(false);

  // Shrinking the trip's date range can leave existing `days` rows (and
  // their items) outside the new [startDate, endDate] window — the
  // generate_trip_days() trigger only ever fills gaps, it never removes a
  // day that's fallen out of range. This prompts for what to do with those
  // items before the trip update (and the day cleanup) is committed.
  const [orphanedDays, setOrphanedDays] = useState<{ day: Day; itemCount: number }[] | null>(null);
  const orphanResolverRef = useRef<((choice: "delete" | "move" | "cancel") => void) | null>(null);
  function resolveOrphanedDays(choice: "delete" | "move" | "cancel") {
    orphanResolverRef.current?.(choice);
    orphanResolverRef.current = null;
    setOrphanedDays(null);
  }

  // Unsaved-changes guard — same beforeRemove-based mechanism as the item
  // edit screen (lib/useUnsavedChangesGuard.ts). Currency add/remove/live-rate
  // writes are excluded since those already save immediately, not on this
  // screen's own Save button; only fields staged in local state until Save
  // count as "unsaved".
  const originalSnapshotRef = useRef("");
  const latestSnapshotRef = useRef("");
  function currentSnapshot() {
    return JSON.stringify({
      name, startDate, endDate, type, budgetAmount, coverPhotoId, timezone, cityPicks, rateEdits,
      companionIds: companions.map((c) => c.id).sort(),
    });
  }
  useEffect(() => { latestSnapshotRef.current = currentSnapshot(); });
  const { promptVisible, proceed, cancel } = useUnsavedChangesGuard(
    () => latestSnapshotRef.current !== originalSnapshotRef.current
  );

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
    Promise.all([
      supabase.from("trips").select("*").eq("id", tripId).single(),
      fetchTripCities(tripId),
      fetchTripCompanions(tripId),
    ]).then(([{ data }, cityRows, tripCompanions]) => {
      if (!data) return;
      const trip = data as Trip;
      const picks: CityPick[] = cityRows.map((r) => ({
        cityId: r.city_id, customName: r.custom_name, label: r.city?.name ?? r.custom_name ?? "",
      }));
      setCompanions(tripCompanions);
      setName(trip.name);
      setStartDate(trip.start_date);
      setEndDate(trip.end_date);
      setOrigStartDate(trip.start_date);
      setOrigEndDate(trip.end_date);
      setType(trip.type);
      setOrigType(trip.type);
      setOrigDestinations(trip.destinations);
      setOrigLatLon({ latitude: trip.latitude, longitude: trip.longitude });
      setCoverPhotoId(trip.cover_photo_id);
      setInitialCoverPhotoId(trip.cover_photo_id);
      setTimezone(trip.default_timezone);
      setInitialTimezone(trip.default_timezone);
      setCustomTz(!COMMON_TIMEZONES.includes(trip.default_timezone));
      setBudgetAmount(trip.budget_amount != null ? String(trip.budget_amount) : "");
      setCityPicks(picks);
      setHadCitiesOnLoad(cityRows.length > 0);
      // Key order must match currentSnapshot()'s object exactly, since
      // JSON.stringify preserves insertion order and the dirty check is a
      // plain string comparison.
      originalSnapshotRef.current = JSON.stringify({
        name: trip.name, startDate: trip.start_date, endDate: trip.end_date, type: trip.type,
        budgetAmount: trip.budget_amount != null ? String(trip.budget_amount) : "",
        coverPhotoId: trip.cover_photo_id, timezone: trip.default_timezone,
        cityPicks: picks, rateEdits: {},
        companionIds: tripCompanions.map((c) => c.id).sort(),
      });
      setLoaded(true);
    });
    loadCurrencies();
  }, [tripId]);

  // Adds any currency implied by the picked cities that isn't already
  // present — never removes one, mirroring the same rule in new.tsx.
  async function syncCurrenciesToCities(picks: CityPick[]) {
    const cities = await fetchAllCities();
    const activeCodes = new Set(
      picks.map((p) => (p.cityId ? cities.find((c) => c.id === p.cityId)?.currency_code : undefined)).filter((c): c is string => !!c)
    );
    const missing = [...activeCodes].filter((code) => code !== "NIS" && !currencies.some((c) => c.code === code));
    if (missing.length === 0) return;
    setSyncingCities(true);
    for (const code of missing) {
      const rate = await fetchLiveRateToNis(code);
      await supabase.from("trip_currencies").insert({
        trip_id: tripId, code, rate_to_nis: rate ?? 1, is_default: false,
      });
    }
    setSyncingCities(false);
    loadCurrencies();
  }

  async function handleCityPicksChange(next: CityPick[]) {
    const firstAdded = next.length > 0 && cityPicks.length === 0 && !hadCitiesOnLoad
      && coverPhotoId === initialCoverPhotoId && timezone === initialTimezone;
    setCityPicks(next);

    if (firstAdded && next[0].cityId) {
      const cities = await fetchAllCities();
      const first = cities.find((c) => c.id === next[0].cityId);
      if (first) {
        setCoverPhotoId(first.cover_photo_id);
        setTimezone(first.timezone);
      }
    }

    await syncCurrenciesToCities(next);
  }

  // Explicitly promoting a city to primary always overwrites cover photo +
  // timezone from the new primary — unlike the passive first-pick auto-fill
  // above, this is a deliberate user action, not a side effect of merely
  // adding another destination. Map focus follows automatically at save()
  // time, since that always reads cityPicks[0].
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

  async function save(): Promise<boolean> {
    if (!name || !startDate || !endDate) {
      Alert.alert("Missing info", "Name, start date, and end date are required.");
      return false;
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
        return false;
      }
      if (rate !== c.rate_to_nis) rateUpdates.push({ id: c.id, rate });
    }

    // The date range shrank — check for now-out-of-range days before
    // writing anything, since generate_trip_days() only ever fills gaps,
    // never removes a day that's fallen outside the trip's own dates.
    if (startDate !== origStartDate || endDate !== origEndDate) {
      const { data: currentDays } = await supabase.from("days").select("*").eq("trip_id", tripId);
      const orphaned = ((currentDays ?? []) as Day[]).filter(
        (d) => d.date !== null && (d.date < startDate || d.date > endDate)
      );
      if (orphaned.length > 0) {
        const withCounts = await Promise.all(orphaned.map(async (day) => {
          const { count } = await supabase
            .from("items").select("id", { count: "exact", head: true })
            .eq("day_id", day.id).is("deleted_at", null);
          return { day, itemCount: count ?? 0 };
        }));
        setOrphanedDays(withCounts);
        const choice = await new Promise<"delete" | "move" | "cancel">((resolve) => {
          orphanResolverRef.current = resolve;
        });
        if (choice === "cancel") return false;

        const proposalsDayId = ((currentDays ?? []) as Day[]).find((d) => d.date === null)?.id;
        if (choice === "move" && !proposalsDayId) {
          // Every trip is guaranteed exactly one Proposals day by the
          // generate_trip_days() trigger — this should never happen, but
          // silently falling through to delete would be a real data-loss
          // bug if it somehow did.
          Alert.alert("Couldn't move items", "This trip has no Proposals day to move them to. Nothing was saved.");
          return false;
        }
        for (const { day } of withCounts) {
          if (choice === "move") {
            await supabase.from("items").update({ day_id: proposalsDayId }).eq("day_id", day.id);
          }
          // "Delete": items.day_id references days(id) on delete cascade,
          // so removing the day row deletes its remaining items too.
          await supabase.from("days").delete().eq("id", day.id);
        }
      }
    }

    setSaving(true);

    const cities = await fetchAllCities();
    const primary = cityPicks[0]?.cityId ? cities.find((c) => c.id === cityPicks[0].cityId) : null;
    // If the picker was never touched (or was fully cleared without a
    // re-add), keep the trip's original destinations/coordinates rather
    // than wiping them — this is what keeps a legacy trip's data untouched
    // when only some other field on this form gets edited.
    const destinations = cityPicks.length > 0 ? cityPicks.map((p) => p.label) : origDestinations;
    const latitude = cityPicks.length > 0 ? (primary?.latitude ?? null) : origLatLon.latitude;
    const longitude = cityPicks.length > 0 ? (primary?.longitude ?? null) : origLatLon.longitude;

    const { error } = await supabase.from("trips").update({
      name,
      start_date: startDate,
      end_date: endDate,
      type,
      destinations,
      default_timezone: timezone,
      budget_amount: budgetAmount ? parseFloat(budgetAmount) || null : null,
      cover_photo_id: coverPhotoId,
      latitude,
      longitude,
    }).eq("id", tripId);

    if (error) {
      setSaving(false);
      Alert.alert("Couldn't save", error.message);
      return false;
    }

    await saveTripCities(tripId, cityPicks.map((p) => ({ cityId: p.cityId, customName: p.customName })));
    await setTripCompanions(tripId, companions.map((c) => c.id));

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

    // Mark the form clean relative to what was just saved — otherwise a
    // subsequent navigation attempt would immediately re-trigger the
    // unsaved-changes prompt against the (now stale) original snapshot.
    originalSnapshotRef.current = currentSnapshot();

    setSaving(false);
    return true;
  }

  async function handleSavePress() {
    if (await save()) router.back();
  }

  // Used by the unsaved-changes prompt: on success, resume whatever
  // navigation was originally blocked (Home, back, etc.) instead of just
  // going back one screen, so choosing "Save" ends up wherever the user was
  // actually trying to go.
  async function handlePromptSave() {
    if (await save()) proceed();
  }

  if (!loaded) return null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SubpageHeader title="Edit trip" right={<HomeButton />} />
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
      {(type === "business" || type === "mixed") && origType === "pleasure" && (
        <Text style={styles.hint}>A "Work" party will be added automatically for expense tracking.</Text>
      )}

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

      <Pressable style={styles.button} onPress={handleSavePress} disabled={saving}>
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

      <Modal visible={!!orphanedDays} transparent animationType="fade">
        <View style={styles.promptBackdrop}>
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>Some days fall outside the new dates</Text>
            <Text style={styles.promptBody}>
              {orphanedDays?.map((o) => `${formatDateDDMMYYYY(o.day.date)} — ${o.itemCount} item${o.itemCount === 1 ? "" : "s"}`).join("\n")}
            </Text>
            <Text style={styles.promptBody}>What should happen to their items?</Text>
            <Pressable style={styles.promptSaveBtn} onPress={() => resolveOrphanedDays("move")}>
              <Text style={styles.promptSaveBtnText}>Move items to Proposals</Text>
            </Pressable>
            <Pressable style={styles.promptDiscardBtn} onPress={() => resolveOrphanedDays("delete")}>
              <Text style={styles.promptDiscardText}>Delete items</Text>
            </Pressable>
            <Pressable style={styles.promptCancelBtn} onPress={() => resolveOrphanedDays("cancel")}>
              <Text style={styles.promptCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Suppressed while the orphaned-days prompt (below) is up — both are
          full-screen Modals and would otherwise visibly stack if the user
          has unsaved edits and shrinks the date range in the same session. */}
      <Modal visible={promptVisible && !orphanedDays} transparent animationType="fade">
        <View style={styles.promptBackdrop}>
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>Unsaved changes</Text>
            <Text style={styles.promptBody}>Save your changes before leaving, or discard them?</Text>
            <Pressable style={styles.promptSaveBtn} onPress={handlePromptSave} disabled={saving}>
              <Text style={styles.promptSaveBtnText}>{saving ? "Saving…" : "Save changes"}</Text>
            </Pressable>
            <Pressable style={styles.promptDiscardBtn} onPress={proceed}>
              <Text style={styles.promptDiscardText}>Discard changes</Text>
            </Pressable>
            <Pressable style={styles.promptCancelBtn} onPress={cancel}>
              <Text style={styles.promptCancelText}>Keep editing</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  promptBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.5)", justifyContent: "center", padding: 30 },
  promptCard: { backgroundColor: colors.paperRaised, borderRadius: radius.lg, padding: 20, width: "100%", maxWidth: 420, alignSelf: "center" },
  promptTitle: { color: colors.ink, fontWeight: "800", fontSize: 17, marginBottom: 6 },
  promptBody: { color: colors.inkSoft, fontSize: 13, marginBottom: 18, lineHeight: 18 },
  promptSaveBtn: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center" },
  promptSaveBtnText: { color: colors.paper, fontWeight: "700" },
  promptDiscardBtn: { alignItems: "center", padding: 14, marginTop: 8 },
  promptDiscardText: { color: colors.coral, fontWeight: "700", fontSize: 14 },
  promptCancelBtn: { alignItems: "center", padding: 10, marginTop: 2 },
  promptCancelText: { color: colors.inkSoft, fontWeight: "600", fontSize: 13 },
});
