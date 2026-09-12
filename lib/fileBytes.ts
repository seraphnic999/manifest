// fetch(uri).blob() silently fails with "Network request failed" on Android
// for file:// URIs (e.g. expo-image-manipulator's cropped output) — it only
// reliably reads content:// URIs. Reading via expo-file-system + decoding
// base64 to an ArrayBuffer works for both schemes, so every photo/document
// upload path should go through this instead of fetch().
import * as FileSystem from "expo-file-system";
import { decode } from "base64-arraybuffer";

export async function readUriAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return decode(base64);
}
