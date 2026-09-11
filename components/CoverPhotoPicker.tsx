import { useState } from "react";
import { View, Text, Image, Pressable, StyleSheet, Modal, FlatList, TextInput } from "react-native";
import { colors, radius, fonts } from "@/lib/theme";
import Icon from "@/components/icons/Icon";
import {
  DESTINATION_PHOTOS, FALLBACK_COVER_PHOTO, coverPhotoSource, searchDestinationPhotos,
} from "@/lib/destinationPhotos";

export default function CoverPhotoPicker({
  value, onChange,
}: { value: string | null; onChange: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = searchDestinationPhotos(query);
  const selected = value ? DESTINATION_PHOTOS.find((p) => p.id === value) : undefined;

  return (
    <>
      <Pressable style={styles.button} onPress={() => setOpen(true)}>
        <Image source={coverPhotoSource(value)} style={styles.thumb} />
        <View style={{ flex: 1 }}>
          <Text style={styles.buttonTitle}>{selected ? selected.city : "Choose cover photo"}</Text>
          <Text style={styles.buttonSub}>
            {selected ? selected.country : "Optional — a generic placeholder is used until you pick one"}
          </Text>
        </View>
        <Icon name="edit" size={22} color={colors.blue} />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Cover photo</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}>
              <Text style={styles.modalDone}>Done</Text>
            </Pressable>
          </View>

          <View style={styles.searchRow}>
            <Icon name="search" size={22} color={colors.blue} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search by city or country…"
              placeholderTextColor={colors.inkSoft}
            />
          </View>

          <Pressable
            style={styles.clearRow}
            onPress={() => { onChange(null); setOpen(false); }}
          >
            <Image source={FALLBACK_COVER_PHOTO} style={styles.clearThumb} />
            <Text style={styles.clearText}>Use default placeholder</Text>
            {!value && <Icon name="check" size={20} color={colors.blue} />}
          </Pressable>

          <FlatList
            data={results}
            numColumns={2}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ padding: 16, paddingTop: 4 }}
            columnWrapperStyle={{ gap: 12 }}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            ListEmptyComponent={
              <Text style={styles.empty}>No cities match "{query}" yet — more get added as the photo set grows.</Text>
            }
            renderItem={({ item }) => (
              <Pressable
                style={[styles.tile, value === item.id && styles.tileActive]}
                onPress={() => { onChange(item.id); setOpen(false); }}
              >
                <Image source={item.source} style={styles.tileImg} resizeMode="cover" />
                <View style={styles.tileLabel}>
                  <Text style={styles.tileCity} numberOfLines={1}>{item.city}</Text>
                  <Text style={styles.tileCountry} numberOfLines={1}>{item.country}</Text>
                </View>
                {value === item.id && (
                  <View style={styles.tileCheck}><Icon name="check" size={16} color="#fff" /></View>
                )}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 10,
  },
  thumb: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: colors.paper },
  buttonTitle: { color: colors.ink, fontFamily: fonts.bodySemi, fontSize: 14 },
  buttonSub: { color: colors.inkSoft, fontSize: 11.5, marginTop: 2 },

  modalRoot: { flex: 1, backgroundColor: colors.paper },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 16, paddingTop: 54, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.paperRaised,
  },
  modalTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  modalDone: { color: colors.blue, fontFamily: fonts.bodySemi, fontSize: 15 },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8, margin: 16, marginBottom: 8,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, color: colors.ink, fontSize: 14, padding: 0 },
  clearRow: {
    flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 8,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 8,
  },
  clearThumb: { width: 36, height: 36, borderRadius: radius.sm },
  clearText: { flex: 1, color: colors.ink, fontFamily: fonts.bodySemi, fontSize: 13 },
  tile: {
    flex: 1, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line,
  },
  tileActive: { borderColor: colors.blue, borderWidth: 2 },
  tileImg: { width: "100%", height: 110 },
  tileLabel: { padding: 8 },
  tileCity: { color: colors.ink, fontFamily: fonts.bodySemi, fontSize: 12.5 },
  tileCountry: { color: colors.inkSoft, fontSize: 10.5, marginTop: 1 },
  tileCheck: {
    position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.blue, alignItems: "center", justifyContent: "center",
  },
  empty: { textAlign: "center", color: colors.inkSoft, marginTop: 40, paddingHorizontal: 24 },
});
