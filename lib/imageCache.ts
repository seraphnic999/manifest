// Local disk cache for private-bucket images (companion avatars, additional
// photos, travel document scans) that are otherwise served through
// short-lived signed URLs.
//
// createSignedUrl() mints a fresh token — and therefore a different URL
// string — every time it's called, even for the exact same file. That
// silently defeats any URL-keyed image cache (React Native's built-in
// <Image>, or the browser's own HTTP cache): a companion avatar shown on
// five different screens, or the same screen re-mounted after react-query's
// 5-minute staleTime elapses, downloads the same bytes from Supabase Storage
// over and over, because the *URL* looks new every time even though the
// *file* hasn't changed.
//
// The fix: cache by the storage PATH, not the signed URL. A path only ever
// changes when the underlying photo genuinely changes — every upload path
// in this codebase (uploadToCompanionBucket, uploadDocumentPhoto, etc.)
// writes to a brand-new timestamped path and deletes the old one, so the
// path itself is a naturally-correct cache key with no extra invalidation
// logic needed: replace the photo, get a new path, get a cache miss, done.
//
// Downloaded once per path into FileSystem.cacheDirectory (OS-managed, gets
// reclaimed under disk pressure — unlike documentDirectory, nothing here
// needs to persist forever) and reused as a local file:// URI after that.
import * as FileSystem from "expo-file-system";

const CACHE_DIR = `${FileSystem.cacheDirectory}image-cache/`;
let dirReady: Promise<void> | null = null;

async function ensureDir(): Promise<void> {
  if (!dirReady) {
    dirReady = FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true }).catch(() => {});
  }
  return dirReady;
}

function localUriFor(storagePath: string): string {
  // Storage paths are "userId/id/timestamp.ext" — keep the extension (some
  // native image decoders care), flatten everything else into one filename.
  const safe = storagePath.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${CACHE_DIR}${safe}`;
}

// Same storagePath requested by several mounted components at once (a
// companion's avatar shown on three trip cards simultaneously, say)
// shouldn't kick off three parallel downloads of the same file.
const inFlight = new Map<string, Promise<string | null>>();

/**
 * Returns a local file:// URI for the image at `storagePath`, downloading
 * and caching it on first use. `fetchSignedUrl` is only called on a cache
 * miss — repeat requests for an already-cached path never hit the network
 * or mint a new signed URL at all.
 */
export async function getCachedImageUri(
  storagePath: string | null | undefined,
  fetchSignedUrl: () => Promise<string | null>
): Promise<string | null> {
  if (!storagePath) return null;

  const existing = inFlight.get(storagePath);
  if (existing) return existing;

  const promise = (async () => {
    await ensureDir();
    const localUri = localUriFor(storagePath);

    const info = await FileSystem.getInfoAsync(localUri);
    if (info.exists) return localUri;

    const signedUrl = await fetchSignedUrl();
    if (!signedUrl) return null;

    try {
      const result = await FileSystem.downloadAsync(signedUrl, localUri);
      return result.status === 200 ? localUri : null;
    } catch {
      // Cache miss stays a miss — caller falls back to whatever it does for
      // a null url (placeholder avatar, etc.), next call just retries.
      return null;
    }
  })();

  inFlight.set(storagePath, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(storagePath);
  }
}
