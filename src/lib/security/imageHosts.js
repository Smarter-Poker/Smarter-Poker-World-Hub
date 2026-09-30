/* One list of image hosts, used by two things that must never disagree:
   the Content-Security-Policy img-src directive in next.config.js, and the
   runtime guard the components call before rendering a remote image.

   They were going to be written twice. The reason they are not: venue
   photography is served from each casino's own domain, 104 distinct hosts
   across 478 venues as measured on 2026-09-30, and every one of them is an
   img-src violation. An allow-list can never cover that set, because every new
   venue brings a new domain. So the platform mirrors those images instead, and
   this guard is what makes the policy safe to ENFORCE even when the mirror is
   incomplete: an image from anywhere else is not rendered at all, and the
   component falls through to the monogram it already draws when there is no
   picture. A gap in the data becomes a missing photo, never a blocked request
   and never a broken page.

   CommonJS on purpose: next.config.js is CommonJS and requires this at build
   time to compose the directive. */

/** Hosts the policy allows, as CSP source expressions. */
const IMAGE_SOURCES = [
    "'self'",
    'data:',
    'blob:',
    'https://*.supabase.co',        // the venue-logos mirror, avatars, uploads
    'https://*.smarter.poker',
    'https://storage.googleapis.com',
    'https://maps.googleapis.com',
    'https://maps.gstatic.com',
    'https://server.arcgisonline.com', // Poker Near Me dark basemap tiles
    'https://api.qrserver.com',
    'https://img.youtube.com',
    // i.ytimg.com is the host YouTube ACTUALLY serves thumbnails from. Measured
    // on /hub/news: img.youtube.com was listed and never used, i.ytimg.com was
    // used and never listed, so five thumbnails per load reported a violation
    // that the allow-list plainly meant to permit.
    'https://i.ytimg.com',
    'https://media.giphy.com',
    'https://*.giphy.com',
    'https://images.unsplash.com',
];

/** The img-src directive, so the policy cannot drift from the guard. */
const imgSrcDirective = () => `img-src ${IMAGE_SOURCES.join(' ')}`;

/** The same list as hostname matchers, for the runtime guard. */
const ALLOWED_HOST_PATTERNS = IMAGE_SOURCES
    .filter((s) => s.startsWith('https://'))
    .map((s) => {
        const host = s.slice('https://'.length);
        return host.startsWith('*.')
            ? new RegExp(`(^|\\.)${host.slice(2).replace(/\./g, '\\.')}$`)
            : new RegExp(`^${host.replace(/\./g, '\\.')}$`);
    });

/**
 * The URL if the policy would allow it, otherwise null.
 *
 * Returning null rather than a placeholder is deliberate: every caller already
 * renders a monogram when it has no image, so null lands in a path that is
 * designed and tested, and an unmirrored venue looks deliberate instead of broken.
 */
function safeImageUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const u = url.trim();
    if (!u) return null;
    // Same-origin and inline forms are covered by 'self', data: and blob:.
    //
    // `//host/path` is NOT same-origin: it is protocol-relative and resolves to
    // that host. Eleven venues carry exactly that shape pointing at a CDN, and
    // a plain startsWith('/') would have waved every one of them through as if
    // it were a local path.
    if (u.startsWith('//')) return matchesAllowedHost(u.replace(/^\/\//, 'https://')) ? u : null;
    if (u.startsWith('/') || u.startsWith('data:') || u.startsWith('blob:')) return u;
    return matchesAllowedHost(u) ? u : null;
}

/** Whether an absolute URL's host is one the policy allows. */
function matchesAllowedHost(u) {
    let host;
    try {
        const parsed = new URL(u);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
        host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    } catch {
        return false; // not a URL we can judge, so not one we will render
    }
    return ALLOWED_HOST_PATTERNS.some((re) => re.test(host));
}

/* A NEWS THUMBNAIL THE BROWSER IS ALLOWED TO ASK FOR.
 *
 * The seven poker publishers the news scraper reads are a fixed list in code,
 * but the thumbnail URL is not: it is whatever each article's og:image points
 * at, so the HOST is data, not configuration. Measured on /hub/news, one load
 * asked five publisher CDNs for 34 pictures and reported 225 img-src
 * violations, which is the single thing keeping img-src out of the enforced
 * policy.
 *
 * An allow-list cannot fix that, because a publisher moving CDN would silently
 * blank its thumbnails. Mirroring every article image would, but the feed
 * refreshes every two hours and the pictures are the publisher's, not ours.
 *
 * So the browser asks THIS origin instead. /api/proxy already fetches these
 * exact images server side - /hub/news has routed cardplayer.com through it
 * for months, which is precisely why cardplayer.com never appears in the
 * violation list while the other five do. Sending the rest the same way costs
 * no new infrastructure and no new attack surface: the endpoint already takes
 * any url, and its host check judges resolved addresses, so a private address
 * is refused whatever spelling it arrives in.
 *
 * The result is that no remote host is ever named in an image request, which
 * is what makes img-src safe to enforce. */
function newsImageUrl(url) {
    const raw = typeof url === 'string' ? url.trim() : '';
    if (!raw) return null;
    // Anything the policy already allows is asked for directly: our own paths,
    // the Supabase mirror, YouTube thumbnails. No proxy hop for those.
    const direct = safeImageUrl(raw);
    if (direct) return direct;
    // `//host/path` is protocol-relative, not same-origin.
    const absolute = raw.startsWith('//') ? `https:${raw}` : raw;
    if (!/^https?:\/\//i.test(absolute)) return null;
    return `/api/proxy?url=${encodeURIComponent(absolute)}`;
}

module.exports = { IMAGE_SOURCES, imgSrcDirective, ALLOWED_HOST_PATTERNS, safeImageUrl, matchesAllowedHost, newsImageUrl };
