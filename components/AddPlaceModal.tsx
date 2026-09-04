import { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Modal } from "react-native";
import { Alert } from "@/lib/alert";
import { colors, radius } from "@/lib/theme";
import { addTripPlace, updateTripPlace, deleteTripPlace } from "@/lib/mapData";
import { TripPlace } from "@/lib/types";

// A "shortlist" pin — a place worth knowing about (runner-up restaurant,
// unchosen museum) that deliberately isn't a scheduled itinerary item. See
// MANIFEST-MAP-HANDOFF.md §5.3. No in-app geocoding exists yet, so lat/lon
// is entered manually for now (e.g. copied from Google Maps' "share"
// coordinates); bulk-loading many places at once is better done as a SQL
// insert against trip_places, same as the route seed in migration_009.
export default function AddPlaceModal({
  visible, onClose, onSaved, tripId, place,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  tripId: string;
  place?: TripPlace | null; // when set, edits this place instead of creating
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [address, setAddress] = useState("");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (place) {
      setName(place.name);
      setCategory(place.category ?? "");
      setLatitude(String(place.latitude));
      setLongitude(String(place.longitude));
      setAddress(place.address ?? "");
      setLink(place.link ?? "");
      setNotes(place.notes ?? "");
    } else {
      setName(""); setCategory(""); setLatitude(""); setLongitude("");
      setAddress(""); setLink(""); setNotes("");
    }
  }, [visible, place]);

  async function save() {
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    if (!name) { Alert.alert("Missing info", "Enter a name."); return; }
    if (Number.isNaN(lat) || Number.isNaN(lon)) { Alert.alert("Missing coordinates", "Enter both latitude and longitude."); return; }

    setSaving(true);
    if (place) {
      await updateTripPlace(place.id, {
        name, category: category || null, latitude: lat, longitude: lon,
        address: address || null, link: link || null, notes: notes || null,
      });
    } else {
      await addTripPlace({
        trip_id: tripId, name, category: category || null, latitude: lat, longitude: lon,
        address: address || null, link: link || null, notes: notes || null,
      });
    }
    setSaving(false);
    onSaved();
  }

  function remove() {
    if (!place) return;
    Alert.alert("Delete place", `Remove "${place.name}" from the shortlist?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await deleteTripPlace(place.id); onSaved(); } },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={styles.sheetTitle}>{place ? "Edit place" : "Add a place"}</Text>

            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={"Le Comptoir…"} />

            <Text style={styles.label}>Category</Text>
            <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="Restaurant, bar, museum…" />

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Latitude</Text>
                <TextInput style={styles.input} value={latitude} onChangeText={setLatitude} placeholder="48.86526" keyboardType="numbers-and-punctuation" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Longitude</Text>
                <TextInput style={styles.input} value={longitude} onChangeText={setLongitude} placeholder="2.34681" keyboardType="numbers-and-punctuation" />
              </View>
            </View>

            <Text style={styles.label}>Address</Text>
            <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Optional" />

            <Text style={styles.label}>Link</Text>
            <TextInput style={styles.input} value={link} onChangeText={setLink} placeholder="Optional" autoCapitalize="none" />

            <Text style={styles.label}>Notes</Text>
            <TextInput style={styles.input} value={notes} onChangeText={setNotes} placeholder="Optional" multiline />

            <Pressable style={styles.button} onPress={save} disabled={saving}>
              <Text style={styles.buttonText}>{saving ? "Saving…" : place ? "Save changes" : "Add place"}</Text>
            </Pressable>
            {place && (
              <Pressable style={styles.deleteButton} onPress={remove}>
                <Text style={styles.deleteButtonText}>Delete place</Text>
              </Pressable>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%",
    width: "100%", maxWidth: 480, alignSelf: "center",
  },
  sheetTitle: { fontFamily: "Archivo_700Bold" as any, fontWeight: "800", fontSize: 18, color: colors.ink, marginBottom: 12 },
  label: { color: colors.inkSoft, fontSize: 12, fontWeight: "600", marginTop: 14, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
  },
  row: { flexDirection: "row", gap: 10 },
  button: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 24 },
  buttonText: { color: colors.paper, fontWeight: "700" },
  deleteButton: { alignItems: "center", marginTop: 14, marginBottom: 10, padding: 10 },
  deleteButtonText: { color: colors.coral, fontWeight: "600", fontSize: 13 },
});
