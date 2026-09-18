import { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { Stack, useRouter } from "expo-router";
import { radius, fonts, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import SubpageHeader from "@/components/SubpageHeader";
import Icon from "@/components/icons/Icon";
import { Alert } from "@/lib/alert";
import { formatDateDDMMYYYY, localIsoDate } from "@/lib/dateFormat";
import { documentTypeIcon, documentTypeLabel } from "@/lib/travelDocuments";
import { sortCompanionsForDisplay } from "@/lib/companions";
import { DocumentExpiryWarning, useAllDocumentExpiryWarnings, dismissExpiryWarning } from "@/lib/documentExpiry";
import { EntryRequirementWarning, useAllEntryRequirementWarnings, dismissEntryRequirementWarning } from "@/lib/entryRequirements";

type Tab = "expiry" | "entry";

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

// One trip's warnings, its companions in the same order the "Who is
// travelling" picker and Doc Tracker's own list use (self, then family by
// age, then friends and others alphabetically) — grouped and ordered here
// rather than in the query, since the sort depends on relating warnings
// from the same trip to each other.
interface TripGroup { trip_id: string; trip_name: string; trip_start_date: string; warnings: EntryRequirementWarning[] }

function groupEntryWarningsByTrip(warnings: EntryRequirementWarning[]): TripGroup[] {
  const groups = new Map<string, TripGroup>();
  for (const w of warnings) {
    let g = groups.get(w.trip_id);
    if (!g) { g = { trip_id: w.trip_id, trip_name: w.trip_name, trip_start_date: w.trip_start_date, warnings: [] }; groups.set(w.trip_id, g); }
    g.warnings.push(w);
  }
  const ordered = [...groups.values()].sort((a, b) => a.trip_start_date.localeCompare(b.trip_start_date));
  for (const g of ordered) {
    const companionsById = new Map<string, { id: string; is_self: boolean; relationship: EntryRequirementWarning["companion_relationship"]; birth_date: string | null; first_name: string }>();
    for (const w of g.warnings) {
      if (!companionsById.has(w.companion_id)) {
        companionsById.set(w.companion_id, {
          id: w.companion_id, is_self: w.companion_is_self,
          relationship: w.companion_relationship, birth_date: w.companion_birth_date, first_name: w.companion_first_name,
        });
      }
    }
    const rank = new Map(sortCompanionsForDisplay([...companionsById.values()]).map((c, i) => [c.id, i]));
    g.warnings.sort((a, b) => {
      const r = (rank.get(a.companion_id) ?? 0) - (rank.get(b.companion_id) ?? 0);
      return r !== 0 ? r : a.requirement_description.localeCompare(b.requirement_description);
    });
  }
  return ordered;
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
        <Text style={[styles.rowTitle, dismissed && styles.rowTextDismissed]}>{warning.companion_name}</Text>
        <Text style={[styles.rowSub, dismissed && styles.rowTextDismissed]}>{warning.countries.join(", ")}</Text>
        <Text style={[styles.rowSub, dismissed && styles.rowTextDismissed]}>{warning.requirement_description}</Text>
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
  const [tab, setTab] = useState<Tab>("expiry");
  const { warnings: expiryWarnings, reload: reloadExpiry } = useAllDocumentExpiryWarnings();
  const { warnings: entryWarnings, reload: reloadEntry } = useAllEntryRequirementWarnings();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tripGroups = useMemo(() => groupEntryWarningsByTrip(entryWarnings), [entryWarnings]);

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

      <View style={styles.tabBar}>
        <Pressable style={[styles.tabBtn, tab === "expiry" && styles.tabBtnActive]} onPress={() => setTab("expiry")}>
          <Text style={[styles.tabBtnText, tab === "expiry" && styles.tabBtnTextActive]}>Expiring Documents</Text>
        </Pressable>
        <Pressable style={[styles.tabBtn, tab === "entry" && styles.tabBtnActive]} onPress={() => setTab("entry")}>
          <Text style={[styles.tabBtnText, tab === "entry" && styles.tabBtnTextActive]}>Entry Requirements</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {tab === "expiry" ? (
          <>
            {expiryWarnings.length === 0 && <Text style={styles.empty}>No expiring documents right now.</Text>}
            {expiryWarnings.map((w) => (
              <ExpiryRow key={w.document_id} warning={w} onDismiss={() => handleDismissExpiry(w.document_id)} />
            ))}
          </>
        ) : (
          <>
            {tripGroups.length === 0 && <Text style={styles.empty}>No entry-requirement warnings right now.</Text>}
            {tripGroups.map((g) => (
              <View key={g.trip_id} style={{ marginBottom: 20 }}>
                <Text style={styles.tripHeadline}>{g.trip_name}</Text>
                {g.warnings.map((w) => (
                  <EntryRow key={w.id} warning={w} onDismiss={() => handleDismissEntry(w.id)} />
                ))}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  tabBar: {
    flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: colors.paperRaised, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  tabBtn: {
    flex: 1, alignItems: "center", paddingVertical: 10, paddingHorizontal: 8,
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabBtnActive: { borderBottomColor: colors.blue },
  tabBtnText: { color: colors.inkSoft, fontFamily: fonts.bodySemi, fontSize: 13 },
  tabBtnTextActive: { color: colors.blue },
  tripHeadline: {
    color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 15, marginBottom: 10,
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
