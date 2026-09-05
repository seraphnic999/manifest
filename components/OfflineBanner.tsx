import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/lib/theme";

function formatAgo(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Shown whenever a screen is offline and rendering a query's persisted cache. */
export default function OfflineBanner({ dataUpdatedAt }: { dataUpdatedAt: number | undefined }) {
  if (!dataUpdatedAt) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Offline — viewing cached data from {formatAgo(dataUpdatedAt)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.amberSoft, paddingVertical: 6, paddingHorizontal: 12 },
  text: { color: "#7A521A", fontSize: 11, fontWeight: "600", textAlign: "center" },
});
