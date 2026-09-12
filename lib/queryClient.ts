import { QueryClient, onlineManager, focusManager } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import { AppState, Platform } from "react-native";

// Bump this whenever a query's return shape changes (a field added/removed
// from what a queryFn resolves to). PersistQueryClientProvider's `buster`
// (see app/_layout.tsx) is set to this — changing it discards every
// persisted cache entry on next launch, rather than rehydrating an old
// shape a current screen doesn't expect. Without this, a screen that reads
// a field the old cached shape never had can crash on the very first
// render, before its own refetch — which would have corrected it — ever
// resolves; since the crash happens before that refetch lands, the bad
// cache entry never gets a chance to heal itself on its own.
export const QUERY_CACHE_SCHEMA_VERSION = "2";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 minutes — avoid refetching on every screen focus while online
      gcTime: 7 * 24 * 60 * 60 * 1000, // 7 days — persisted cache stays usable across app restarts
      retry: 1,
    },
  },
});

// TanStack Query's default online/focus detection is browser-only
// (navigator.onLine / visibilitychange), which doesn't exist on native.
// Wiring NetInfo/AppState in means queries actually pause while offline and
// refetch on reconnect or app-foreground on Android — react-native-web still
// gets real browser events for free via NetInfo's own web shim.
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => setOnline(!!state.isConnected));
});

if (Platform.OS !== "web") {
  focusManager.setEventListener((setFocused) => {
    const sub = AppState.addEventListener("change", (state) => setFocused(state === "active"));
    return () => sub.remove();
  });
}
