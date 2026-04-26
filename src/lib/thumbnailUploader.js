/**
 * 🖼️ THUMBNAIL UPLOAD UTILITY
 * src/lib/thumbnailUploader.js
 *
 * Converts a canvas-generated data URL thumbnail to a Blob and uploads
 * it to Supabase Storage. Returns the public URL for use in post metadata.
 *
 * Used by SharedPostCreator and UploadReelModal after generateThumbnail()
 * produces a local data URL — this persists it to the cloud so feed rendering
 * doesn't require loading the full video for a preview frame.
 */

import { getAccessToken } from './authUtils';

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

        // Build filename
        const timestamp = Date.now();
        const fileName = `thumb_${timestamp}.jpg`;

        // Get signed upload URL
        const token = getAccessToken();
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
