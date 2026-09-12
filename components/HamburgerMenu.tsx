import { useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal } from "react-native";
import { colors, radius, fonts } from "@/lib/theme";
import Icon, { IconName } from "@/components/icons/Icon";

export interface HamburgerMenuItem {
  icon: IconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
}

/** The top-right hamburger button + its dropdown sheet. `solid` renders the
 * button on a plain surface (Home); the default (translucent-on-photo)
 * variant is for the trip cover-photo header. `size` matches the button to
 * whatever sits beside it (defaults to 40, the trip header's own buttons). */
export default function HamburgerMenu({
  items, solid, sheetTop = 66, size = 40,
}: { items: HamburgerMenuItem[]; solid?: boolean; sheetTop?: number; size?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        style={[
          styles.btn, solid ? styles.btnSolid : styles.btnOnPhoto,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
        onPress={() => setOpen(true)}
        accessibilityLabel="Menu"
        hitSlop={6}
      >
        <Icon name="menu" size={25} color={solid ? colors.blue : "#fff"} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={[styles.sheet, { top: sheetTop }]}>
            {items.map((item, i) => (
              <Pressable
                key={item.label}
                style={[styles.row, i > 0 && styles.rowBorder]}
                onPress={() => { setOpen(false); item.onPress(); }}
              >
                <Icon name={item.icon} size={26} color={item.danger ? colors.coral : colors.blue} />
                <Text style={[styles.rowText, item.danger && { color: colors.coral }]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
  },
  btnSolid: { backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line },
  btnOnPhoto: { backgroundColor: "rgba(11,30,63,0.4)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)" },
  backdrop: { flex: 1, backgroundColor: "rgba(11,30,63,0.35)" },
  sheet: {
    position: "absolute", right: 14, width: 224, backgroundColor: colors.paperRaised,
    borderRadius: radius.lg, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  rowText: { color: colors.ink, fontFamily: fonts.bodySemi, fontSize: 15 },
});
