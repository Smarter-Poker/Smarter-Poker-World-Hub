/**
 * Server half of /api/news/photo: resolve, fetch and resize one story photo.
 * Kept free of request/response objects so the whole decision is testable
 * with real images (__tests__/news-photo-resize.test.mjs).
 */
import sharp from 'sharp';
import { NEWS_PHOTO_WIDTHS, isNewsPhotoId } from './newsPhoto.mjs';

export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

/**
 * @returns {Promise<
 *   | { kind: 'invalid' }
 *   | { kind: 'unavailable' }
 *   | { kind: 'missing' }
 *   | { kind: 'redirect', location: string }
 *   | { kind: 'image', bytes: Buffer }
 * >}
 */
export async function resolveNewsPhoto({ id, width, readOriginalUrl, fetchImage }) {
    if (!isNewsPhotoId(id) || !NEWS_PHOTO_WIDTHS.includes(width)) return { kind: 'invalid' };

    let original;
    try {
        original = await readOriginalUrl(id);
    } catch {
        return { kind: 'unavailable' };
    }
    if (!original) return { kind: 'missing' };

    try {
        const upstream = await fetchImage(original);
        const type = String(upstream.headers.get('content-type') || '');
        const declared = Number(upstream.headers.get('content-length') || 0);
        if (!upstream.ok || !type.startsWith('image/') || declared > MAX_SOURCE_BYTES) {
            try { await upstream.body?.cancel(); } catch { /* already closed */ }
            return { kind: 'redirect', location: original };
        }
        const bytes = Buffer.from(await upstream.arrayBuffer());
        if (!bytes.length || bytes.length > MAX_SOURCE_BYTES) return { kind: 'redirect', location: original };

        const image = sharp(bytes, { failOn: 'error', limitInputPixels: 64 * 1024 * 1024 }).rotate();
        const meta = await image.metadata();
        if (!meta.width || !meta.height) return { kind: 'redirect', location: original };
        const output = await image
            .resize({ width: Math.min(width, meta.width), withoutEnlargement: true })
            .webp({ quality: 72, effort: 4 })
            .toBuffer();
        return { kind: 'image', bytes: output };
    } catch {
        // Anything we cannot resize is served exactly as before.
        return { kind: 'redirect', location: original };
    }
}
