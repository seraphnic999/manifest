import { useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import SubpageHeader from "@/components/SubpageHeader";
import Icon from "@/components/icons/Icon";
import { colors, radius, fonts } from "@/lib/theme";
import { ItemResearchJob, ItemResearchStatus } from "@/lib/types";
import { useResearchJobs, ItemResearchJobResolved, deleteResearchJob, retryResearchJob } from "@/lib/itemResearch";
import ItemResearchReviewModal from "@/components/ItemResearchReviewModal";

const STATUS_LABEL: Record<ItemResearchStatus, string> = {
  ready: "Ready to review",
  researching: "Researching…",
  queued: "Queued",
  failed: "Failed",
  accepted: "Applied",
  rejected: "Discarded",
};

const STATUS_COLOR: Record<ItemResearchStatus, string> = {
  ready: colors.gold,
  researching: colors.lightBlue,
  queued: colors.inkSoft,
  failed: colors.coral,
  accepted: colors.blue,
  rejected: colors.inkSoft,
};

export default function ResearchQueue() {
  const router = useRouter();
  const { jobs, reload } = useResearchJobs();
  const [openJob, setOpenJob] = useState<ItemResearchJobResolved | null>(null);

  function openRow(job: ItemResearchJobResolved) {
    if (job.status === "ready" || job.status === "failed") {
      setOpenJob(job);
    } else if (job.status === "accepted") {
      router.push(`/item/${job.item_id}`);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SubpageHeader title="Research Queue" />
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        data={jobs}
        keyExtractor={(j) => j.id}
        renderItem={({ item: job }) => (
          <Pressable style={styles.row} onPress={() => openRow(job)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{job.itemTitle ?? "(deleted item)"}</Text>
              {!!job.tripName && <Text style={styles.rowSub} numberOfLines={1}>{job.tripName}</Text>}
            </View>
            <Text style={[styles.statusText, { color: STATUS_COLOR[job.status] }]}>{STATUS_LABEL[job.status]}</Text>
            {job.status === "failed" && (
              <Pressable onPress={() => retryResearchJob(job.id).then(reload)} hitSlop={8} style={{ marginLeft: 10 }}>
                <Icon name="refresh" size={18} color={colors.blue} />
              </Pressable>
            )}
            {(job.status === "rejected" || job.status === "accepted") && (
              <Pressable onPress={() => deleteResearchJob(job.id).then(reload)} hitSlop={8} style={{ marginLeft: 10 }}>
                <Icon name="trash" size={16} color={colors.inkSoft} />
              </Pressable>
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Nothing here yet — tap "Fill in details" on an item to start researching it.
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  row: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 14, marginBottom: 8,
  },
  rowTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 15 },
  rowSub: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
  statusText: { fontSize: 12.5, fontWeight: "700" },
  empty: { color: colors.inkSoft, fontStyle: "italic", fontSize: 13, textAlign: "center", marginTop: 40 },
});
