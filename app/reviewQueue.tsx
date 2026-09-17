import { useMemo, useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import SubpageHeader from "@/components/SubpageHeader";
import Icon from "@/components/icons/Icon";
import { radius, fonts, ColorTokens } from "@/lib/theme";
import { useThemeColors } from "@/lib/ThemeContext";
import { ItemResearchJob, ItemResearchStatus, EmailProposalStatus } from "@/lib/types";
import { deleteResearchJob, retryResearchJob } from "@/lib/itemResearch";
import { deleteEmailProposal } from "@/lib/emailProposals";
import { useReviewQueue, ReviewQueueRow } from "@/lib/reviewQueue";
import ItemResearchReviewModal from "@/components/ItemResearchReviewModal";
import EmailProposalReviewModal from "@/components/EmailProposalReviewModal";

const RESEARCH_STATUS_LABEL: Record<ItemResearchStatus, string> = {
  ready: "Ready to review", researching: "Researching…", queued: "Queued",
  failed: "Failed", accepted: "Applied", rejected: "Discarded",
};
const EMAIL_STATUS_LABEL: Record<EmailProposalStatus, string> = {
  pending: "Ready to review", failed: "Failed", applied: "Applied", rejected: "Discarded",
};
const STATUS_COLOR = (colors: ColorTokens): Record<string, string> => ({
  "Ready to review": colors.gold, "Researching…": colors.lightBlue, "Queued": colors.inkSoft,
  "Failed": colors.coral, "Applied": colors.blue, "Discarded": colors.inkSoft,
});

// A tag on every row rather than two separately-titled sections — the whole
// point of merging these two queues is that they're prioritized together
// (see lib/reviewQueue.ts's groupOf), so splitting them back into sections
// here would just recreate the two-screens problem inside one screen.
const KIND_LABEL: Record<ReviewQueueRow["kind"], string> = { research: "Research", email: "Email" };
const KIND_COLOR = (colors: ColorTokens): Record<ReviewQueueRow["kind"], string> => ({ research: colors.blue, email: colors.lightBlue });

export default function ReviewQueue() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const statusColor = useMemo(() => STATUS_COLOR(colors), [colors]);
  const kindColor = useMemo(() => KIND_COLOR(colors), [colors]);
  const { rows, reload } = useReviewQueue();
  const [openJob, setOpenJob] = useState<Extract<ReviewQueueRow, { kind: "research" }>["job"] | null>(null);
  const [openProposal, setOpenProposal] = useState<Extract<ReviewQueueRow, { kind: "email" }>["proposal"] | null>(null);

  function openRow(row: ReviewQueueRow) {
    if (row.kind === "research") {
      if (row.job.status === "ready" || row.job.status === "failed") setOpenJob(row.job);
      else if (row.job.status === "accepted") router.push(`/item/${row.job.item_id}`);
    } else {
      if (row.proposal.status === "pending" || row.proposal.status === "failed") setOpenProposal(row.proposal);
      else if (row.proposal.status === "applied" && row.proposal.applied_item_id) router.push(`/item/${row.proposal.applied_item_id}`);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SubpageHeader title="Review Queue" />
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        data={rows}
        keyExtractor={(r) => (r.kind === "research" ? `research:${r.job.id}` : `email:${r.proposal.id}`)}
        renderItem={({ item: row }) => {
          const title = row.kind === "research"
            ? row.job.itemTitle ?? "(deleted item)"
            : row.proposal.proposal?.title?.value ?? row.proposal.raw_subject ?? "(booking email)";
          const sub = row.kind === "research"
            ? row.job.tripName
            : row.proposal.tripName ?? row.proposal.raw_subject;
          const statusLabel = row.kind === "research" ? RESEARCH_STATUS_LABEL[row.job.status] : EMAIL_STATUS_LABEL[row.proposal.status];
          const showRetry = row.kind === "research" && row.job.status === "failed";
          const showDelete = row.kind === "research"
            ? row.job.status === "rejected" || row.job.status === "accepted"
            : row.proposal.status === "rejected" || row.proposal.status === "applied" || row.proposal.status === "failed";
          return (
            <Pressable style={styles.row} onPress={() => openRow(row)}>
              <View style={{ flex: 1 }}>
                <View style={styles.titleRow}>
                  <View style={[styles.kindTag, { backgroundColor: kindColor[row.kind] + "22" }]}>
                    <Text style={[styles.kindTagText, { color: kindColor[row.kind] }]}>{KIND_LABEL[row.kind]}</Text>
                  </View>
                  <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
                </View>
                {!!sub && <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>}
              </View>
              <Text style={[styles.statusText, { color: statusColor[statusLabel] }]}>{statusLabel}</Text>
              {showRetry && (
                <Pressable onPress={() => retryResearchJob((row as any).job.id).then(reload)} hitSlop={8} style={{ marginLeft: 10 }}>
                  <Icon name="refresh" size={18} color={colors.blue} />
                </Pressable>
              )}
              {showDelete && (
                <Pressable
                  onPress={() => {
                    const p = row.kind === "research" ? deleteResearchJob(row.job.id) : deleteEmailProposal(row.proposal.id);
                    p.then(reload);
                  }}
                  hitSlop={8} style={{ marginLeft: 10 }}
                >
                  <Icon name="trash" size={16} color={colors.inkSoft} />
                </Pressable>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Nothing here yet — tap "Fill in details" on an item, use Quick Add, or forward a booking confirmation email.
          </Text>
        }
      />

      {openJob && (
        <ItemResearchReviewModal
          visible
          job={openJob as ItemResearchJob}
          onClose={() => setOpenJob(null)}
          onChanged={reload}
        />
      )}
      {openProposal && (
        <EmailProposalReviewModal
          visible
          proposal={openProposal}
          onClose={() => setOpenProposal(null)}
          onChanged={reload}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  row: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 14, marginBottom: 8,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  kindTag: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  kindTagText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  rowTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 15, flexShrink: 1 },
  rowSub: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
  statusText: { fontSize: 12.5, fontWeight: "700" },
  empty: { color: colors.inkSoft, fontStyle: "italic", fontSize: 13, textAlign: "center", marginTop: 40 },
});
