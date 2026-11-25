/**
 * Pure Next.js 16 `<Image>` optimization eligibility predicate for `<SPImage>`.
 *
 * Extracted as a standalone ESM module so both `src/components/common/SPImage.jsx`
 * and Node CI law tests can evaluate it directly.
 *
 * Why this exists:
 * Next.js 16 (`/_next/image`) rejects local `/api/*` routes, local paths carrying
 * query strings (`?url=...`, `?fallback=1`, `?v=2`), and inline `data:`/`blob:` URIs
 * with `HTTP 400 INVALID_IMAGE_OPTIMIZE_REQUEST` unless `images.localPatterns`
 * explicitly whitelists them. Returning `false` sets `unoptimized={true}` on `<Image>`
 * so those URLs load directly from their first-party route without a broken `/_next/image` hop.
 */
const ALLOWED_REMOTE_MASKS = [
    'supabase.co',
    'smarter.poker',
    'unsplash.com',
    'img.youtube.com',
    'api.qrserver.com',
];

export function shouldOptimizeSpImageSrc(finalSrc) {
    if (typeof finalSrc !== 'string' || !finalSrc) return false;
    const trimmed = finalSrc.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return false;

    if (trimmed.startsWith('/')) {
        if (trimmed.startsWith('//')) return false;
        if (trimmed.startsWith('/api/') || trimmed.includes('?')) return false;
        return true;
    }

    try {
        const urlObj = new URL(trimmed);
        if (urlObj.protocol !== 'https:' && urlObj.protocol !== 'http:') return false;
        const host = urlObj.hostname.toLowerCase();
        if (host === 'smarter.poker' || host.endsWith('.smarter.poker')) {
            if (urlObj.pathname.startsWith('/api/')) return false;
        }
        return ALLOWED_REMOTE_MASKS.some(
            (mask) => host === mask || host.endsWith(`.${mask}`)
        );
    } catch {
        return false;
    }
}
