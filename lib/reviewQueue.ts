// One combined "needs your attention" queue over the two propose-and-review
// pipelines this app has (item research, booking-email intake) — same
// underlying per-source hooks (useResearchJobs/useEmailProposals, each
// already realtime-subscribed), just merged and sorted together so the user
// checks one screen instead of two. Add a third source here later (e.g. a
// future intake channel) by giving it the same {kind, status, created_at}
// shape and folding it into the merge below.
import { useMemo } from "react";
import { useResearchJobs, ItemResearchJobResolved } from "./itemResearch";
import { useEmailProposals, EmailProposalResolved } from "./emailProposals";

export type ReviewQueueRow =
  | { kind: "research"; job: ItemResearchJobResolved }
  | { kind: "email"; proposal: EmailProposalResolved };

// Collapses each source's own (more granular) status enum into one shared
// priority ordering — needs-review first, then still-running, then failed,
// then history — so the two kinds interleave by urgency rather than research
// rows always leading or trailing every email row.
function groupOf(row: ReviewQueueRow): number {
  if (row.kind === "research") {
    switch (row.job.status) {
      case "ready": return 0;
      case "researching": case "queued": return 1;
      case "failed": return 2;
      case "accepted": return 3;
      case "rejected": return 4;
    }
  } else {
    switch (row.proposal.status) {
      case "pending": return 0;
      case "failed": return 2;
      case "applied": return 3;
      case "rejected": return 4;
    }
  }
}

function createdAtOf(row: ReviewQueueRow): string {
  return row.kind === "research" ? row.job.created_at : row.proposal.created_at;
}

export function useReviewQueue() {
  const { jobs, loading: researchLoading, reload: reloadResearch } = useResearchJobs();
  const { proposals, loading: emailLoading, reload: reloadEmail } = useEmailProposals();

  const rows = useMemo(() => {
    const merged: ReviewQueueRow[] = [
      ...jobs.map((job): ReviewQueueRow => ({ kind: "research", job })),
      ...proposals.map((proposal): ReviewQueueRow => ({ kind: "email", proposal })),
    ];
    merged.sort((a, b) => groupOf(a) - groupOf(b) || createdAtOf(b).localeCompare(createdAtOf(a)));
    return merged;
  }, [jobs, proposals]);

  return {
    rows,
    loading: researchLoading || emailLoading,
    reload: async () => { await Promise.all([reloadResearch(), reloadEmail()]); },
  };
}
