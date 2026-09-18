import { useMemo } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { Stack, useRouter } from "expo-router";
import { radius, fonts, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import SubpageHeader from "@/components/SubpageHeader";
import Icon from "@/components/icons/Icon";
import { Alert } from "@/lib/alert";
import { formatDateDDMMYYYY, localIsoDate } from "@/lib/dateFormat";
import { documentTypeIcon, documentTypeLabel } from "@/lib/travelDocuments";
import { DocumentExpiryWarning, useAllDocumentExpiryWarnings, dismissExpiryWarning } from "@/lib/documentExpiry";
import { EntryRequirementWarning, useAllEntryRequirementWarnings, dismissEntryRequirementWarning } from "@/lib/entryRequirements";

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

function confirmThenDismiss(note: string, onConfirm: () => void) {
  Alert.alert("Dismiss this warning?", note, [
    { text: "Cancel", style: "cancel" },
    { text: "Dismiss", style: "destructive", onPress: onConfirm },
  ]);
}

function ExpiryRow({ warning, onDismiss }: { warning: DocumentExpiryWarning; onDismiss: () => void }) {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dismissed = !!warning.dismissed_at;

  return (
    <Pressable style={[styles.row, dismissed && styles.rowDismissed]} onPress={() => router.push(`/doctracker/${warning.companion_id}`)}>
      <View style={styles.rowIcon}>
        <Icon name={documentTypeIcon(warning.document_type)} size={20} color={dismissed ? colors.inkSoft : colors.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, dismissed && styles.rowTextDismissed]}>
          {warning.companion_name}'s {documentTypeLabel(warning.document_type)}
        </Text>
        <Text style={[styles.rowSub, dismissed && styles.rowTextDismissed]}>
          {urgencyLabel(warning.expiry_date)} · {formatDateDDMMYYYY(warning.expiry_date)}
        </Text>
      </View>
      {!dismissed && (
        <Pressable
          style={styles.dismissBtn}
          hitSlop={8}
          onPress={() => confirmThenDismiss("It won't be shown again unless this document's expiry date changes.", onDismiss)}
        >
          <Text style={styles.dismissBtnText}>Dismiss</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

function EntryRow({ warning, onDismiss }: { warning: EntryRequirementWarning; onDismiss: () => void }) {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dismissed = !!warning.dismissed_at;

  return (
    <Pressable style={[styles.row, dismissed && styles.rowDismissed]} onPress={() => router.push(`/doctracker/${warning.companion_id}`)}>
      <View style={styles.rowIcon}>
        <Icon name="flag" size={20} color={dismissed ? colors.inkSoft : colors.coral} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, dismissed && styles.rowTextDismissed]}>
          {warning.companion_name} — {warning.country}
        </Text>
        <Text style={[styles.rowSub, dismissed && styles.rowTextDismissed]}>{warning.requirement_description}</Text>
        <Text style={[styles.rowSub, dismissed && styles.rowTextDismissed]}>{warning.trip_name}</Text>
      </View>
      {!dismissed && (
        <Pressable
          style={styles.dismissBtn}
          hitSlop={8}
          onPress={() => confirmThenDismiss("It stays logged here, greyed out, until that trip's entry validation is run again.", onDismiss)}
        >
          <Text style={styles.dismissBtnText}>Dismiss</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

export default function DocumentAnalysis() {
  const { warnings: expiryWarnings, reload: reloadExpiry } = useAllDocumentExpiryWarnings();
  const { warnings: entryWarnings, reload: reloadEntry } = useAllEntryRequirementWarnings();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  async function handleDismissExpiry(documentId: string) {
    const error = await dismissExpiryWarning(documentId);
    if (error) { Alert.alert("Couldn't dismiss", error); return; }
    reloadExpiry();
  }

  async function handleDismissEntry(id: string) {
    const error = await dismissEntryRequirementWarning(id);
    if (error) { Alert.alert("Couldn't dismiss", error); return; }
    reloadEntry();
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SubpageHeader title="Document Analysis" />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.sectionLabel}>Expiring Documents</Text>
        {expiryWarnings.length === 0 && <Text style={styles.empty}>No expiring documents right now.</Text>}
        {expiryWarnings.map((w) => (
          <ExpiryRow key={w.document_id} warning={w} onDismiss={() => handleDismissExpiry(w.document_id)} />
        ))}

        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Entry Requirements</Text>
        {entryWarnings.length === 0 && <Text style={styles.empty}>No entry-requirement warnings right now.</Text>}
        {entryWarnings.map((w) => (
          <EntryRow key={w.id} warning={w} onDismiss={() => handleDismissEntry(w.id)} />
        ))}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  sectionLabel: {
    color: colors.inkSoft, fontFamily: fonts.bodyBold, fontSize: 11.5, textTransform: "uppercase",
    letterSpacing: 1, marginBottom: 8,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 12, marginBottom: 8,
  },
  rowDismissed: { opacity: 0.5 },
  rowIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.goldSoft,
    alignItems: "center", justifyContent: "center",
  },
  rowTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14.5 },
  rowSub: { color: colors.inkSoft, fontSize: 12.5, marginTop: 2 },
  rowTextDismissed: { color: colors.inkSoft },
  dismissBtn: { paddingVertical: 8, paddingHorizontal: 10 },
  dismissBtnText: { color: colors.coral, fontFamily: fonts.bodySemi, fontSize: 13 },
  empty: { color: colors.inkSoft, fontStyle: "italic", fontSize: 13.5, textAlign: "center", marginBottom: 12 },
});
