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
// Mirror of `images.remotePatterns` in next.config.js: https only, exact hostnames, and a leading
// `*.` matches exactly ONE subdomain label (Next.js semantics). Any host the optimizer would refuse
// must stay unoptimized, otherwise `/_next/image` answers 400 and the image breaks. Keep this list
// identical to next.config.js when a remote pattern is added or removed.
const ALLOWED_REMOTE_HOSTS = [
    'kuklfnapbkmacvwxktbh.supabase.co',
    '*.supabase.co',
    'images.unsplash.com',
    'smarter.poker',
    'auth.smarter.poker',
    '*.smarter.poker',
    'api.qrserver.com',
    'img.youtube.com',
];

function hostMatchesRemotePattern(host, pattern) {
    if (!pattern.startsWith('*.')) return host === pattern;
    const suffix = pattern.slice(1);
    if (!host.endsWith(suffix)) return false;
    const label = host.slice(0, host.length - suffix.length);
    return label.length > 0 && !label.includes('.');
}

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
        if (urlObj.protocol !== 'https:') return false;
        const host = urlObj.hostname.toLowerCase();
        if (host === 'smarter.poker' || host.endsWith('.smarter.poker')) {
            if (urlObj.pathname.startsWith('/api/')) return false;
        }
        return ALLOWED_REMOTE_HOSTS.some((pattern) => hostMatchesRemotePattern(host, pattern));
    } catch {
        return false;
    }
}
