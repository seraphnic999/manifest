import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { Stack } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import DocTrackerLockScreen from "@/components/DocTrackerLockScreen";
import { colors } from "@/lib/theme";

// Doc Tracker holds passport/ID/visa photos and numbers — the one part of
// this app worth an extra check beyond the normal Supabase session, since
// the realistic threat here isn't the backend (RLS + private storage buckets
// already cover that) but someone picking up an unlocked or backgrounded
// phone. Gates every screen under app/doctracker/ behind the device's own
// biometric/passcode prompt via expo-local-authentication — never a
// custom PIN, so there's nothing new to store, forget, or leak.
//
// Locked again whenever the OS backgrounds the app while a Doc Tracker
// screen is on screen (not just a sliding "unlocked for N minutes" timer —
// matches how banking/password-manager apps behave), and naturally locked
// again on next visit since this layout unmounts when the user navigates
// away from Doc Tracker entirely.
export default function DocTrackerLayout() {
  // null = still checking whether the device can even offer a lock.
  const [locked, setLocked] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      // getEnrolledLevelAsync (not isEnrolledAsync) so a device secured only
      // by a PIN/pattern — no biometric enrolled — still counts: NONE is the
      // only level where the device genuinely cannot offer any lock at all,
      // and locking the gate in that case would just strand the user with
      // no way to ever unlock their own data.
      const level = hasHardware ? await LocalAuthentication.getEnrolledLevelAsync() : LocalAuthentication.SecurityLevel.NONE;
      if (cancelled) return;
      setLocked(level !== LocalAuthentication.SecurityLevel.NONE);
    })();
    return () => { cancelled = true; };
  }, []);

  const unlock = useCallback(async () => {
    setChecking(true);
    setFailed(false);
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock Doc Tracker",
    });
    setChecking(false);
    if (result.success) setLocked(false);
    else setFailed(true);
  }, []);

  // Auto-prompt once when the gate first appears, so the user doesn't have
  // to tap "Unlock" on a screen they'll see constantly — the button stays
  // as the retry affordance if this is dismissed or fails.
  useEffect(() => {
    if (locked) unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked === true]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appState.current === "active" && next.match(/inactive|background/)) {
        setLocked((prev) => (prev === false ? true : prev));
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  if (locked === null) return null; // avoid a flash while the hardware check resolves
  if (locked) {
    return <DocTrackerLockScreen checking={checking} failed={failed} onUnlock={unlock} />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.paperRaised },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontWeight: "700" },
        headerBackTitle: "Back",
        contentStyle: { backgroundColor: colors.paper },
      }}
    />
  );
}
