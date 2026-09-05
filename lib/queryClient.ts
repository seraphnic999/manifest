import { QueryClient, onlineManager, focusManager } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import { AppState, Platform } from "react-native";

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
