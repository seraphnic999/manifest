import { useCallback, useEffect, useState } from "react";
import { Slot } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import DocTrackerLockScreen from "@/components/DocTrackerLockScreen";

// Doc Tracker holds passport/ID/visa photos and numbers — the one part of
// this app worth an extra check beyond the normal Supabase session, since
// the realistic threat here isn't the backend (RLS + private storage buckets
// already cover that) but someone picking up an unlocked or backgrounded
// phone. Gates every screen under app/doctracker/ behind the device's own
// biometric/passcode prompt via expo-local-authentication — never a
// custom PIN, so there's nothing new to store, forget, or leak.
//
// Renders via <Slot />, not <Stack> — a nested Stack here would make this a
// second navigator, and the ROOT Stack then renders its own default header
// for the "doctracker" group on top of it (a plain, unstyled "doctracker"
// bar above every screen's own real header), since only this layout knew to
// hide its inner headers, not the root one wrapping it. <Slot /> renders the
// matched child directly with no navigator of its own, so every screen's
// existing `<Stack.Screen options={{ headerShown: false }} />` keeps
// configuring its entry in the ROOT stack exactly as it did before this
// layout existed.
//
// Unlocked once per app session — a module-level flag, not component state,
// so it survives navigating away from and back into Doc Tracker, and
// survives the app being backgrounded and foregrounded (e.g. handing off to
// the OS photo picker mid-upload, which used to re-lock the gate on the way
// back — the wrong granularity for a phone app; re-locking that eagerly is
// what banking apps do, not what a personal document list needs). Only
// resets when the JS module reloads, i.e. the app is fully killed and
// relaunched, which is what "session" means here.
let sessionUnlocked = false;
// Whether the device can offer a lock at all — also cached at module level
// (not just per-session) since hardware/enrollment doesn't change mid-session
// and there's no reason to re-check the native module on every visit.
let deviceCanLock: boolean | null = null;

export default function DocTrackerLayout() {
  // null = still checking whether the device can even offer a lock.
  const [locked, setLocked] = useState<boolean | null>(sessionUnlocked ? false : null);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (sessionUnlocked) return;
    let cancelled = false;
    (async () => {
      if (deviceCanLock === null) {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        // getEnrolledLevelAsync (not isEnrolledAsync) so a device secured only
        // by a PIN/pattern — no biometric enrolled — still counts: NONE is the
        // only level where the device genuinely cannot offer any lock at all,
        // and locking the gate in that case would just strand the user with
        // no way to ever unlock their own data.
        const level = hasHardware ? await LocalAuthentication.getEnrolledLevelAsync() : LocalAuthentication.SecurityLevel.NONE;
        deviceCanLock = level !== LocalAuthentication.SecurityLevel.NONE;
      }
      if (cancelled) return;
      if (!deviceCanLock) sessionUnlocked = true;
      setLocked(deviceCanLock);
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
    if (result.success) {
      sessionUnlocked = true;
      setLocked(false);
    } else {
      setFailed(true);
    }
  }, []);

  // Auto-prompt once when the gate first appears, so the user doesn't have
  // to tap "Unlock" on a screen they'll see constantly — the button stays
  // as the retry affordance if this is dismissed or fails.
  useEffect(() => {
    if (locked) unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked === true]);

  if (locked === null) return null; // avoid a flash while the hardware check resolves
  if (locked) {
    return <DocTrackerLockScreen checking={checking} failed={failed} onUnlock={unlock} />;
  }

  return <Slot />;
}
