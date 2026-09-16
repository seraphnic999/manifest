import { useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable } from "react-native";
import { Stack } from "expo-router";
import SubpageHeader from "@/components/SubpageHeader";
import Icon from "@/components/icons/Icon";
import { colors, radius, fonts } from "@/lib/theme";
import { EmailProposalStatus } from "@/lib/types";
import { useEmailProposals, EmailProposalResolved, deleteEmailProposal } from "@/lib/emailProposals";
import EmailProposalReviewModal from "@/components/EmailProposalReviewModal";

const STATUS_LABEL: Record<EmailProposalStatus, string> = {
  pending: "Ready to review",
  failed: "Failed",
  applied: "Applied",
  rejected: "Discarded",
};

const STATUS_COLOR: Record<EmailProposalStatus, string> = {
  pending: colors.gold,
  failed: colors.coral,
  applied: colors.blue,
  rejected: colors.inkSoft,
};

export default function EmailProposals() {
  const { proposals, reload } = useEmailProposals();
  const [openProposal, setOpenProposal] = useState<EmailProposalResolved | null>(null);

  function openRow(proposal: EmailProposalResolved) {
    if (proposal.status === "pending" || proposal.status === "failed") {
      setOpenProposal(proposal);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SubpageHeader title="Email Proposals" />
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        data={proposals}
        keyExtractor={(p) => p.id}
        renderItem={({ item: proposal }) => (
          <Pressable style={styles.row} onPress={() => openRow(proposal)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {proposal.proposal?.title?.value ?? proposal.raw_subject ?? "(booking email)"}
              </Text>
              {!!proposal.tripName && <Text style={styles.rowSub} numberOfLines={1}>{proposal.tripName}</Text>}
              {!proposal.tripName && !!proposal.raw_subject && <Text style={styles.rowSub} numberOfLines={1}>{proposal.raw_subject}</Text>}
            </View>
            <Text style={[styles.statusText, { color: STATUS_COLOR[proposal.status] }]}>{STATUS_LABEL[proposal.status]}</Text>
            {(proposal.status === "rejected" || proposal.status === "applied" || proposal.status === "failed") && (
              <Pressable onPress={() => deleteEmailProposal(proposal.id).then(reload)} hitSlop={8} style={{ marginLeft: 10 }}>
                <Icon name="trash" size={16} color={colors.inkSoft} />
              </Pressable>
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Nothing here yet — forward a booking confirmation email to add it automatically.
          </Text>
        }
      />

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
