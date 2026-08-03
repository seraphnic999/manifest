import { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, Platform, Switch,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { categoryByKey } from "@/lib/itemTypeMeta";
import { computeInsertSortOrder } from "@/lib/reorder";
import { ItemStatus } from "@/lib/types";

const STATUSES: ItemStatus[] = ["booked", "optional", "idea", "pending"];

function webStyle(extra = {}) {
  return {
    backgroundColor: colors.paperRaised, border: `1px solid ${colors.line}`,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
    width: "100%", boxSizing: "border-box" as const, fontFamily: "inherit", ...extra,
  };
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {/* @ts-ignore */}
        <input type="date" value={value} onChange={(e: any) => onChange(e.target.value)} style={webStyle()} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.input} onPress={() => setShow(true)}>
        <Text style={{ color: value ? colors.ink : colors.inkSoft }}>{value || "Select date"}</Text>
      </Pressable>
      {show && (
        <DateTimePicker
          value={value ? new Date(value) : new Date()}
          mode="date"
          onChange={(_, d) => { setShow(false); if (d) onChange(d.toISOString().slice(0, 10)); }}
        />
      )}
    </View>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {/* @ts-ignore */}
        <input type="time" value={value} onChange={(e: any) => onChange(e.target.value)} style={webStyle()} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.input} onPress={() => setShow(true)}>
        <Text style={{ color: value ? colors.ink : colors.inkSoft }}>{value || "Optional"}</Text>
      </Pressable>
      {show && (
        <DateTimePicker
          value={value ? new Date(`1970-01-01T${value}`) : new Date()}
          mode="time"
          onChange={(_, d) => { setShow(false); if (d) onChange(d.toTimeString().slice(0, 5)); }}
        />
      )}
    </View>
  );
}

