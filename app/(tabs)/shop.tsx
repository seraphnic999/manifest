import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/lib/theme";

// TODO: shopping_list_items for the active trip; "bought" = has a linked
// allocation; show per-item-linked view and full trip list.
export default function ShopScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Shopping List</Text>
      <Text style={styles.body}>Trip-wide and per-activity shopping items go here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: 20 },
  title: { color: colors.ink, fontWeight: "800", fontSize: 24, marginBottom: 8 },
  body: { color: colors.inkSoft, fontSize: 14 },
});
