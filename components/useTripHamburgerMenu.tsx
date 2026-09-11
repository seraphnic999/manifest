import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Alert } from "@/lib/alert";
import { supabase } from "@/lib/supabase";
import { exportTripItineraryPdf } from "@/lib/exportItinerary";
import ShareTripModal from "@/components/ShareTripModal";
import { HamburgerMenuItem } from "@/components/HamburgerMenu";

/** The same four trip-level actions (Export/Edit/Share/Sign out) every
 * trip-scoped screen's hamburger menu offers — shared so the export/share
 * wiring only lives in one place instead of being copied into every screen. */
export function useTripHamburgerMenu(tripId: string) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    supabase.from("trips").select("user_id").eq("id", tripId).single().then(({ data }) => {
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

  function signOut() {
    Alert.alert("Sign out", "Sign out of Manifest?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => supabase.auth.signOut() },
    ]);
  }

  const menuItems: HamburgerMenuItem[] = [
    { icon: "export", label: exporting ? "Exporting…" : "Export PDF", onPress: handleExportPdf },
    { icon: "edit", label: "Edit Trip", onPress: () => router.push(`/trip/${tripId}/edit`) },
    ...(isOwner ? [{ icon: "share" as const, label: "Share Trip", onPress: () => setShareOpen(true) }] : []),
    { icon: "signOut", label: "Sign Out", onPress: signOut, danger: true },
  ];

  const shareModal = <ShareTripModal visible={shareOpen} onClose={() => setShareOpen(false)} tripId={tripId} />;

  return { menuItems, shareModal };
}
