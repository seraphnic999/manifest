import { useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Switch, Modal,
} from "react-native";
import { Alert } from "@/lib/alert";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { categoryForDbType, FieldKey } from "@/lib/itemTypeMeta";
import { DateField, TimeField } from "@/components/DateTimeFields";
import { computeInsertSortOrder } from "@/lib/reorder";
import { computeDurationMinutes, formatDuration } from "@/lib/duration";
import { useUnsavedChangesGuard } from "@/lib/useUnsavedChangesGuard";
import { Item, ItemStatus } from "@/lib/types";
import { DEFAULT_REMINDER_MINUTES } from "@/lib/reminders";
import { linkItems, unlinkItems, fetchLinkedItems, LinkedItemSummary } from "@/lib/itemLinks";
import { formatDateDDMM } from "@/lib/dateFormat";
import { normalizeTimeHHMM } from "@/lib/timeFormat";
import ItemPickerModal from "@/components/ItemPickerModal";
import QuickNotesList from "@/components/QuickNotesList";
import HomeButton from "@/components/HomeButton";
import SubpageHeader from "@/components/SubpageHeader";
import MapIconPickerModal, { MAP_ICON_LABELS } from "@/components/MapIconPickerModal";
import Icon, { IconName } from "@/components/icons/Icon";

const STATUSES: ItemStatus[] = ["planned", "booked", "optional"];

