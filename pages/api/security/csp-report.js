/* ===========================================================================
   CSP VIOLATION SINK - the missing half of the Report-Only migration
   ===========================================================================

   next.config.js has shipped a full Content-Security-Policy in Report-Only
   mode for months, with this plan written above it: "violations are logged to
   the browser console without breaking any functionality. Once violations have
   been monitored and confirmed zero, switch to Content-Security-Policy."

   The plan could never complete. A Report-Only policy with no reporting
   directive writes its violations to the console of the visitor who tripped
   it, and nowhere else. Nobody here ever sees them, so "confirmed zero" is a
   condition that cannot be reached, and the policy sits staged forever while
   the four directives in `enforcedCsp` do the real work alone.

   This endpoint is where those reports go instead. It accepts both shapes a
   browser can send:

     report-uri  ->  content-type: application/csp-report      { "csp-report": {...} }
     report-to   ->  content-type: application/reports+json    [ { type, body } ]

   WHAT IT DELIBERATELY DOES NOT DO

   - It never stores a report. These arrive unauthenticated from any browser on
     the internet, so a table here is a free write endpoint for a stranger. The
     violations go to the runtime log, which is already the observability
     surface for this project and is queryable without a migration.
   - It never echoes anything back. Every outcome is 204 with an empty body, so
     a malformed or hostile report learns nothing and gets no retry signal.
   - It never logs a full URL. `document-uri` and `blocked-uri` can carry query
     strings, and on this platform those can carry a recovery token or an
     invite code. Only the origin, and the path for our own pages, are kept.

   FLOOD CONTROL. One misconfigured directive can generate a report per image
   per page view. Reports are deduplicated per instance on
   (directive, blocked origin) for a few minutes, so a directive that fires ten
   thousand times costs one log line and a counter, not ten thousand lines.

   Read the collected violations with the Vercel runtime logs, filtering on the
   `[csp-report]` prefix. Every line is one unique violation shape, which is the
   list that has to reach zero before the staged policy can be enforced.  */

export const config = {
    // The two content types browsers use here are not application/json, so the
    // built-in parser leaves req.body undefined. Read the stream directly.
    api: { bodyParser: false },
};

/** Largest report body worth reading. Real reports are well under a kilobyte. */
const MAX_BODY_BYTES = 16 * 1024;

/** How long a violation shape stays deduplicated, in milliseconds. */
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

/** Most distinct violation shapes held at once, so the map cannot grow forever. */
const MAX_TRACKED_SHAPES = 500;

/** Most log lines one request may produce, however many reports it carries. */
const MAX_LOGGED_PER_REQUEST = 5;

/** shape key -> { count, firstSeen, lastLogged } for this serverless instance. */
const seen = new Map();

/**
 * Origin only, so a query string cannot carry a token into the log. Keeps the
 * path for our own documents, because "which page" is the useful half of a
 * report and our own paths do not carry secrets in the path segment.
 */
/** Anything heading for the log, with control characters removed. A report that
 *  carries a newline could otherwise write its own `[csp-report] ...` lines. */
function flat(value, max) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').trim().slice(0, max);
}

export function safeUri(value, { keepPath = false } = {}) {
    const raw = flat(value, 2048);
    if (!raw) return '';
    // CSP keywords arrive verbatim and are not URLs: inline, eval, data, blob.
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return flat(raw, 60);
    try {
        const u = new URL(raw);
        return keepPath ? `${u.origin}${u.pathname}` : u.origin;
    } catch {
        return 'unparseable';
    }
}

/** Pulls the fields we log out of either report shape. */
export function normalize(payload) {
    const out = [];
    const push = (r) => {
        if (!r || typeof r !== 'object') return;
        const directive = flat(
            r['effective-directive'] || r.effectiveDirective || r['violated-directive'] || r.violatedDirective || 'unknown',
            40,
        ).split(' ')[0];
        out.push({
            directive,
            blocked: safeUri(r['blocked-uri'] ?? r.blockedURL),
            document: safeUri(r['document-uri'] ?? r.documentURL, { keepPath: true }),
            disposition: flat(r.disposition || 'report', 10),
        });
    };
    if (Array.isArray(payload)) {
        // Reporting API: [{ type: 'csp-violation', body: {...} }, ...]
        for (const entry of payload.slice(0, 50)) {
            if (entry && entry.type && entry.type !== 'csp-violation') continue;
            push(entry?.body);
        }
    } else if (payload && typeof payload === 'object') {
        push(payload['csp-report'] || payload.body || payload);
    }
    return out.filter((r) => r.directive !== 'unknown' || r.blocked);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        let oversize = false;
        const chunks = [];
        req.on('data', (c) => {
            if (oversize) return;
            size += c.length;
            if (size > MAX_BODY_BYTES) {
                // Stop reading, but do not destroy the request: the handler
                // still has to answer 204 on this socket, and destroying it
                // gave the browser a connection reset, which is the retry the
                // always-204 contract exists to avoid.
                oversize = true;
                return;
            }
            chunks.push(c);
        });
        req.on('end', () => resolve(oversize ? '' : Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

export default async function handler(req, res) {
    // Always 204. A browser must not learn anything from this endpoint, and a
    // non-2xx would make some browsers retry a report we do not need.
    const done = () => res.status(204).end();
    if (req.method !== 'POST') return done();

    let reports = [];
    try {
        const body = await readBody(req);
        if (!body) return done();
        reports = normalize(JSON.parse(body));
    } catch {
        return done();
    }

    const now = Date.now();
    // Whatever a single body claims, it cannot write more than a handful of
    // lines. The per-shape window below handles repeats; this handles a caller
    // sending fifty distinct shapes at once.
    let written = 0;
    for (const r of reports) {
        if (written >= MAX_LOGGED_PER_REQUEST) break;
        // disposition is part of the shape: an enforced block and a report-only
        // violation of the same directive and origin are different facts, and
        // keying without it printed whichever arrived first for both.
        const key = `${r.disposition}|${r.directive}|${r.blocked}`;
        const prior = seen.get(key);
        if (prior && now - prior.lastLogged < DEDUPE_WINDOW_MS) {
            prior.count += 1;
            continue;
        }
        const count = prior ? prior.count + 1 : 1;
        // Evict the oldest rather than clearing everything. A wholesale clear
        // let anyone with a fresh key per request keep the map at its cap and
        // switch the deduplication off, which is the flood this file exists to
        // prevent. Map preserves insertion order, so the first key is the oldest.
        if (seen.size >= MAX_TRACKED_SHAPES && !prior) {
            const oldest = seen.keys().next().value;
            if (oldest !== undefined) seen.delete(oldest);
        }
        seen.set(key, { count, lastLogged: now });
        // One line per unique violation shape. This is the list that has to
        // reach zero before the staged policy can move to enforcement.
        written += 1;
        console.warn(
            `[csp-report] ${r.disposition} ${r.directive} blocked=${r.blocked || 'none'} doc=${r.document || 'none'} seen=${count}`,
        );
    }
    return done();
}
