import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, ScrollView, Image } from "react-native";
import { colors, radius, fonts } from "@/lib/theme";
import Icon from "@/components/icons/Icon";
import Checkbox from "@/components/Checkbox";
import { Companion } from "@/lib/types";
import { fetchCompanions, companionFullName, relationshipLabel, fetchCompanionProfileUrl } from "@/lib/companions";

interface Props {
  visible: boolean;
  onClose: () => void;
  selectedIds: string[];
  onChange: (ids: string[], picked: Companion[]) => void;
}

export default function CompanionPickerModal({ visible, onClose, selectedIds, onChange }: Props) {
  const [companions, setCompanions] = useState<(Companion & { url: string | null })[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));

  useEffect(() => {
    if (!visible) return;
    setSelected(new Set(selectedIds));
    fetchCompanions().then(async (list) => {
      const withUrls = await Promise.all(list.map(async (c) => ({ ...c, url: await fetchCompanionProfileUrl(c.profile_photo_path) })));
      setCompanions(withUrls);
    });
  }, [visible]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function done() {
    const ids = [...selected];
    onChange(ids, companions.filter((c) => selected.has(c.id)));
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Traveling with</Text>
          <Pressable onPress={onClose} hitSlop={10}><Text style={styles.cancel}>Cancel</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {companions.length === 0 && (
            <Text style={styles.empty}>No companions yet — add them from Doc Tracker first.</Text>
          )}
          {companions.map((c) => {
            const checked = selected.has(c.id);
            return (
              <Pressable key={c.id} style={[styles.row, checked && styles.rowChecked]} onPress={() => toggle(c.id)}>
                {c.url ? (
                  <Image source={{ uri: c.url }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}><Icon name="user" size={18} color={colors.inkSoft} /></View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{companionFullName(c)}</Text>
                  <Text style={styles.sub}>{c.is_self ? "Me" : relationshipLabel(c.relationship)}</Text>
                </View>
                <Checkbox checked={checked} />
              </Pressable>
            );
          })}
          <Pressable style={styles.doneBtn} onPress={done}>
            <Text style={styles.doneBtnText}>Done ({selected.size})</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 16, paddingTop: 54, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.paperRaised,
  },
  headerTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  cancel: { color: colors.blue, fontFamily: fonts.bodySemi, fontSize: 15 },
  empty: { color: colors.inkSoft, fontStyle: "italic", fontSize: 13, textAlign: "center", marginTop: 20 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  rowChecked: { borderColor: colors.blue },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.paper,
    borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center",
  },
  name: { color: colors.ink, fontWeight: "600", fontSize: 15 },
  sub: { color: colors.inkSoft, fontSize: 12, marginTop: 1 },
  doneBtn: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 16 },
  doneBtnText: { color: colors.paper, fontWeight: "700", fontSize: 15 },
});
