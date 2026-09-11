import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

// Shopping is now the second tab of the merged Expenses/Shopping screen
// (see money.tsx) rather than its own route — this just redirects any old
// link (search results, bookmarks) to that tab instead of 404ing.
export default function ShoppingRedirect() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/trip/${tripId}/money?tab=shopping`);
  }, [tripId]);
  return null;
}