export default function EditItem() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [isStaySpan, setIsStaySpan] = useState(false);
  const [fields, setFields] = useState<FieldKey[]>([]);
  const [saving, setSaving] = useState(false);
  const [tripId, setTripId] = useState("");
  const [linkedItems, setLinkedItems] = useState<LinkedItemSummary[]>([]);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<ItemStatus>("booked");
  const [itemDate, setItemDate] = useState("");
  const [origItemDate, setOrigItemDate] = useState("");
  // Whether the reminder needs re-arming (reminder_sent_at reset to null) on
  // save — only when the trigger time actually moved (start date/time or the
  // offset itself), not on every unrelated edit, or an already-sent
  // reminder would fire a second time for no reason.
  const origReminderKeyRef = useRef("");
  const [time, setTime] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [vendor, setVendor] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [bookingSource, setBookingSource] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [link, setLink] = useState("");
  const [googleMapsLink, setGoogleMapsLink] = useState("");
  const [reminderMinutes, setReminderMinutes] = useState("");
  const [itemType, setItemType] = useState("other");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [mapIcon, setMapIcon] = useState<IconName | null>(null);
  const [mapIconPickerOpen, setMapIconPickerOpen] = useState(false);

  // Lodging span only
  const [checkInDate, setCheckInDate] = useState("");
  const [checkInTime, setCheckInTime] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("");
  const [origCheckInDate, setOrigCheckInDate] = useState("");
  const [origCheckOutDate, setOrigCheckOutDate] = useState("");

  // Flight-specific (departure reuses itemDate/time above)
  const [arrivalDate, setArrivalDate] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");

  // Unsaved-changes guard: compares a live snapshot of the form against the
  // snapshot captured right after load, so navigating away (back, Home, a
  // day-pill switch — anything that removes this screen) can prompt to
  // save/discard instead of silently losing edits.
  const originalSnapshotRef = useRef("");
  const latestSnapshotRef = useRef("");
  function currentSnapshot() {
    return JSON.stringify({
      title, status, itemDate, time, address, phone, vendor, flightNumber,
      bookingSource, confirmationCode, link, googleMapsLink, latitude, longitude, mapIcon,
      reminderMinutes,
      checkInDate, checkInTime, checkOutDate, checkOutTime,
      arrivalDate, arrivalTime,
    });
  }
  useEffect(() => { latestSnapshotRef.current = currentSnapshot(); });
  const { promptVisible, proceed, cancel } = useUnsavedChangesGuard(
    () => latestSnapshotRef.current !== originalSnapshotRef.current
  );

  const durationMinutes = computeDurationMinutes(itemDate, time, arrivalDate, arrivalTime);
  const durationInvalid = durationMinutes !== null && durationMinutes < 0;
  const durationLabel = durationMinutes === null
    ? null
    : durationInvalid
      ? "Arrival must be after departure."
      : `Flight duration: ${formatDuration(durationMinutes)}`;

  useEffect(() => {
    supabase.from("items").select("*").eq("id", itemId).single().then(({ data }) => {
      if (!data) return;
      const item = data as Item;
      setIsStaySpan(item.is_stay_span);
      setItemType(item.type);
      const cat = categoryForDbType(item.type);
      // A lodging check-in/check-out event isn't the span itself, so drop
      // the date-range fields even though its DB type is also 'lodging'.
      setFields(item.is_stay_span ? cat.fields : cat.fields.filter((f) => f !== "lodgingDates"));

      setTitle(item.title);
      setStatus(item.status);
      setTime(item.time_start ?? "");
      setItemDate(item.start_date ?? "");
      setOrigItemDate(item.start_date ?? "");
      setAddress(item.address ?? "");
      setPhone(item.phone ?? "");
      setVendor(item.vendor ?? "");
      setFlightNumber((item.custom_fields as any)?.flight_number ?? "");
      setBookingSource(item.booking_source ?? "");
      setConfirmationCode(item.confirmation_code ?? "");
      setLink(item.link ?? "");
      setGoogleMapsLink(item.google_maps_link ?? "");
      setLatitude(item.latitude != null ? String(item.latitude) : "");
      setLongitude(item.longitude != null ? String(item.longitude) : "");
      setMapIcon((item.map_icon as IconName) ?? null);
      setReminderMinutes(item.reminder_minutes_before != null ? String(item.reminder_minutes_before) : "");
      origReminderKeyRef.current = [item.start_date, item.time_start, item.reminder_minutes_before].join("|");
      setCheckInDate(item.start_date ?? "");
      setCheckInTime(item.time_start ?? "");
      setCheckOutDate(item.end_date ?? "");
      setCheckOutTime(item.time_end ?? "");
      setOrigCheckInDate(item.start_date ?? "");
      setOrigCheckOutDate(item.end_date ?? "");
      setArrivalDate(item.end_date ?? "");
      setArrivalTime(item.time_end ?? "");
      // Key order must match currentSnapshot()'s object exactly, since
      // JSON.stringify preserves insertion order and the dirty check is a
      // plain string comparison.
      originalSnapshotRef.current = JSON.stringify({
        title: item.title, status: item.status,
        itemDate: item.start_date ?? "", time: item.time_start ?? "",
        address: item.address ?? "", phone: item.phone ?? "", vendor: item.vendor ?? "",
        flightNumber: (item.custom_fields as any)?.flight_number ?? "",
        bookingSource: item.booking_source ?? "", confirmationCode: item.confirmation_code ?? "",
        link: item.link ?? "",
        googleMapsLink: item.google_maps_link ?? "",
        latitude: item.latitude != null ? String(item.latitude) : "",
        longitude: item.longitude != null ? String(item.longitude) : "",
        mapIcon: (item.map_icon as IconName) ?? null,
        reminderMinutes: item.reminder_minutes_before != null ? String(item.reminder_minutes_before) : "",
        checkInDate: item.start_date ?? "", checkInTime: item.time_start ?? "",
        checkOutDate: item.end_date ?? "", checkOutTime: item.time_end ?? "",
        arrivalDate: item.end_date ?? "", arrivalTime: item.time_end ?? "",
      });
      setTripId(item.trip_id);
      setLoaded(true);
    });
    loadLinkedItems();
  }, [itemId]);

  function loadLinkedItems() {
    fetchLinkedItems(itemId).then(setLinkedItems);
  }

  async function handleLinkSelect(picked: { id: string }) {
    setLinkPickerOpen(false);
    try {
      await linkItems(itemId, picked.id);
      loadLinkedItems();
    } catch (e: any) {
      Alert.alert("Couldn't link item", e.message ?? "Unknown error");
    }
  }

  async function handleUnlink(linkedId: string) {
    try {
      await unlinkItems(itemId, linkedId);
      loadLinkedItems();
    } catch (e: any) {
      Alert.alert("Couldn't remove link", e.message ?? "Unknown error");
    }
  }

  const has = (f: FieldKey) => fields.includes(f);

  // Returns whether the save succeeded — it doesn't navigate itself, since
  // the two callers need different post-save navigation: the plain "Save
  // changes" button just goes back one screen, but the unsaved-changes
  // prompt's Save option needs to resume whatever navigation (e.g. Home)
  // was originally blocked, via proceed().
  async function save(): Promise<boolean> {
    if (!title) { Alert.alert("Missing info", "Title is required."); return false; }
    if (isStaySpan && (!checkInDate || !checkOutDate)) {
      Alert.alert("Missing info", "Check-in and check-out dates are required.");
      return false;
    }
    if (has("flightTimes") && durationInvalid) {
      Alert.alert("Check the times", "Arrival must be after departure.");
      return false;
    }
    if ((latitude && !longitude) || (!latitude && longitude)) {
      Alert.alert("Missing coordinate", "Enter both latitude and longitude, or leave both blank.");
      return false;
    }
    const lat = latitude ? parseFloat(latitude) : null;
    const lon = longitude ? parseFloat(longitude) : null;
    if ((lat !== null && Number.isNaN(lat)) || (lon !== null && Number.isNaN(lon))) {
      Alert.alert("Invalid coordinate", "Latitude/longitude must be numbers.");
      return false;
    }
    setSaving(true);
    const { data: current } = await supabase.from("items").select("trip_id, day_id").eq("id", itemId).single();

    const newStartDate = isStaySpan ? checkInDate : (itemDate || null);
    const newTimeStart = isStaySpan ? (checkInTime || null) : (time || null);
    const newReminderMinutes = reminderMinutes ? parseInt(reminderMinutes, 10) || null : null;
    const reminderKeyChanged = [newStartDate, newTimeStart, newReminderMinutes].join("|") !== origReminderKeyRef.current;

    const { error } = await supabase.from("items").update({
      title, status,
      time_start: newTimeStart,
      time_end: isStaySpan ? (checkOutTime || null) : (has("flightTimes") ? (arrivalTime || null) : undefined),
      start_date: newStartDate,
      end_date: isStaySpan ? checkOutDate : (has("flightTimes") ? (arrivalDate || null) : undefined),
      address: address || null,
      phone: phone || null,
      vendor: vendor || null,
      booking_source: bookingSource || null,
      confirmation_code: confirmationCode || null,
      link: link || null,
      google_maps_link: googleMapsLink || null,
      latitude: lat,
      longitude: lon,
      map_icon: mapIcon,
      reminder_minutes_before: newReminderMinutes,
      ...(reminderKeyChanged ? { reminder_sent_at: null } : {}),
      custom_fields: flightNumber ? { flight_number: flightNumber } : {},
    }).eq("id", itemId);
    setSaving(false);
    if (error) { Alert.alert("Couldn't save", error.message); return false; }

    // Mark the form clean relative to what was just saved — otherwise a
    // subsequent navigation attempt would immediately re-trigger the
    // unsaved-changes prompt against the (now stale) original snapshot.
    originalSnapshotRef.current = currentSnapshot();

    if (isStaySpan && (checkInDate !== origCheckInDate || checkOutDate !== origCheckOutDate)) {
      await moveCheckInOutChildren();
    }
    if (!isStaySpan && itemDate && itemDate !== origItemDate && current) {
      await moveToDay(current.trip_id, itemDate);
    }
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

  // Moves a regular (non-span) item to the day matching its new date,
  // slotting it chronologically among that day's items — same pattern as
  // the lodging check-in/out mover below.
  async function moveToDay(tripId: string, newDate: string) {
    const { data: targetDay } = await supabase
      .from("days").select("id").eq("trip_id", tripId).eq("date", newDate).single();
    if (!targetDay) {
      Alert.alert("No such day", "That date is outside the trip's date range — the item's date was saved, but it wasn't moved.");
      return;
    }
    const { data: siblings } = await supabase
      .from("items").select("id, sort_order, time_start")
      .eq("day_id", targetDay.id).is("deleted_at", null);
    const newSortOrder = computeInsertSortOrder(siblings ?? [], time || null);
    await supabase.from("items").update({ day_id: targetDay.id, sort_order: newSortOrder }).eq("id", itemId);
  }

  // Keeps the auto-created "Check in"/"Check out" day items in sync when
  // the stay's dates change — same trip_id, new day_id, hour untouched.
  async function moveCheckInOutChildren() {
    const { data: children } = await supabase
      .from("items").select("*").eq("parent_item_id", itemId).is("deleted_at", null);
    if (!children || children.length === 0) return;

    for (const child of children as Item[]) {
      const isCheckIn = child.title.startsWith("Check in");
      const isCheckOut = child.title.startsWith("Check out");
      if (!isCheckIn && !isCheckOut) continue;

      const targetDate = isCheckIn ? checkInDate : checkOutDate;
      if (!targetDate) continue;

      const { data: targetDay } = await supabase
        .from("days").select("id").eq("trip_id", child.trip_id).eq("date", targetDate).single();
      if (!targetDay || targetDay.id === child.day_id) continue; // no day for that date, or unchanged

      const { data: siblings } = await supabase
        .from("items").select("id, sort_order, time_start")
        .eq("day_id", targetDay.id).is("deleted_at", null);
      // child.time_start (the hour) is left exactly as it was.
      const newSortOrder = computeInsertSortOrder(siblings ?? [], child.time_start);

      await supabase.from("items")
        .update({ day_id: targetDay.id, sort_order: newSortOrder })
        .eq("id", child.id);
    }
  }

  if (!loaded) return null;

  return (
    <>
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SubpageHeader title="Edit item" right={<HomeButton />} />
      <ScrollView contentContainerStyle={{ padding: 20 }}>

      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} />

      {isStaySpan ? (
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
          <Text style={styles.hint}>
            Changing these dates will move the auto-created "Check in"/"Check out" items to the new days (their times stay the same).
          </Text>
        </>
      ) : has("flightTimes") ? (
        <>
          <View style={styles.row}>
            <DateField label="Departure date" value={itemDate} onChange={setItemDate} />
            <View style={{ width: 10 }} />
            <TimeField label="Departure time" value={time} onChange={setTime} />
          </View>
          <View style={styles.row}>
            <DateField label="Arrival date" value={arrivalDate} onChange={setArrivalDate} />
            <View style={{ width: 10 }} />
            <TimeField label="Arrival time (landing)" value={arrivalTime} onChange={setArrivalTime} />
          </View>
          {durationLabel && (
            <Text style={[styles.hint, durationInvalid && styles.hintError]}>{durationLabel}</Text>
          )}
        </>
      ) : (
        <View style={styles.row}>
          <DateField label="Date" value={itemDate} onChange={setItemDate} />
          <View style={{ width: 10 }} />
          <TimeField label="Time (optional)" value={time} onChange={setTime} />
        </View>
      )}

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
      {has("flightNumber") && (
        <><Text style={styles.label}>Flight number</Text>
        <TextInput style={styles.input} value={flightNumber} onChangeText={setFlightNumber} autoCapitalize="characters" /></>
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

      <Text style={styles.label}>Google Maps link (optional)</Text>
      <TextInput style={styles.input} value={googleMapsLink} onChangeText={setGoogleMapsLink} autoCapitalize="none" placeholder="https://maps.app.goo.gl/…" />

      <Text style={styles.label}>Coordinates (optional)</Text>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <TextInput style={styles.input} value={latitude} onChangeText={setLatitude} placeholder="Latitude" keyboardType="numbers-and-punctuation" />
        </View>
        <View style={{ width: 10 }} />
        <View style={{ flex: 1 }}>
          <TextInput style={styles.input} value={longitude} onChangeText={setLongitude} placeholder="Longitude" keyboardType="numbers-and-punctuation" />
        </View>
      </View>
      <Text style={styles.hint}>Shown as a pin on the trip map.</Text>

      <Text style={styles.label}>Map icon</Text>
      <Pressable style={styles.mapIconRow} onPress={() => setMapIconPickerOpen(true)}>
        <View style={styles.mapIconPreview}>
          <Icon name={mapIcon ?? categoryForDbType(itemType as any).icon} size={22} color="#fff" />
        </View>
        <Text style={styles.mapIconRowText}>
          {mapIcon ? (MAP_ICON_LABELS[mapIcon] ?? mapIcon) : "Default (matches item type)"}
        </Text>
        <Icon name="forward" size={16} color={colors.blue} />
      </Pressable>

      <Text style={styles.label}>Remind me (minutes before, optional)</Text>
      <TextInput
        style={styles.input}
        value={reminderMinutes}
        onChangeText={setReminderMinutes}
        keyboardType="number-pad"
        placeholder={`e.g. ${DEFAULT_REMINDER_MINUTES[itemType] ?? 30}`}
      />
      <Text style={styles.hint}>Sent as a push notification — needs a signed-in device registered for push.</Text>

      <QuickNotesList itemId={itemId} />

      <Text style={styles.label}>Linked items</Text>
      {linkedItems.map((li) => (
        <View key={li.id} style={styles.linkedRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.linkedTitle}>{li.title}</Text>
            <Text style={styles.linkedMeta}>
              {[li.day_date ? formatDateDDMM(li.day_date) : null, normalizeTimeHHMM(li.time_start)].filter(Boolean).join(" · ") || li.type.toUpperCase()}
            </Text>
          </View>
          <Pressable onPress={() => handleUnlink(li.id)} hitSlop={8} style={styles.unlinkBtn}>
            <Text style={styles.unlinkBtnText}>Remove</Text>
          </Pressable>
        </View>
      ))}
      {linkedItems.length === 0 && <Text style={styles.empty}>No linked items yet.</Text>}
      <Pressable style={styles.linkAddButton} onPress={() => setLinkPickerOpen(true)}>
        <Text style={styles.linkAddButtonText}>+ Link item</Text>
      </Pressable>

      <Pressable style={styles.button} onPress={handleSavePress} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? "Saving…" : "Save changes"}</Text>
      </Pressable>
      </ScrollView>
    </View>

    <MapIconPickerModal
      visible={mapIconPickerOpen}
      onClose={() => setMapIconPickerOpen(false)}
      onSelect={(icon) => { setMapIcon(icon); setMapIconPickerOpen(false); }}
      defaultIcon={categoryForDbType(itemType as any).icon}
      selected={mapIcon}
    />

    <ItemPickerModal
      visible={linkPickerOpen}
      onClose={() => setLinkPickerOpen(false)}
      onSelect={handleLinkSelect}
      tripId={tripId}
      excludeIds={[itemId, ...linkedItems.map((li) => li.id)]}
    />

    <Modal visible={promptVisible} transparent animationType="fade">
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
    </>
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
  hintError: { color: colors.coral, fontStyle: "normal", fontWeight: "600" },
  row: { flexDirection: "row" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paperRaised },
  chipActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { color: colors.inkSoft, fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: "#fff" },
  button: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 28 },
  buttonText: { color: colors.paper, fontWeight: "700" },
  mapIconRow: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 10,
  },
  mapIconPreview: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: colors.blue,
    alignItems: "center", justifyContent: "center",
  },
  mapIconRowText: { flex: 1, color: colors.ink, fontSize: 14 },
  linkedRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginBottom: 6,
  },
  linkedTitle: { color: colors.ink, fontWeight: "600", fontSize: 13 },
  linkedMeta: { color: colors.inkSoft, fontSize: 11, marginTop: 2 },
  unlinkBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  unlinkBtnText: { color: colors.coral, fontWeight: "700", fontSize: 12 },
  empty: { color: colors.inkSoft, fontSize: 12, fontStyle: "italic", marginTop: 2, marginBottom: 8 },
  linkAddButton: {
    borderWidth: 1, borderColor: colors.line, borderStyle: "dashed", borderRadius: radius.md,
    padding: 12, alignItems: "center", marginTop: 4,
  },
  linkAddButtonText: { color: colors.teal, fontWeight: "700", fontSize: 13 },
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
