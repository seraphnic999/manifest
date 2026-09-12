import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, FlatList, TextInput } from "react-native";
import { colors, radius, fonts } from "@/lib/theme";
import Icon from "@/components/icons/Icon";
import { City } from "@/lib/types";
import { fetchAllCities, searchCities } from "@/lib/cities";

export interface CityPick {
  cityId: string | null;
  customName: string | null; // set only for a free-text destination not in the dataset
  label: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  selected: CityPick[];
  onChange: (next: CityPick[]) => void;
  onMakePrimary: (index: number) => void;
}

export default function CityPickerModal({ visible, onClose, selected, onChange, onMakePrimary }: Props) {
  const [cities, setCities] = useState<City[]>([]);
  const [query, setQuery] = useState("");
  const [customInput, setCustomInput] = useState("");

  useEffect(() => {
    if (visible && cities.length === 0) {
      fetchAllCities().then(setCities);
    }
  }, [visible, cities.length]);

  const results = searchCities(cities, query);

  function toggleCity(city: City) {
    const already = selected.some((p) => p.cityId === city.id);
    if (already) {
      onChange(selected.filter((p) => p.cityId !== city.id));
    } else {
      onChange([...selected, { cityId: city.id, customName: null, label: city.name }]);
    }
  }

  function addCustom() {
    const name = customInput.trim();
    if (!name) return;
    onChange([...selected, { cityId: null, customName: name, label: name }]);
    setCustomInput("");
  }

  function removePick(pick: CityPick) {
    onChange(selected.filter((p) => p !== pick));
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Destinations</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.modalDone}>Done</Text>
          </Pressable>
        </View>

        {selected.length > 0 && (
          <View style={styles.selectedRow}>
            {selected.map((p, i) => (
              <View key={p.cityId ?? `custom-${i}`} style={styles.selectedChip}>
                <Text style={[styles.selectedChipText, i === 0 && styles.selectedChipTextPrimary]} numberOfLines={1}>
                  {p.label}
                </Text>
                {i !== 0 && (
                  <Pressable onPress={() => onMakePrimary(i)} hitSlop={8}>
                    <Text style={styles.selectedChipPrime}>Prime</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => removePick(p)} hitSlop={8}>
                  <Text style={styles.selectedChipRemove}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <View style={styles.searchRow}>
          <Icon name="search" size={20} color={colors.blue} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by city or country…"
            placeholderTextColor={colors.inkSoft}
          />
        </View>

        <FlatList
          data={results}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 16 }}
          ListEmptyComponent={<Text style={styles.empty}>No cities match "{query}" yet.</Text>}
          renderItem={({ item }) => {
            const isSelected = selected.some((p) => p.cityId === item.id);
            return (
              <Pressable style={styles.row} onPress={() => toggleCity(item)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowCity}>{item.name}</Text>
                  <Text style={styles.rowCountry}>{item.country}</Text>
                </View>
                {isSelected && (
                  <View style={styles.rowCheck}><Icon name="check" size={14} color="#fff" /></View>
                )}
              </Pressable>
            );
          }}
          ListFooterComponent={
            <View style={styles.customRow}>
              <Text style={styles.customLabel}>Not listed? Add a custom destination:</Text>
              <View style={styles.customInputRow}>
                <TextInput
                  style={styles.customInput}
                  value={customInput}
                  onChangeText={setCustomInput}
                  placeholder="e.g. Faroe Islands"
                  placeholderTextColor={colors.inkSoft}
                  onSubmitEditing={addCustom}
                />
                <Pressable style={styles.customAddButton} onPress={addCustom}>
                  <Text style={styles.customAddButtonText}>Add</Text>
                </Pressable>
              </View>
            </View>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, backgroundColor: colors.paper },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 16, paddingTop: 54, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.paperRaised,
  },
  modalTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  modalDone: { color: colors.blue, fontFamily: fonts.bodySemi, fontSize: 15 },
  selectedRow: {
    flexDirection: "row", flexWrap: "wrap", gap: 6, padding: 12, paddingBottom: 4,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  selectedChip: {
    flexDirection: "row", alignItems: "center", gap: 6, maxWidth: 220,
    backgroundColor: colors.blue, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 10,
  },
  selectedChipText: { color: "#fff", fontSize: 12.5, fontWeight: "600", flexShrink: 1 },
  selectedChipTextPrimary: { fontWeight: "800" },
  selectedChipPrime: { color: "#fff", fontSize: 11.5, fontWeight: "600", textDecorationLine: "underline" },
  selectedChipRemove: { color: "#fff", fontSize: 16, fontWeight: "700", lineHeight: 16 },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8, margin: 16, marginBottom: 4,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, color: colors.ink, fontSize: 14, padding: 0 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  rowCity: { color: colors.ink, fontFamily: fonts.bodySemi, fontSize: 14.5 },
  rowCountry: { color: colors.inkSoft, fontSize: 12, marginTop: 1 },
  rowCheck: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: colors.blue,
    alignItems: "center", justifyContent: "center",
  },
  empty: { textAlign: "center", color: colors.inkSoft, marginTop: 40, paddingHorizontal: 24 },
  customRow: { padding: 16, paddingTop: 12 },
  customLabel: { color: colors.inkSoft, fontSize: 12, marginBottom: 8 },
  customInputRow: { flexDirection: "row", gap: 8 },
  customInput: {
    flex: 1, backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 10, fontSize: 14, color: colors.ink,
  },
  customAddButton: { backgroundColor: colors.lightBlue, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 16, justifyContent: "center" },
  customAddButtonText: { color: "#fff", fontWeight: "700" },
});
