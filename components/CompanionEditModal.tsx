import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, TextInput, ScrollView, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors, radius, fonts } from "@/lib/theme";
import Icon from "@/components/icons/Icon";
import { Alert } from "@/lib/alert";
import { Companion, CompanionPhoto, Relationship } from "@/lib/types";
import {
  RELATIONSHIP_OPTIONS, saveCompanion, setCompanionProfilePhoto, addCompanionPhoto,
  deleteCompanionPhoto, fetchCompanionProfileUrl, fetchCompanionPhotosWithUrls,
} from "@/lib/companions";
import { DateField } from "@/components/DateTimeFields";
import PhotoLightbox from "@/components/PhotoLightbox";

interface Props {
  visible: boolean;
  onClose: () => void;
  companion: Companion;
  onSaved: () => void; // caller refetches — photo/text edits both land here
}

export default function CompanionEditModal({ visible, onClose, companion, onSaved }: Props) {
  const [firstName, setFirstName] = useState(companion.first_name);
  const [lastName, setLastName] = useState(companion.last_name);
  const [birthDate, setBirthDate] = useState(companion.birth_date ?? "");
  const [relationship, setRelationship] = useState<Relationship | null>(companion.relationship);
  const [notes, setNotes] = useState(companion.notes ?? "");
  const [israeliId, setIsraeliId] = useState(companion.israeli_id ?? "");
  const [saving, setSaving] = useState(false);

  const [profileUrl, setProfileUrl] = useState<string | null>(null);
  const [photos, setPhotos] = useState<(CompanionPhoto & { url: string })[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [photoSourceFor, setPhotoSourceFor] = useState<"profile" | "additional" | null>(null);

  useEffect(() => {
    if (!visible) return;
    setFirstName(companion.first_name);
    setLastName(companion.last_name);
    setBirthDate(companion.birth_date ?? "");
    setRelationship(companion.relationship);
    setNotes(companion.notes ?? "");
    setIsraeliId(companion.israeli_id ?? "");
    fetchCompanionProfileUrl(companion.profile_photo_path).then(setProfileUrl);
    fetchCompanionPhotosWithUrls(companion.id).then(setPhotos);
  }, [visible, companion]);

  async function pickAndUpload(
    source: "camera" | "library",
    options: ImagePicker.ImagePickerOptions,
    onPicked: (asset: ImagePicker.ImagePickerAsset) => Promise<void>
  ) {
    try {
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Allow camera access to take a photo.");
          return;
        }
        const result = await ImagePicker.launchCameraAsync(options);
        if (result.canceled || result.assets.length === 0) return;
        await onPicked(result.assets[0]);
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Allow photo library access to pick a photo.");
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync(options);
        if (result.canceled || result.assets.length === 0) return;
        await onPicked(result.assets[0]);
      }
    } catch (e: any) {
      Alert.alert("Couldn't add photo", e.message ?? "Unknown error");
    }
  }

  function changeProfilePhoto() {
    setPhotoSourceFor("profile");
  }

  async function pickFrom(source: "camera" | "library") {
    const target = photoSourceFor;
    setPhotoSourceFor(null);
    if (!target) return;
    if (target === "profile") {
      // Cropping is handed straight to the OS's own picker/camera UI
      // (allowsEditing + a fixed square aspect) rather than a hand-rolled
      // pan/pinch modal — a previous custom crop step could show one region
      // in its preview and save a different one entirely. The native
      // cropper returns the already-cropped square directly, so there's no
      // separate coordinate math left to get wrong.
      await pickAndUpload(
        source,
        { mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 },
        async (asset) => {
          try {
            await setCompanionProfilePhoto(companion, { uri: asset.uri, fileName: "avatar.jpg", mimeType: asset.mimeType ?? "image/jpeg" });
            // Local URI previews instantly; onSaved() triggers the parent's
            // refetch so the signed storage URL takes over on next load.
            setProfileUrl(asset.uri);
            onSaved();
          } catch (e: any) {
            Alert.alert("Couldn't save photo", e.message ?? "Unknown error");
          }
        }
      );
    } else {
      await pickAndUpload(
        source,
        { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 },
        async (asset) => {
          await addCompanionPhoto(companion.id, asset);
          setPhotos(await fetchCompanionPhotosWithUrls(companion.id));
        }
      );
    }
  }

  function addPhoto() {
    setPhotoSourceFor("additional");
  }

  async function removePhoto(photo: CompanionPhoto) {
    try {
      await deleteCompanionPhoto(photo);
      setPhotos(await fetchCompanionPhotosWithUrls(companion.id));
    } catch (e: any) {
      Alert.alert("Couldn't remove photo", e.message ?? "Unknown error");
    }
  }

  async function save() {
    if (!firstName.trim()) {
      Alert.alert("Name required", "Enter at least a first name.");
      return;
    }
    setSaving(true);
    try {
      await saveCompanion(companion.id, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        birth_date: birthDate || null,
        relationship: companion.is_self ? null : relationship,
        notes: notes.trim() || null,
        israeli_id: israeliId.trim() || null,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert("Couldn't save", e.message ?? "Unknown error");
    }
    setSaving(false);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{companion.is_self ? "My details" : "Edit companion"}</Text>
          <Pressable onPress={onClose} hitSlop={10}><Text style={styles.cancel}>Cancel</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Pressable style={styles.profileRow} onPress={changeProfilePhoto}>
            {profileUrl ? (
              <Image source={{ uri: profileUrl }} style={styles.profileImg} />
            ) : (
              <View style={styles.profilePlaceholder}><Icon name="user" size={28} color={colors.inkSoft} /></View>
            )}
            <Text style={styles.profileChangeText}>Change photo</Text>
          </Pressable>

          <Text style={styles.label}>First name</Text>
          <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="First name" />

          <Text style={styles.label}>Last name</Text>
          <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="Last name" />

          <View style={{ marginTop: 4 }}>
            <DateField label="Birth date" value={birthDate} onChange={setBirthDate} />
          </View>

          {!companion.is_self && (
            <>
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
            </>
          )}

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

          <Text style={styles.label}>Additional photos</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            {photos.map((p, i) => (
              <Pressable key={p.id} style={styles.photoTile} onPress={() => setLightboxIndex(i)}>
                <Image source={{ uri: p.url }} style={styles.photoTileImg} />
                <Pressable style={styles.photoRemoveBtn} onPress={() => removePhoto(p)} hitSlop={8}>
                  <Icon name="trash" size={14} color="#fff" />
                </Pressable>
              </Pressable>
            ))}
            <Pressable style={styles.addPhotoTile} onPress={addPhoto}>
              <Icon name="add" size={22} color={colors.blue} />
            </Pressable>
          </ScrollView>

          <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save"}</Text>
          </Pressable>
        </ScrollView>
      </View>

      <PhotoLightbox
        urls={photos.map((p) => p.url)}
        initialIndex={lightboxIndex ?? 0}
        visible={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
      />

      <Modal visible={photoSourceFor !== null} transparent animationType="fade" onRequestClose={() => setPhotoSourceFor(null)}>
        <Pressable style={styles.photoSourceBackdrop} onPress={() => setPhotoSourceFor(null)}>
          <Pressable style={styles.photoSourceSheet} onPress={(e) => e.stopPropagation()}>
            <Pressable style={styles.photoSourceOption} onPress={() => pickFrom("camera")}>
              <Icon name="camera" size={20} color={colors.blue} />
              <Text style={styles.photoSourceOptionText}>Take Photo</Text>
            </Pressable>
            <View style={styles.photoSourceDivider} />
            <Pressable style={styles.photoSourceOption} onPress={() => pickFrom("library")}>
              <Icon name="gallery" size={20} color={colors.blue} />
              <Text style={styles.photoSourceOptionText}>Choose from Library</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 16, paddingTop: 54, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.paperRaised,
  },
  photoSourceBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.5)", justifyContent: "flex-end" },
  photoSourceSheet: {
    backgroundColor: colors.paperRaised, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 8, paddingBottom: 24, width: "100%", maxWidth: 480, alignSelf: "center",
  },
  photoSourceOption: { flexDirection: "row", alignItems: "center", gap: 12, padding: 18 },
  photoSourceOptionText: { color: colors.ink, fontWeight: "600", fontSize: 15 },
  photoSourceDivider: { height: 1, backgroundColor: colors.line, marginHorizontal: 18 },
  headerTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  cancel: { color: colors.blue, fontFamily: fonts.bodySemi, fontSize: 15 },
  profileRow: { alignItems: "center", marginBottom: 12, gap: 8 },
  profileImg: { width: 84, height: 84, borderRadius: 42 },
  profilePlaceholder: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center",
  },
  profileChangeText: { color: colors.blue, fontFamily: fonts.bodySemi, fontSize: 13 },
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
  photoTile: { width: 72, height: 72, borderRadius: radius.md, marginRight: 8, overflow: "hidden" },
  photoTileImg: { width: "100%", height: "100%" },
  photoRemoveBtn: {
    position: "absolute", top: 3, right: 3, width: 20, height: 20, borderRadius: 10,
    backgroundColor: "rgba(33,47,61,0.7)", alignItems: "center", justifyContent: "center",
  },
  addPhotoTile: {
    width: 72, height: 72, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
    borderStyle: "dashed", alignItems: "center", justifyContent: "center", backgroundColor: colors.paperRaised,
  },
  saveBtn: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 24 },
  saveBtnText: { color: colors.paper, fontWeight: "700", fontSize: 15 },
});
