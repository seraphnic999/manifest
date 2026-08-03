import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/lib/theme";

// TODO: sum expenses (converted to NIS via trip_currencies.rate_to_nis),
// group allocations by party_id for the "owed by" rollup.
export default function MoneyScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Money</Text>
      <Text style={styles.body}>Expense totals and owed-by-party rollup go here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: 20 },
  title: { color: colors.ink, fontWeight: "800", fontSize: 24, marginBottom: 8 },
  body: { color: colors.inkSoft, fontSize: 14 },
});
