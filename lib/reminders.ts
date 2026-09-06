import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "./supabase";

// Constants.easConfig only auto-populates for an EAS Update/Build manifest;
// this project's local (non-EAS) builds need the projectId passed in
// explicitly — see the "bare workflow" note in getExpoPushTokenAsync's own
// error message.
const EAS_PROJECT_ID = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;

// Sensible per-type defaults (minutes before the item's start time) — the
// item form lets these be overridden per item. Reminders are sent by a
// server-side scheduled job (see supabase/functions/send-reminders), not
// scheduled on-device, so this is only ever a suggested starting value.
export const DEFAULT_REMINDER_MINUTES: Record<string, number> = {
  flight: 180,
  lodging: 60,
  transfer: 45,
  transport: 30,
  activity: 30,
  meal: 15,
  bar: 15,
  sightseeing: 30,
  attraction: 30,
  shopping: 15,
  work: 30,
  other: 30,
};

/**
 * Requests notification permission and registers this device's Expo push
 * token against the signed-in user. Fails silently (returns false) rather
 * than throwing — this runs opportunistically on login/foreground, and a
 * device that can't get a push token (permission denied, no EAS projectId,
 * etc.) shouldn't block anything else in the app.
 */
export async function registerPushToken(): Promise<boolean> {
  try {
    const perm = await Notifications.requestPermissionsAsync();
    if (perm.status !== "granted") return false;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId || !EAS_PROJECT_ID) return false;

    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    const expoPushToken = tokenResult.data;
    if (!expoPushToken) return false;

    const { error } = await supabase.from("push_tokens").upsert(
      { user_id: userId, expo_push_token: expoPushToken, updated_at: new Date().toISOString() },
      { onConflict: "user_id,expo_push_token" }
    );
    return !error;
  } catch {
    return false;
  }
}
