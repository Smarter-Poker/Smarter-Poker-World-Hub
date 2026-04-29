/**
 * THUMBNAIL UPLOAD UTILITY
 * src/lib/thumbnailUploader.js
 *
 * Converts a canvas-generated data URL thumbnail to a Blob and uploads
 * it to Supabase Storage. Returns the public URL for use in post metadata.
 *
 * Used by SharedPostCreator and UploadReelModal after generateThumbnail()
 * produces a local data URL — this persists it to the cloud so feed rendering
 * doesn't require loading the full video for a preview frame.
 *
 * Auth policy: localStorage-only via authUtils.getAccessToken(). Direct
 * supabase.auth SDK calls are banned by .husky/pre-commit because the SDK's
 * navigator.locks contention is what triggered the original Invalid Compact
 * JWS bug. The shape check below catches the same corrupt-but-truthy values
 * that bgUpload guards against.
 */

import { getAccessToken } from './authUtils';

// JWT shape: 3 dot-separated base64url parts. Reject anything else (null,
// empty, malformed legacy SDK shape, "[object Object]", literal "undefined").
const _isJWT = (t) => typeof t === 'string'
    && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t);

/**
<<<<<<< Updated upstream
 * Resolve a guaranteed-shape-valid bearer token from localStorage.
 * Returns null if the local token is missing or corrupt — caller should treat
 * thumbnail upload as best-effort and continue without one.
 */
function _ensureBearer() {
=======
 * Resolve a guaranteed-valid bearer token. SDK getSession() first (auto-
 * refreshes if expired), explicit refreshSession() as second try, raw
 * localStorage shape-checked as last resort. Mirrors
 * backgroundVideoUpload's _ensureBearer so thumbnails fail/succeed under
 * the same conditions as the main upload.
 */
async function _ensureBearer() {
    try {
        const { supabase } = await import('./supabase');
        const { data: { session } = {} } = await supabase.auth.getSession();
        const tok = session?.access_token;
        if (_isJWT(tok)) return tok;
        const { data: ref } = await supabase.auth.refreshSession();
        const refTok = ref?.session?.access_token;
        if (_isJWT(refTok)) return refTok;
    } catch (_) { /* fall through */ }
>>>>>>> Stashed changes
    const local = getAccessToken();
    if (_isJWT(local)) return local;
    return null;
}

/**
 * Upload a thumbnail data URL to Supabase Storage.
 *
 * @param {string} dataUrl - JPEG data URL from generateThumbnail()
 * @param {string} userId  - Authenticated user ID (storage prefix)
 * @param {string} [folder='thumbnails'] - Storage subfolder
 * @returns {Promise<string|null>} Public URL of uploaded thumbnail, or null on failure
 */
export async function uploadThumbnail(dataUrl, userId, folder = 'thumbnails') {
    if (!dataUrl || !userId) return null;

    try {
        // Convert data URL to Blob
        const res = await fetch(dataUrl);
        const blob = await res.blob();

        // Guard: reject empty blobs — malformed canvas.toDataURL() produces 0-byte output
        if (blob.size < 100) {
            console.warn('[ThumbnailUploader] Blob too small, likely malformed data URL — skipping');
            return null;
        }

        // Build filename
        const timestamp = Date.now();
        const fileName = `thumb_${timestamp}.jpg`;

<<<<<<< Updated upstream
        // Get a shape-valid bearer from localStorage. If unavailable, bail —
        // thumbnails are best-effort and the post will still render without one.
        const token = _ensureBearer();
=======
        // Get signed upload URL — use _ensureBearer (validates JWT shape +
        // auto-refreshes if expired) so a malformed localStorage entry doesn't
        // cause silent thumbnail failures.
        const token = await _ensureBearer();
>>>>>>> Stashed changes
        if (!token) return null;

        const metaRes = await fetch('/api/social/upload-url', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                fileName,
                fileSize: blob.size,
                mimeType: 'image/jpeg',
                folder,
                prefix: userId,
            }),
        });

        if (!metaRes.ok) return null;
        const meta = await metaRes.json();
        if (!meta.success || !meta.signedUrl) return null;

        // Upload the blob
        const uploadRes = await fetch(meta.signedUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            body: blob,
        });

        if (!uploadRes.ok) return null;

        return meta.publicUrl;
    } catch (err) {
        console.warn('[ThumbnailUploader] Upload failed (non-fatal):', err.message);
        return null;
    }
}
