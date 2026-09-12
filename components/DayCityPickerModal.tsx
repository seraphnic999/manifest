import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, FlatList, TextInput } from "react-native";
import { colors, radius, fonts } from "@/lib/theme";
import Icon from "@/components/icons/Icon";
import { City } from "@/lib/types";
import { fetchAllCities, searchCities, TripCityRow, primaryTripCity } from "@/lib/cities";
import { CityPick } from "@/components/CityPickerModal";

interface Props {
  visible: boolean;
  onClose: () => void;
  tripCities: TripCityRow[]; // this trip's already-picked destinations, shown as quick-picks
  current: CityPick | null; // this day's current override, or null if inheriting the trip's primary city
  onSelect: (pick: CityPick | null) => void; // null = clear the override (inherit primary again)
}

/** Single-select "which city is this day in" picker — quick-picks from the
 * trip's own destinations first, then a search across the full dataset (or
 * a custom name) for a destination not yet on the trip. Unlike
 * CityPickerModal (multi-select, edits the trip's own destination list
 * directly), this only returns a pick to the caller; the day-edit screen
 * decides when to actually persist it (bundled with title/color, on Save),
 * including adding a newly-picked city to the trip if it wasn't already
 * one of its destinations. */
export default function DayCityPickerModal({ visible, onClose, tripCities, current, onSelect }: Props) {
  const [cities, setCities] = useState<City[]>([]);
  const [query, setQuery] = useState("");
  const [customInput, setCustomInput] = useState("");
  const [browsing, setBrowsing] = useState(false);

  useEffect(() => {
    if (visible && cities.length === 0) {
      fetchAllCities().then(setCities);
    }
    if (!visible) setBrowsing(false);
  }, [visible, cities.length]);

  const results = searchCities(cities, query);
  const primary = primaryTripCity(tripCities);

  function pick(p: CityPick) {
    onSelect(p);
    onClose();
  }

  function addCustom() {
    const name = customInput.trim();
    if (!name) return;
    pick({ cityId: null, customName: name, label: name });
    setCustomInput("");
  }

  const isCurrentPick = (p: { cityId: string | null; customName: string | null }) =>
    !!current && current.cityId === p.cityId && current.customName === p.customName;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Day city</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.modalDone}>Done</Text>
          </Pressable>
        </View>

        {!browsing ? (
          <FlatList
            data={tripCities}
            keyExtractor={(r) => r.id}
            contentContainerStyle={{ padding: 16 }}
            ListHeaderComponent={
              <>
                {primary && (
                  <Pressable style={[styles.row, !current && styles.rowActive]} onPress={() => { onSelect(null); onClose(); }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowCity}>Use trip's primary city</Text>
                      <Text style={styles.rowCountry}>{primary.city?.name ?? primary.custom_name}</Text>
                    </View>
                    {!current && <View style={styles.rowCheck}><Icon name="check" size={14} color="#fff" /></View>}
                  </Pressable>
                )}
                {tripCities.length > 0 && <Text style={styles.sectionLabel}>This trip's destinations</Text>}
              </>
            }
            renderItem={({ item }) => {
              const p = { cityId: item.city_id, customName: item.custom_name };
              const label = item.city?.name ?? item.custom_name ?? "";
              const active = isCurrentPick(p);
              return (
                <Pressable style={[styles.row, active && styles.rowActive]} onPress={() => pick({ ...p, label })}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowCity}>{label}</Text>
                    {item.city && <Text style={styles.rowCountry}>{item.city.country}</Text>}
                  </View>
                  {active && <View style={styles.rowCheck}><Icon name="check" size={14} color="#fff" /></View>}
                </Pressable>
              );
            }}
            ListFooterComponent={
              <Pressable style={styles.browseButton} onPress={() => setBrowsing(true)}>
                <Text style={styles.browseButtonText}>+ Add a different city</Text>
              </Pressable>
            }
          />
        ) : (
          <>
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
                const active = isCurrentPick({ cityId: item.id, customName: null });
                return (
                  <Pressable style={styles.row} onPress={() => pick({ cityId: item.id, customName: null, label: item.name })}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowCity}>{item.name}</Text>
                      <Text style={styles.rowCountry}>{item.country}</Text>
                    </View>
                    {active && <View style={styles.rowCheck}><Icon name="check" size={14} color="#fff" /></View>}
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
          </>
        )}
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
  sectionLabel: {
    color: colors.inkSoft, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5,
    marginTop: 8, marginBottom: 4,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, marginBottom: 6,
  },
  rowActive: { borderColor: colors.blue, borderWidth: 2 },
  rowCity: { color: colors.ink, fontFamily: fonts.bodySemi, fontSize: 14.5 },
  rowCountry: { color: colors.inkSoft, fontSize: 12, marginTop: 1 },
  rowCheck: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: colors.blue,
    alignItems: "center", justifyContent: "center",
  },
  browseButton: {
    backgroundColor: colors.lightBlue, borderRadius: radius.md, paddingVertical: 12,
    alignItems: "center", marginTop: 10,
  },
  browseButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8, margin: 16, marginBottom: 4,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, color: colors.ink, fontSize: 14, padding: 0 },
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
