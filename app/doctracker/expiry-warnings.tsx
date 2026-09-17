import { useMemo } from "react";
import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { Stack, useRouter } from "expo-router";
import { radius, fonts, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import SubpageHeader from "@/components/SubpageHeader";
import Icon from "@/components/icons/Icon";
import { Alert } from "@/lib/alert";
import { formatDateDDMMYYYY, localIsoDate } from "@/lib/dateFormat";
import { documentTypeIcon, documentTypeLabel } from "@/lib/travelDocuments";
import { DocumentExpiryWarning, useDocumentExpiryWarnings, dismissExpiryWarning } from "@/lib/documentExpiry";

function daysUntil(dateIso: string): number {
  const today = new Date(`${localIsoDate()}T00:00:00`);
  const target = new Date(`${dateIso}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function urgencyLabel(dateIso: string): string {
  const days = daysUntil(dateIso);
  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  if (days === 0) return "Expires today";
  return `Expires in ${days} day${days === 1 ? "" : "s"}`;
}

function WarningRow({ warning, onDismiss }: { warning: DocumentExpiryWarning; onDismiss: () => void }) {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  function confirmDismiss() {
    Alert.alert(
      "Dismiss this warning?",
      "It won't be shown again unless this document's expiry date changes.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Dismiss", style: "destructive", onPress: onDismiss },
      ]
    );
  }

  return (
    <Pressable style={styles.row} onPress={() => router.push(`/doctracker/${warning.companion_id}`)}>
      <View style={styles.rowIcon}>
        <Icon name={documentTypeIcon(warning.document_type)} size={20} color={colors.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{warning.companion_name}'s {documentTypeLabel(warning.document_type)}</Text>
        <Text style={styles.rowSub}>{urgencyLabel(warning.expiry_date)} · {formatDateDDMMYYYY(warning.expiry_date)}</Text>
      </View>
      <Pressable style={styles.dismissBtn} onPress={confirmDismiss} hitSlop={8}>
        <Text style={styles.dismissBtnText}>Dismiss</Text>
      </Pressable>
    </Pressable>
  );
}

export default function ExpiryWarnings() {
  const { warnings, reload } = useDocumentExpiryWarnings();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  async function handleDismiss(documentId: string) {
    const error = await dismissExpiryWarning(documentId);
    if (error) { Alert.alert("Couldn't dismiss", error); return; }
    reload();
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SubpageHeader title="Expiring Documents" />
      <FlatList
        contentContainerStyle={{ padding: 16 }}
        data={warnings}
        keyExtractor={(w) => w.document_id}
        renderItem={({ item }) => <WarningRow warning={item} onDismiss={() => handleDismiss(item.document_id)} />}
        ListEmptyComponent={<Text style={styles.empty}>No expiring documents right now.</Text>}
      />
    </View>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 12, marginBottom: 8,
  },
  rowIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.goldSoft,
    alignItems: "center", justifyContent: "center",
  },
  rowTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14.5 },
  rowSub: { color: colors.inkSoft, fontSize: 12.5, marginTop: 2 },
  dismissBtn: { paddingVertical: 8, paddingHorizontal: 10 },
  dismissBtnText: { color: colors.coral, fontFamily: fonts.bodySemi, fontSize: 13 },
  empty: { color: colors.inkSoft, fontStyle: "italic", fontSize: 13.5, textAlign: "center", marginTop: 40 },
});
