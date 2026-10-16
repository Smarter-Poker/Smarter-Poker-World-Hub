/**
 * GET /api/news/photo?id=<poker_news uuid>&w=<240|640|960|1280>
 *
 * A news story's photo, resized for the screen that asked for it.
 *
 * NEWS PHOTO WEIGHT (2026-10-16). /hub/news passed every publisher's photo to
 * phones at full size through /api/proxy: the live lead story was a
 * 1,737,954 B PNG and the six top cards were ~3.9 MB together, while each is
 * shown at most ~390 CSS px wide. The lead photo is the page's Largest
 * Contentful Paint, so its download and decode were most of the News load
 * time on a phone.
 *
 * This route serves the same picture as WebP at a fixed set of widths. It is
 * deliberately narrow so it cannot become an open image resizer:
 * - it takes a story id, never a URL, and only resizes the image_url stored
 *   on that poker_news row;
 * - the picture is fetched through /api/proxy (unchanged), so the publisher
 *   rules, retries and SSRF guard are the ones already in production;
 * - widths are an allow-list, never larger than the source;
 * - anything it cannot do (no row, no photo, not an image, decode failure)
 *   answers with a redirect to the exact URL the card used before, so the
 *   card's existing fallback behaviour is unchanged.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { newsImageUrl } from '../../../src/lib/security/imageHosts.js';
import { MAX_SOURCE_BYTES, resolveNewsPhoto } from '../../../src/lib/news/newsPhotoServer.mjs';

const FETCH_TIMEOUT_MS = 8000;
// Resized photos never change for a given story and width. The CDN keeps
// them; a stale copy is still the right picture.
const CACHE_OK = 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400';
const CACHE_FALLBACK = 'public, max-age=300, s-maxage=300';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

function originOf(req) {
    if (process.env.SITE_ORIGIN) return process.env.SITE_ORIGIN;
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    if (!host) return 'https://smarter.poker';
    const local = host.startsWith('localhost') || host.startsWith('127.');
    const proto = req.headers['x-forwarded-proto'] || (local ? 'http' : 'https');
    return `${proto}://${host}`;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return undefined;

    const origin = originOf(req);
    const result = await resolveNewsPhoto({
        id: String(req.query.id || ''),
        width: Number(req.query.w),
        readOriginalUrl: async (id) => {
            const { data, error } = await getSupabase()
                .from('poker_news')
                .select('image_url')
                .eq('id', id)
                .maybeSingle();
            if (error) throw error;
            return newsImageUrl(data?.image_url || '');
        },
        fetchImage: async (original) => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
            try {
                // Same-origin paths (the existing /api/proxy hop) are fetched on
                // this deployment; the proxy keeps its publisher rules and SSRF
                // guard. Direct URLs are the ones imageHosts already allows.
                const absolute = /^https?:\/\//i.test(original) ? original : `${origin}${original}`;
                const response = await fetch(absolute, { signal: controller.signal, headers: { Accept: 'image/*' } });
                const declared = Number(response.headers.get('content-length') || 0);
                const type = String(response.headers.get('content-type') || '');
                if (!response.ok || !type.startsWith('image/') || declared > MAX_SOURCE_BYTES) {
                    // Never buffer a body the resolver is going to refuse.
                    try { await response.body?.cancel(); } catch { /* already closed */ }
                    return { ok: false, headers: response.headers, arrayBuffer: async () => new ArrayBuffer(0) };
                }
                const bytes = await response.arrayBuffer();
                return {
                    ok: response.ok,
                    headers: response.headers,
                    arrayBuffer: async () => bytes,
                };
            } finally {
                clearTimeout(timer);
            }
        },
    });

    switch (result.kind) {
        case 'image':
            res.setHeader('Content-Type', 'image/webp');
            res.setHeader('Content-Length', String(result.bytes.length));
            res.setHeader('Cache-Control', CACHE_OK);
            res.setHeader('X-Content-Type-Options', 'nosniff');
            return res.status(200).send(result.bytes);
        case 'redirect':
            res.setHeader('Cache-Control', CACHE_FALLBACK);
            res.setHeader('Location', result.location);
            return res.status(302).end();
        case 'missing':
            return res.status(404).json({ success: false, error: 'This story has no photo' });
        case 'unavailable':
            return res.status(503).json({ success: false, error: 'Story temporarily unavailable' });
        default:
            return res.status(400).json({ success: false, error: 'A story id and a supported width are required' });
    }
}
