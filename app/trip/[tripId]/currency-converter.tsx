import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Modal } from "react-native";
import { useLocalSearchParams, Stack, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/lib/alert";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { TripCurrency } from "@/lib/types";
import { COMMON_CURRENCIES } from "@/lib/timezone";
import { fetchLiveRateToNis } from "@/lib/currencyRates";
import HomeButton from "@/components/HomeButton";

async function fetchCurrencies(tripId: string): Promise<TripCurrency[]> {
  const { data, error } = await supabase.from("trip_currencies").select("*").eq("trip_id", tripId)
    .order("is_default", { ascending: false }).order("code");
  if (error) throw error;
  return (data ?? []) as TripCurrency[];
}

export default function CurrencyConverter() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newRate, setNewRate] = useState("");
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  const { data, refetch } = useQuery({ queryKey: ["tripCurrencies", tripId], queryFn: () => fetchCurrencies(tripId) });
  const currencies = data ?? [];

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  function rateFor(code: string) {
    return currencies.find((c) => c.code === code)?.rate_to_nis ?? 1;
  }

  function onChangeAmount(code: string, value: string) {
    const cleaned = value.replace(/[^0-9.]/g, "");
    const parsed = parseFloat(cleaned);
    if (!cleaned || Number.isNaN(parsed)) {
      const next: Record<string, string> = {};
      for (const c of currencies) next[c.code] = c.code === code ? cleaned : "";
      setAmounts(next);
      return;
    }
    const nis = parsed * rateFor(code);
    const next: Record<string, string> = {};
    for (const c of currencies) {
      next[c.code] = c.code === code ? cleaned : (nis / rateFor(c.code)).toFixed(2);
    }
    setAmounts(next);
  }

  async function lookUpNewRate() {
    if (!newCode) return;
    setLookingUp(true);
    const rate = await fetchLiveRateToNis(newCode);
    setLookingUp(false);
    if (rate === null) {
      Alert.alert("Couldn't look up rate", `No live rate found for ${newCode}. Enter it manually.`);
      return;
    }
    setNewRate(rate.toFixed(4));
  }

  async function addCurrency() {
    const code = newCode.toUpperCase();
    const rate = parseFloat(newRate);
    if (!code || !rate || rate <= 0) {
      Alert.alert("Missing info", "Choose a currency and enter a valid rate to NIS.");
      return;
    }
    const { error } = await supabase.from("trip_currencies").insert({ trip_id: tripId, code, rate_to_nis: rate, is_default: false });
    if (error) {
      Alert.alert("Couldn't add currency", error.message);
      return;
    }
    setNewCode("");
    setNewRate("");
    setAddOpen(false);
    refetch();
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: "Currency Converter",
        headerRight: () => (
          <View style={{ marginRight: 14 }}>
            <HomeButton />
          </View>
        ),
      }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text style={styles.hint}>Type an amount in any currency — the rest update automatically using this trip's rates.</Text>
        {currencies.map((c) => (
          <View key={c.id} style={styles.row}>
            <View style={styles.codeCol}>
              <Text style={styles.code}>{c.code}</Text>
              <Text style={styles.rateStatic}>{c.is_default ? "base" : `1 = ${c.rate_to_nis} NIS`}</Text>
            </View>
            <TextInput
              style={styles.input}
              value={amounts[c.code] ?? ""}
              onChangeText={(v) => onChangeAmount(c.code, v)}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.inkSoft}
            />
          </View>
        ))}
        <Text style={styles.hint}>Rates shown per currency are fixed for this trip — change them from the trip's edit screen, not here.</Text>

        <Pressable style={styles.addButton} onPress={() => setAddOpen(true)}>
          <Text style={styles.addButtonText}>+ Add currency</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAddOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Add currency</Text>
            <Pressable style={styles.input} onPress={() => setCurrencyPickerOpen(true)}>
              <Text style={{ color: newCode ? colors.ink : colors.inkSoft }}>{newCode || "Choose currency"}</Text>
            </Pressable>
            <View style={{ height: 8 }} />
            <TextInput
              style={styles.input} value={newRate} onChangeText={setNewRate}
              placeholder="Rate to NIS (e.g. 4.05)" placeholderTextColor={colors.inkSoft} keyboardType="decimal-pad"
            />
            <Pressable onPress={lookUpNewRate} disabled={!newCode || lookingUp}>
              <Text style={styles.linkText}>{lookingUp ? "Looking up…" : "Look up current rate"}</Text>
            </Pressable>
            <Pressable style={styles.addButton} onPress={addCurrency}>
              <Text style={styles.addButtonText}>Add</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={currencyPickerOpen} transparent animationType="fade" onRequestClose={() => setCurrencyPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCurrencyPickerOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <ScrollView style={{ maxHeight: 300 }}>
              {COMMON_CURRENCIES.filter((c) => !currencies.some((r) => r.code === c)).map((c) => (
                <Pressable key={c} style={styles.modalRow} onPress={() => { setNewCode(c); setCurrencyPickerOpen(false); }}>
                  <Text style={styles.modalRowText}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  hint: { color: colors.inkSoft, fontSize: 13, marginBottom: 16, lineHeight: 18 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  codeCol: { width: 64 },
  code: { fontFamily: "IBMPlexMono_500Medium", fontWeight: "700", color: colors.ink, fontSize: 15 },
  rateStatic: { fontSize: 9.5, color: colors.inkSoft, marginTop: 2 },
  input: {
    flex: 1, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 16, color: colors.ink,
  },
  addButton: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 14 },
  addButtonText: { color: colors.paper, fontWeight: "700" },
  linkText: { color: colors.teal, fontSize: 12, fontWeight: "600", marginTop: 8, textAlign: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.4)", justifyContent: "center", padding: 30 },
  modalCard: { backgroundColor: colors.paperRaised, borderRadius: radius.lg, padding: 16, width: "100%", maxWidth: 420, alignSelf: "center" },
  modalTitle: { color: colors.ink, fontWeight: "700", fontSize: 16, marginBottom: 10 },
  modalRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  modalRowText: { color: colors.ink, fontSize: 15 },
});
