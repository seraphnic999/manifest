import { View, Text, Pressable, Modal, StyleSheet, ScrollView } from "react-native";
import { colors, radius } from "@/lib/theme";
import Icon, { IconName, MAP_PICKER_ICONS } from "@/components/icons/Icon";

export const MAP_ICON_LABELS: Partial<Record<IconName, string>> = {
  flight: "Flight", transfer: "Transfer", transport: "Transport", ship: "Ship",
  lodging: "Lodging", dining: "Restaurant", cafe: "Café", cocktail: "Cocktail",
  shopping: "Shopping", activity: "Mountain", museum: "Museum", star: "Highlight",
  work: "Work", user: "Traveler", locate: "Place", budget: "Money", other: "Other",
  stadium: "Stadium", soccer: "Soccer", bus: "Bus", beer: "Beer", gym: "Gym", tent: "Tent",
  hiking: "Hiking", swimmingPool: "Swimming Pool", beach: "Beach", spa: "Spa", music: "Music",
  burger: "Burger", iceCream: "Ice Cream", supermarketCart: "Supermarket", flag: "Activity",
  medical: "Medical", amusementPark: "Amusement Park", cinema: "Cinema", theater: "Theater",
  pizza: "Pizza", steak: "Steak", dollarSign: "Cash", parking: "Parking", park: "Park",
  obelisk: "Obelisk", castle: "Castle", signpost: "Signpost", club: "Club",
  carRental: "Car Rental", footprints: "Walking Route", scenicOverlook: "Scenic Overlook",
};

/** Grid picker for an item's map marker icon — a curated subset of the full
 * icon set (see MAP_PICKER_ICONS), since weather/chrome icons like "back"
 * or "menu" don't make sense as a place on a map. `defaultIcon` is the
 * item-type category's own icon, shown first as the "use default" tile. */
export default function MapIconPickerModal({
  visible, onClose, onSelect, defaultIcon, selected,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (icon: IconName | null) => void;
  defaultIcon: IconName;
  selected: IconName | null;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Map icon</Text>
          <ScrollView contentContainerStyle={styles.grid}>
            <Pressable style={styles.tile} onPress={() => onSelect(null)}>
              <View style={[styles.iconCircle, !selected && styles.iconCircleActive]}>
                <Icon name={defaultIcon} size={26} color="#fff" />
              </View>
              <Text style={styles.tileLabel}>Default</Text>
            </Pressable>
            {MAP_PICKER_ICONS.map((name) => (
              <Pressable key={name} style={styles.tile} onPress={() => onSelect(name)}>
                <View style={[styles.iconCircle, selected === name && styles.iconCircleActive]}>
                  <Icon name={name} size={26} color="#fff" />
                </View>
                <Text style={styles.tileLabel}>{MAP_ICON_LABELS[name] ?? name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const TILE_SIZE = "31%";

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.ink, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: "70%",
    width: "100%", maxWidth: 480, alignSelf: "center",
  },
  title: {
    color: colors.paper, fontFamily: "Poppins_700Bold" as any, fontWeight: "800",
    fontSize: 18, marginBottom: 16, textAlign: "center",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10 },
  tile: {
    width: TILE_SIZE, backgroundColor: "#2A3B4D", borderRadius: radius.lg,
    paddingVertical: 18, alignItems: "center", marginBottom: 10,
  },
  iconCircle: {
    width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center",
    marginBottom: 10, backgroundColor: colors.blue,
  },
  iconCircleActive: { borderWidth: 3, borderColor: colors.gold },
  tileLabel: { color: colors.paper, fontSize: 13, fontWeight: "600" },
});
