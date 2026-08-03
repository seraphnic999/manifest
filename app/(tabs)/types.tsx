import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/lib/theme";

// TODO: filter chips per ItemType (flight/lodging/transfer/...) across the
// active trip, querying `items` with `.eq('type', selected)`.
export default function TypesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>By Type</Text>
      <Text style={styles.body}>Flights, lodging, and other item-type views go here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: 20 },
  title: { color: colors.ink, fontWeight: "800", fontSize: 24, marginBottom: 8 },
  body: { color: colors.inkSoft, fontSize: 14 },
});
