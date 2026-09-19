import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Alert } from "@/lib/alert";
import { supabase } from "@/lib/supabase";
import { exportTripItineraryPdf } from "@/lib/exportItinerary";
import { rerunEntryRequirementCheck } from "@/lib/entryRequirements";
import ShareTripModal from "@/components/ShareTripModal";
import SharePublicLinkModal from "@/components/SharePublicLinkModal";
import { HamburgerMenuItem } from "@/components/HamburgerMenu";

/** The same trip-level actions (Export/Edit/Share/Doc Tracker/Settings)
 * every trip-scoped screen's hamburger menu offers — shared so the export/
 * share wiring only lives in one place instead of being copied into every
 * screen. Settings (dark mode, sign out) is the same entry point Home's own
 * hamburger menu uses, not duplicated here. */
export function useTripHamburgerMenu(tripId: string) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLinkOpen, setShareLinkOpen] = useState(false);
  const [tripName, setTripName] = useState("");

  useEffect(() => {
    supabase.from("trips").select("user_id, name").eq("id", tripId).single().then(({ data }) => {
      if (data) setTripName(data.name);
      supabase.auth.getUser().then(({ data: userData }) => {
        if (userData.user && data) setIsOwner(userData.user.id === data.user_id);
      });
    });
  }, [tripId]);

  async function handleExportPdf() {
    setExporting(true);
    try {
      await exportTripItineraryPdf(tripId);
    } catch (e: any) {
      Alert.alert("Export failed", e.message ?? "Unknown error");
    }
    setExporting(false);
  }

  async function handleEntryValidation() {
    const error = await rerunEntryRequirementCheck(tripId);
    if (error) { Alert.alert("Couldn't start entry validation", error); return; }
    Alert.alert("Entry validation started", "Re-checking entry requirements and everyone's documents — results will appear on this page shortly.");
  }

  const menuItems: HamburgerMenuItem[] = [
    { icon: "export", label: exporting ? "Exporting…" : "Export PDF", onPress: handleExportPdf },
    { icon: "edit", label: "Edit Trip", onPress: () => router.push(`/trip/${tripId}/edit`) },
    // "Share Trip" (collaborator invite by email) is deliberately hidden
    // from the menu for now, per the user's request — the feature itself
    // (ShareTripModal, setShareOpen, claimPendingTripShares) is untouched
    // below and still fully wired, just unreachable from the UI. Restore
    // by uncommenting this entry.
    // ...(isOwner ? [{ icon: "share" as const, label: "Share Trip", onPress: () => setShareOpen(true) }] : []),
    { icon: "share" as const, label: "Share Link", onPress: () => setShareLinkOpen(true) },
    { icon: "document", label: "Doc Tracker", onPress: () => router.push("/doctracker") },
    { icon: "flag", label: "Entry Validation", onPress: handleEntryValidation },
    { icon: "settings", label: "Settings", onPress: () => router.push("/settings") },
  ];

  const shareModal = (
    <>
      <ShareTripModal visible={shareOpen} onClose={() => setShareOpen(false)} tripId={tripId} />
      <SharePublicLinkModal visible={shareLinkOpen} onClose={() => setShareLinkOpen(false)} tripId={tripId} tripName={tripName} />
    </>
  );

  return { menuItems, shareModal };
}
