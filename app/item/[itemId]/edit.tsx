import { useEffect, useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { categoryForDbType, FieldKey } from "@/lib/itemTypeMeta";
import { Item, ItemStatus } from "@/lib/types";

const STATUSES: ItemStatus[] = ["booked", "optional", "idea", "pending"];

function webStyle(extra = {}) {
  return {
    backgroundColor: colors.paperRaised, border: `1px solid ${colors.line}`,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
    width: "100%", boxSizing: "border-box" as const, fontFamily: "inherit", ...extra,
  };
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

export default function EditItem() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [isStaySpan, setIsStaySpan] = useState(false);
  const [fields, setFields] = useState<FieldKey[]>([]);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<ItemStatus>("booked");
  const [time, setTime] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [vendor, setVendor] = useState("");
  const [bookingSource, setBookingSource] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    supabase.from("items").select("*").eq("id", itemId).single().then(({ data }) => {
      if (!data) return;
      const item = data as Item;
      setIsStaySpan(item.is_stay_span);
      const cat = categoryForDbType(item.type);
      // A lodging check-in/check-out event isn't the span itself, so drop
      // the date-range fields even though its DB type is also 'lodging'.
      setFields(item.is_stay_span ? cat.fields : cat.fields.filter((f) => f !== "lodgingDates"));

      setTitle(item.title);
      setStatus(item.status);
      setTime(item.time_start ?? "");
      setAddress(item.address ?? "");
      setPhone(item.phone ?? "");
      setVendor(item.vendor ?? "");
      setBookingSource(item.booking_source ?? "");
      setConfirmationCode(item.confirmation_code ?? "");
      setLink(item.link ?? "");
      setNotes(item.notes ?? "");
      setLoaded(true);
    });
  }, [itemId]);

  const has = (f: FieldKey) => fields.includes(f);

  async function save() {
    if (!title) { Alert.alert("Missing info", "Title is required."); return; }
    setSaving(true);
    const { error } = await supabase.from("items").update({
      title, status,
      time_start: time || null,
      address: address || null,
      phone: phone || null,
      vendor: vendor || null,
      booking_source: bookingSource || null,
      confirmation_code: confirmationCode || null,
      link: link || null,
      notes: notes || null,
    }).eq("id", itemId);
    setSaving(false);
    if (error) { Alert.alert("Couldn't save", error.message); return; }
    router.back();
  }

  async function archiveItem() {
    Alert.alert("Delete item", "Move this item to the archive?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await supabase.from("items").update({ deleted_at: new Date().toISOString() }).eq("id", itemId);
          router.back();
          router.back(); // also leave the (now-gone) details page
        },
      },
    ]);
  }

  if (!loaded) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Stack.Screen options={{ title: "Edit item" }} />

      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} />

      {isStaySpan ? (
        <Text style={styles.hint}>Check-in/check-out dates aren't editable here yet — recreate the lodging item if the dates changed.</Text>
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
        <><Text style={styles.label}>Vendor</Text>
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
        <TextInput style={styles.input} value={bookingSource} onChangeText={setBookingSource} /></>
      )}
      {has("confirmationCode") && (
        <><Text style={styles.label}>Confirmation number</Text>
        <TextInput style={styles.input} value={confirmationCode} onChangeText={setConfirmationCode} /></>
      )}
      {has("link") && (
        <><Text style={styles.label}>Link</Text>
        <TextInput style={styles.input} value={link} onChangeText={setLink} autoCapitalize="none" /></>
      )}
      {has("notes") && (
        <><Text style={styles.label}>Notes</Text>
        <TextInput style={[styles.input, { height: 90 }]} value={notes} onChangeText={setNotes} multiline /></>
      )}

      <Pressable style={styles.button} onPress={save} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? "Saving…" : "Save changes"}</Text>
      </Pressable>
      <Pressable style={styles.deleteButton} onPress={archiveItem}>
        <Text style={styles.deleteButtonText}>Delete item</Text>
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
  hint: { color: colors.inkSoft, fontSize: 11, marginTop: 6, fontStyle: "italic" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paperRaised },
  chipActive: { backgroundColor: colors.amber, borderColor: colors.amber },
  chipText: { color: colors.inkSoft, fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: "#fff" },
  button: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 28 },
  buttonText: { color: colors.paper, fontWeight: "700" },
  deleteButton: { alignItems: "center", marginTop: 14, padding: 10 },
  deleteButtonText: { color: colors.coral, fontWeight: "600", fontSize: 13 },
});
