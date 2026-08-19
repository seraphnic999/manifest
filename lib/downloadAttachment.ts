import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

/**
 * Saves a remote attachment to the user's device. Web: triggers a browser
 * download. Native: downloads to app cache then opens the OS share sheet,
 * which is the standard way an Expo app lets a user save a file to Photos/
 * Files without needing extra storage permissions.
 */
export async function downloadAttachment(url: string, fileName: string): Promise<void> {
  if (Platform.OS === "web") {
    // The signed URL is cross-origin (Supabase's domain, not the app's), and
    // browsers ignore <a download> on cross-origin links, navigating the
    // tab away to the raw file instead of saving it. Fetching the bytes and
    // downloading from a same-origin blob: URL makes the download attribute
    // honored regardless of the source's origin.
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
    return;
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_") || "attachment";
  const localUri = FileSystem.cacheDirectory + safeName;
  const { uri } = await FileSystem.downloadAsync(url, localUri);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri);
  }
}
