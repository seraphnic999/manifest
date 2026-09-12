import { useState } from "react";
import { View, Text, Pressable, StyleSheet, TextInput, ScrollView } from "react-native";
import { Stack, useRouter } from "expo-router";
import SubpageHeader from "@/components/SubpageHeader";
import { colors, radius } from "@/lib/theme";
import { Alert } from "@/lib/alert";
import { Relationship } from "@/lib/types";
import { RELATIONSHIP_OPTIONS, createCompanion } from "@/lib/companions";
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
});
