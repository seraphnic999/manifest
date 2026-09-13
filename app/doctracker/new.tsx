import { useState } from "react";
import { View, Text, Pressable, StyleSheet, TextInput, ScrollView, Modal, Image } from "react-native";
import { Stack, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import SubpageHeader from "@/components/SubpageHeader";
import Icon from "@/components/icons/Icon";
import { colors, radius } from "@/lib/theme";
import { Alert } from "@/lib/alert";
import { Relationship } from "@/lib/types";
import { RELATIONSHIP_OPTIONS, createCompanion, setCompanionProfilePhoto } from "@/lib/companions";
import { DateField } from "@/components/DateTimeFields";

export default function NewCompanion() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [israeliId, setIsraeliId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Held locally only — nothing is uploaded until the companion row itself
  // is created, so backing out of this screen before pressing Create leaves
  // no orphaned storage object behind. Compare to TravelDocumentEditModal,
  // which uploads on pick and has to implicitly-create-then-maybe-undo
  // instead; a brand-new companion doesn't need a row to exist first, so
  // this is the simpler "upload only once we know it's really happening" shape.
  const [pickedPhoto, setPickedPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [photoSourceOpen, setPhotoSourceOpen] = useState(false);

  async function pickPhoto(source: "camera" | "library") {
    setPhotoSourceOpen(false);
    try {
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 };
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert("Permission needed", "Allow camera access to take a photo."); return; }
        const result = await ImagePicker.launchCameraAsync(options);
        if (result.canceled || result.assets.length === 0) return;
        setPickedPhoto(result.assets[0]);
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert("Permission needed", "Allow photo library access to pick a photo."); return; }
        const result = await ImagePicker.launchImageLibraryAsync(options);
        if (result.canceled || result.assets.length === 0) return;
        setPickedPhoto(result.assets[0]);
      }
    } catch (e: any) {
      Alert.alert("Couldn't add photo", e.message ?? "Unknown error");
    }
  }

  async function create() {
    if (!firstName.trim()) {
      Alert.alert("Name required", "Enter at least a first name.");
      return;
    }
    if (!relationship) {
      Alert.alert("Relationship required", "Pick how this person relates to you.");
      return;
    }
    setSaving(true);
    try {
      const companion = await createCompanion({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        relationship,
        birth_date: birthDate || null,
        israeli_id: israeliId.trim() || null,
        notes: notes.trim() || null,
      });
      if (pickedPhoto) {
        try {
          await setCompanionProfilePhoto(companion, { uri: pickedPhoto.uri, fileName: "avatar.jpg", mimeType: pickedPhoto.mimeType ?? "image/jpeg" });
        } catch (e: any) {
          Alert.alert("Companion created, but the photo didn't upload", e.message ?? "You can add it from the companion's page.");
        }
      }
      router.replace(`/doctracker/${companion.id}`);
    } catch (e: any) {
      Alert.alert("Couldn't create companion", e.message ?? "Unknown error");
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SubpageHeader title="Add companion" />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Pressable style={styles.profileRow} onPress={() => setPhotoSourceOpen(true)}>
          {pickedPhoto ? (
            <Image source={{ uri: pickedPhoto.uri }} style={styles.profileImg} />
          ) : (
            <View style={styles.profilePlaceholder}><Icon name="user" size={28} color={colors.inkSoft} /></View>
          )}
          <Text style={styles.profileChangeText}>{pickedPhoto ? "Change photo" : "Add photo"}</Text>
        </Pressable>

        <Text style={styles.label}>First name</Text>
        <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="First name" autoFocus />

        <Text style={styles.label}>Last name</Text>
        <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="Last name" />

        <View style={{ marginTop: 4 }}>
          <DateField label="Birth date" value={birthDate} onChange={setBirthDate} />
        </View>

        <Text style={styles.label}>Relationship</Text>
        <View style={styles.chipRow}>
          {RELATIONSHIP_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.chip, relationship === opt.value && styles.chipActive]}
              onPress={() => setRelationship(opt.value)}
            >
              <Text style={[styles.chipText, relationship === opt.value && styles.chipTextActive]}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Israeli ID#</Text>
        <TextInput style={styles.input} value={israeliId} onChangeText={setIsraeliId} placeholder="Optional" keyboardType="numeric" />

        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional notes…"
          multiline
        />

        <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={create} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? "Creating…" : "Create"}</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={photoSourceOpen} transparent animationType="fade" onRequestClose={() => setPhotoSourceOpen(false)}>
        <Pressable style={styles.photoSourceBackdrop} onPress={() => setPhotoSourceOpen(false)}>
          <Pressable style={styles.photoSourceSheet} onPress={(e) => e.stopPropagation()}>
            <Pressable style={styles.photoSourceOption} onPress={() => pickPhoto("camera")}>
              <Icon name="camera" size={20} color={colors.blue} />
              <Text style={styles.photoSourceOptionText}>Take Photo</Text>
            </Pressable>
            <View style={styles.photoSourceDivider} />
            <Pressable style={styles.photoSourceOption} onPress={() => pickPhoto("library")}>
              <Icon name="gallery" size={20} color={colors.blue} />
              <Text style={styles.photoSourceOptionText}>Choose from Library</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  label: {
    color: colors.inkSoft, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5,
    marginTop: 14, marginBottom: 6,
  },
  input: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12,
  },
  chipActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { color: colors.ink, fontSize: 12.5, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  saveBtn: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 24 },
  saveBtnText: { color: colors.paper, fontWeight: "700", fontSize: 15 },
  profileRow: { alignItems: "center", marginBottom: 12, gap: 8 },
  profileImg: { width: 84, height: 84, borderRadius: 42 },
  profilePlaceholder: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center",
  },
  profileChangeText: { color: colors.blue, fontWeight: "600", fontSize: 13 },
  photoSourceBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.5)", justifyContent: "flex-end" },
  photoSourceSheet: {
    backgroundColor: colors.paperRaised, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 8, paddingBottom: 24, width: "100%", maxWidth: 480, alignSelf: "center",
  },
  photoSourceOption: { flexDirection: "row", alignItems: "center", gap: 12, padding: 18 },
  photoSourceOptionText: { color: colors.ink, fontWeight: "600", fontSize: 15 },
  photoSourceDivider: { height: 1, backgroundColor: colors.line, marginHorizontal: 18 },
});