export default function NewItem() {
  const { tripId, dayId, date, category } = useLocalSearchParams<{
    tripId: string; dayId: string; date: string; category: string;
  }>();
  const router = useRouter();
  const cat = categoryByKey(category ?? "other");
  const has = (f: string) => cat.fields.includes(f as any);

  const [title, setTitle] = useState("");
  const [subtype, setSubtype] = useState(cat.dbTypes[0]);
  const [status, setStatus] = useState<ItemStatus>("booked");
  const [time, setTime] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [vendor, setVendor] = useState("");
  const [bookingSource, setBookingSource] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Lodging-specific
  const [checkInDate, setCheckInDate] = useState(date ?? "");
  const [checkInTime, setCheckInTime] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("");
  const [autoCreateEvents, setAutoCreateEvents] = useState(true);

  async function save() {
    if (!title) { Alert.alert("Missing info", "Title is required."); return; }
    if (has("lodgingDates") && (!checkInDate || !checkOutDate)) {
      Alert.alert("Missing info", "Check-in and check-out dates are required for lodging.");
      return;
    }
    setSaving(true);

    const base = {
      trip_id: tripId,
      type: subtype,
      title,
      status,
      address: address || null,
      phone: phone || null,
      vendor: vendor || null,
      booking_source: bookingSource || null,
      confirmation_code: confirmationCode || null,
      link: link || null,
      notes: notes || null,
    };

    async function siblingSortOrder(targetDayId: string, atTime: string | null) {
      const { data: siblings } = await supabase
        .from("items").select("id, sort_order, time_start")
        .eq("day_id", targetDayId).is("deleted_at", null).is("parent_item_id", null);
      return computeInsertSortOrder(siblings ?? [], atTime);
    }

    if (has("lodgingDates")) {
      // The stay itself: a trip-level span item, shown at a fixed spot on
      // every day it covers — not part of the ordered day timeline.
      const { data: span, error } = await supabase.from("items").insert({
        ...base,
        day_id: null,
        is_stay_span: true,
        start_date: checkInDate,
        end_date: checkOutDate,
        time_start: checkInTime || null,
        time_end: checkOutTime || null,
        sort_order: 0,
      }).select().single();

      if (error || !span) {
        setSaving(false);
        Alert.alert("Couldn't create lodging", error?.message ?? "Unknown error");
        return;
      }

      if (autoCreateEvents) {
        // Check-in/check-out are ordinary, orderable day items linked back
        // to the span via parent_item_id.
        const { data: checkInDay } = await supabase.from("days")
          .select("id").eq("trip_id", tripId).eq("date", checkInDate).single();
        const { data: checkOutDay } = await supabase.from("days")
          .select("id").eq("trip_id", tripId).eq("date", checkOutDate).single();

        if (checkInDay) {
          await supabase.from("items").insert({
            trip_id: tripId, day_id: checkInDay.id, parent_item_id: span.id,
            type: "lodging", title: `Check in — ${title}`, status: "booked",
            time_start: checkInTime || null,
            sort_order: await siblingSortOrder(checkInDay.id, checkInTime || null),
          });
        }
        if (checkOutDay) {
          await supabase.from("items").insert({
            trip_id: tripId, day_id: checkOutDay.id, parent_item_id: span.id,
            type: "lodging", title: `Check out — ${title}`, status: "booked",
            time_start: checkOutTime || null,
            sort_order: await siblingSortOrder(checkOutDay.id, checkOutTime || null),
          });
        }
      }
    } else {
      const { error } = await supabase.from("items").insert({
        ...base,
        day_id: dayId,
        time_start: time || null,
        sort_order: await siblingSortOrder(dayId, time || null),
      });
      if (error) {
        setSaving(false);
        Alert.alert("Couldn't create item", error.message);
        return;
      }
    }

    setSaving(false);
    router.back();
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Stack.Screen options={{ title: `Add ${cat.label}` }} />

      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder={cat.label} />

      {cat.dbTypes.length > 1 && cat.subtypeLabels && (
        <>
          <Text style={styles.label}>Kind</Text>
          <View style={styles.chipRow}>
            {cat.dbTypes.map((t) => (
              <Pressable key={t} style={[styles.chip, subtype === t && styles.chipActive]} onPress={() => setSubtype(t)}>
                <Text style={[styles.chipText, subtype === t && styles.chipTextActive]}>{cat.subtypeLabels![t]}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {has("lodgingDates") ? (
        <>
          <View style={styles.row}>
            <DateField label="Check-in date" value={checkInDate} onChange={setCheckInDate} />
            <View style={{ width: 10 }} />
            <TimeField label="Check-in time" value={checkInTime} onChange={setCheckInTime} />
          </View>
          <View style={styles.row}>
            <DateField label="Check-out date" value={checkOutDate} onChange={setCheckOutDate} />
            <View style={{ width: 10 }} />
            <TimeField label="Check-out time" value={checkOutTime} onChange={setCheckOutTime} />
          </View>
          <View style={styles.switchRow}>
            <Switch value={autoCreateEvents} onValueChange={setAutoCreateEvents} />
            <Text style={styles.switchLabel}>Also add check-in / check-out to the day timeline</Text>
          </View>
        </>
      ) : has("time") ? (
        <TimeField label="Time (optional)" value={time} onChange={setTime} />
      ) : null}

      <Text style={styles.label}>Status</Text>
      <View style={styles.chipRow}>
        {STATUSES.map((s) => (
          <Pressable key={s} style={[styles.chip, status === s && styles.chipActive]} onPress={() => setStatus(s)}>
            <Text style={[styles.chipText, status === s && styles.chipTextActive]}>{s[0].toUpperCase() + s.slice(1)}</Text>
          </Pressable>
        ))}
      </View>

      {has("vendor") && (
        <><Text style={styles.label}>{cat.key === "flight" ? "Airline / flight no." : "Vendor"}</Text>
        <TextInput style={styles.input} value={vendor} onChangeText={setVendor} /></>
      )}
      {has("address") && (
        <><Text style={styles.label}>Address</Text>
        <TextInput style={styles.input} value={address} onChangeText={setAddress} /></>
      )}
      {has("phone") && (
        <><Text style={styles.label}>Phone</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" /></>
      )}
      {has("bookingSource") && (
        <><Text style={styles.label}>Booking source</Text>
        <TextInput style={styles.input} value={bookingSource} onChangeText={setBookingSource} placeholder="Direct, Expedia, GetYourGuide…" /></>
      )}
      {has("confirmationCode") && (
        <><Text style={styles.label}>Confirmation number</Text>
        <TextInput style={styles.input} value={confirmationCode} onChangeText={setConfirmationCode} /></>
      )}
      {has("link") && (
        <><Text style={styles.label}>Link</Text>
        <TextInput style={styles.input} value={link} onChangeText={setLink} autoCapitalize="none" placeholder="https://…" /></>
      )}
      {has("notes") && (
        <><Text style={styles.label}>Notes</Text>
        <TextInput style={[styles.input, { height: 90 }]} value={notes} onChangeText={setNotes} multiline /></>
      )}

      <Pressable style={styles.button} onPress={save} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? "Saving…" : "Add item"}</Text>
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
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paperRaised },
  chipActive: { backgroundColor: colors.amber, borderColor: colors.amber },
  chipText: { color: colors.inkSoft, fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: "#fff" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  switchLabel: { color: colors.inkSoft, fontSize: 12, flex: 1 },
  button: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 28 },
  buttonText: { color: colors.paper, fontWeight: "700" },
});
