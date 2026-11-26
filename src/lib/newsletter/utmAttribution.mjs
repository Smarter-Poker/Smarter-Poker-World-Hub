/**
 * Pure, zero-dependency UTM Attribution & Email Section Classifier.
 *
 * Safe for Node.js, Next.js API routes, edge runtimes, and browser Webpack
 * bundles (ZERO imports of `node:*` or external packages).
 */

/**
 * Sanitizes a candidate UTM tag string to match the strict acquisition standard
 * defined in `src/lib/acquisition/firstTouch.mjs`.
 *
 * Lowercases, trims, replaces invalid characters with `_`, collapses multiple `_`,
 * strips leading/trailing `._-`, slices to 64 chars, and returns `null` if the
 * result does not match `/^[a-z0-9][a-z0-9._-]*$/`.
 */
export function sanitizeUtmTag(val) {
    if (typeof val !== 'string') return null;
    let s = val.trim().toLowerCase();
    if (!s) return null;
    s = s.replace(/[^a-z0-9._-]/g, '_');
    s = s.replace(/_+/g, '_');
    s = s.replace(/^[._-]+/, '');
    s = s.replace(/[._-]+$/, '');
    s = s.slice(0, 64);
    s = s.replace(/[._-]+$/, '');
    return /^[a-z0-9][a-z0-9._-]*$/.test(s) ? s : null;
}

/**
 * Appends standard newsletter UTM tags (`utm_source`, `utm_medium`, `utm_campaign`,
 * and optionally `utm_content`) to an internal Smarter.Poker URL.
 *
 * Preserves existing query params (`pt`, `wb`, `ref`, `redirect`, `join`, `spot`,
 * `pick`, `wire_q`, `id`, etc.) and hash fragments. Leaves `mailto:`, `tel:`,
 * `#`, external non-smarter.poker URLs, and signed API endpoints
 * (`/api/news/subscribe`, `/api/news/email-image`, `/api/news/calendar-ics`)
 * untouched.
 */
export function appendNewsletterUtm(
    rawUrl,
    { source, medium = 'email', campaign = '', content = '' } = {}
) {
    if (!rawUrl || typeof rawUrl !== 'string') {
        return rawUrl;
    }
    const trimmed = rawUrl.trim();
    if (!trimmed) {
        return rawUrl;
    }
    if (
        trimmed.startsWith('mailto:') ||
        trimmed.startsWith('tel:') ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('javascript:')
    ) {
        return rawUrl;
    }

    const isAbsolute = /^https?:\/\//i.test(trimmed);
    let parsed;
    try {
        parsed = new URL(trimmed, 'https://smarter.poker');
    } catch {
        return rawUrl;
    }

    const hostname = parsed.hostname.toLowerCase();
    const isSmarterPoker =
        hostname === 'smarter.poker' ||
        hostname === 'www.smarter.poker' ||
        hostname === 'localhost' ||
        hostname === '127.0.0.1';

    if (isAbsolute && !isSmarterPoker) {
        return rawUrl;
    }

    const pathname = parsed.pathname.toLowerCase();
    if (
        pathname === '/api/news/subscribe' ||
        pathname === '/api/news/email-image' ||
        pathname === '/api/news/calendar-ics'
    ) {
        return rawUrl;
    }

    const cleanSource = sanitizeUtmTag(source);
    const cleanMedium = sanitizeUtmTag(medium);
    const cleanCampaign = campaign ? sanitizeUtmTag(campaign) : null;
    const cleanContent = content ? sanitizeUtmTag(content) : null;

    if (!parsed.searchParams.has('utm_source') && cleanSource) {
        parsed.searchParams.set('utm_source', cleanSource);
    }
    if (!parsed.searchParams.has('utm_medium') && cleanMedium) {
        parsed.searchParams.set('utm_medium', cleanMedium);
    }
    if (!parsed.searchParams.has('utm_campaign') && cleanCampaign) {
        parsed.searchParams.set('utm_campaign', cleanCampaign);
    }
    if (!parsed.searchParams.has('utm_content') && cleanContent) {
        parsed.searchParams.set('utm_content', cleanContent);
    }

    const search = parsed.search || '';
    const hash = parsed.hash || '';

    if (isAbsolute) {
        return `${parsed.origin}${parsed.pathname}${search}${hash}`;
    }

    const startsWithSlash = trimmed.startsWith('/');
    const relativePath = startsWithSlash ? parsed.pathname : parsed.pathname.replace(/^\//, '');
    return `${relativePath}${search}${hash}`;
}

/**
 * Classifies a clicked link URL into a standard email section identifier for
 * aggregate click heatmaps. Handles raw URLs, encoded strings, query-wrapped redirects,
 * and standard deep links.
 */
export function classifyClickedEmailSection(clickedUrl) {
    if (!clickedUrl || typeof clickedUrl !== 'string') {
        return 'other';
    }
    let raw = clickedUrl.trim();
    if (!raw) return 'other';

    // Decode URL if the entire input was encoded (e.g. starts with https%3A or %2F)
    if (/^(?:https?%3A|%2F)/i.test(raw)) {
        try {
            raw = decodeURIComponent(raw);
        } catch {
            /* ignore malformed percent encoding */
        }
    }

    let parsed;
    try {
        parsed = new URL(raw, 'https://smarter.poker');
    } catch {
        return 'other';
    }

    // If wrapped in a click tracker redirect parameter (e.g. ?url=... or ?target=...)
    for (const p of ['url', 'target', 'dest', 'destination']) {
        const nested = parsed.searchParams.get(p);
        if (nested && (nested.startsWith('http') || nested.startsWith('/'))) {
            try {
                parsed = new URL(nested, 'https://smarter.poker');
                break;
            } catch {
                /* ignore */
            }
        }
    }

    const path = parsed.pathname.toLowerCase();
    const search = parsed.search.toLowerCase();

    // Prioritize specific feature sections before generic article/news/archive fallbacks:
    if (path.startsWith('/hub/trivia') || parsed.searchParams.has('wire_q') || search.includes('wire_q=')) {
        return 'trivia';
    }
    if (path.includes('/hub/training/hand-lab') || parsed.searchParams.has('spot') || search.includes('spot=')) {
        return 'spot';
    }
    if (path.startsWith('/hub/video-library') || path.startsWith('/hub/video')) {
        return 'video';
    }
    if (
        path.startsWith('/auth/signup') ||
        path.startsWith('/go/promo') ||
        path.startsWith('/go/welcome-back') ||
        path.startsWith('/promo/welcome-back')
    ) {
        return 'promo';
    }
    if (
        path.startsWith('/hub/club-arena') ||
        path.startsWith('/api/news/calendar-ics') ||
        parsed.searchParams.get('join') === '25450' ||
        search.includes('join=25450')
    ) {
        return 'kings_club';
    }
    if (
        path.startsWith('/hub/venues') ||
        path.startsWith('/hub/poker-near-me') ||
        path.startsWith('/poker-rooms')
    ) {
        return 'nearby';
    }
    if (path.startsWith('/tools')) {
        return 'tool';
    }
    if (path.startsWith('/hub/article') || path.startsWith('/hub/news')) {
        return 'news';
    }
    if (path.startsWith('/hub/wire')) {
        return 'archive';
    }
    if (path.startsWith('/hub/email-preferences') || path.startsWith('/api/news/subscribe')) {
        return 'preferences';
    }
    return 'other';
}

export { classifyClickedEmailSection as classifyClickedSection };
