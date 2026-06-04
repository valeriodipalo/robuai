import { supabaseAdmin } from "./supabase";

/**
 * Screenshot storage. Images live in the PRIVATE "screenshots" bucket; the DB
 * only ever holds the path. Server-only (uses the service-role client). Needs
 * the Node runtime for Buffer — every caller route already sets runtime="nodejs".
 */
export const SCREENSHOTS_BUCKET = "screenshots";

/** Decode a `data:image/...;base64,...` URL into raw bytes + its content type. */
export function decodeDataUrl(
  dataUrl: string,
): { contentType: string; buffer: Buffer } | null {
  const m = /^data:(image\/[\w.+-]+);base64,(.+)$/s.exec(dataUrl || "");
  if (!m) return null;
  return { contentType: m[1], buffer: Buffer.from(m[2], "base64") };
}

/** Device-scoped path so per-device cleanup is a single prefix delete. */
export function screenshotPath(deviceId: string, matchId: string, uploadId: string): string {
  return `${deviceId}/${matchId}/${uploadId}.jpg`;
}

/**
 * Upload a screenshot data URL to the private bucket. Returns the stored path
 * and byte size, or null on failure — callers MUST treat failure as non-fatal
 * (keep the conversation, skip the uploads row) and never let it throw.
 */
export async function uploadScreenshot(params: {
  deviceId: string;
  matchId: string;
  uploadId: string;
  dataUrl: string;
}): Promise<{ storagePath: string; contentType: string; byteSize: number } | null> {
  const decoded = decodeDataUrl(params.dataUrl);
  if (!decoded) return null;
  const storagePath = screenshotPath(params.deviceId, params.matchId, params.uploadId);
  try {
    const { error } = await supabaseAdmin()
      .storage.from(SCREENSHOTS_BUCKET)
      .upload(storagePath, decoded.buffer, {
        contentType: decoded.contentType,
        upsert: false,
      });
    if (error) return null;
    return { storagePath, contentType: decoded.contentType, byteSize: decoded.buffer.length };
  } catch {
    return null;
  }
}

/** Remove stored screenshots by path (best-effort). Used when a match is deleted —
 *  the DB cascades, but Storage objects must be removed explicitly. */
export async function removeScreenshots(paths: string[]): Promise<void> {
  if (!paths.length) return;
  try {
    await supabaseAdmin().storage.from(SCREENSHOTS_BUCKET).remove(paths);
  } catch {
    // best-effort cleanup; a leftover object is harmless
  }
}

/** Short-lived signed URL for display. Never persist it — mint on read. */
export async function signedUrl(path: string, ttlSeconds = 3600): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin()
      .storage.from(SCREENSHOTS_BUCKET)
      .createSignedUrl(path, ttlSeconds);
    if (error || !data) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
