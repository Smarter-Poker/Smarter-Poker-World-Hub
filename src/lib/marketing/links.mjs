/**
 * Signed links for marketing email (Dan, 2026-11-18).
 *
 * Two kinds, one signature scheme:
 *   - unsubscribe: proves the address the link was sent to, so a stranger
 *     cannot unsubscribe somebody else by editing a URL;
 *   - click: records the click against the campaign and redirects ONLY to the
 *     URL that was signed, so the route is never an open redirect.
 *
 * The key follows the precedent in src/lib/dailyDigest/delivery.mjs (signed
 * "view online" links): a dedicated secret when one is set, otherwise the cron
 * secret, always domain-separated so a token for one purpose can never be
 * replayed as another. Unsubscribe links do not expire (CAN-SPAM requires an
 * opt-out to keep working for at least 30 days; forever is simpler and
 * kinder). Click links expire after 120 days.
 */
import crypto from 'node:crypto';

const trim = (v) => (typeof v === 'string' ? v.trim() : '');
export const PUBLIC_BASE_URL = 'https://smarter.poker';

function keyFor(purpose, env = process.env) {
    const secret = trim(env.MARKETING_LINK_SECRET) || trim(env.CRON_SECRET);
    if (!secret) return null;
    return crypto.createHash('sha256').update(`sp-marketing-${purpose}-v1:${secret}`).digest();
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s) => { try { return Buffer.from(s, 'base64url').toString('utf8'); } catch { return null; } };

function sign(purpose, payload, env) {
    const key = keyFor(purpose, env);
    if (!key) return null;
    const body = b64(JSON.stringify(payload));
    const sig = crypto.createHmac('sha256', key).update(body).digest('base64url');
    return `${body}.${sig}`;
}

function verify(purpose, token, env) {
    const key = keyFor(purpose, env);
    if (!key || typeof token !== 'string' || token.length > 4096) return null;
    const dot = token.lastIndexOf('.');
    if (dot <= 0) return null;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', key).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const json = unb64(body);
    if (!json) return null;
    try { return JSON.parse(json); } catch { return null; }
}

export const normalizeEmail = (email) => {
    const v = trim(String(email || '')).toLowerCase();
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : null;
};

/** Token for an unsubscribe link. `campaignId` may be null (a player announcement). */
export function signUnsubscribe(email, campaignId = null, env = process.env) {
    const e = normalizeEmail(email);
    if (!e) return null;
    return sign('unsubscribe', { e, c: campaignId || null }, env);
}

export function verifyUnsubscribe(token, env = process.env) {
    const p = verify('unsubscribe', token, env);
    if (!p || !normalizeEmail(p.e)) return null;
    return { email: p.e, campaignId: typeof p.c === 'string' ? p.c : null };
}

export function unsubscribeUrl(email, campaignId = null, env = process.env) {
    const t = signUnsubscribe(email, campaignId, env);
    return t ? `${PUBLIC_BASE_URL}/api/email/unsubscribe?t=${encodeURIComponent(t)}` : null;
}

/** Only our own pages may be a click destination. */
export function isAllowedDestination(url) {
    try {
        const u = new URL(url);
        return u.protocol === 'https:' && (u.hostname === 'smarter.poker' || u.hostname.endsWith('.smarter.poker'));
    } catch { return false; }
}

export function signClick(email, campaignId, url, env = process.env, now = Date.now()) {
    const e = normalizeEmail(email);
    if (!e || !campaignId || !isAllowedDestination(url)) return null;
    return sign('click', { e, c: campaignId, u: url, x: Math.floor(now / 1000) + 120 * 86400 }, env);
}

export function verifyClick(token, env = process.env, now = Date.now()) {
    const p = verify('click', token, env);
    if (!p || !normalizeEmail(p.e) || typeof p.c !== 'string' || !isAllowedDestination(p.u)) return null;
    const expired = !Number.isFinite(p.x) || p.x * 1000 < now;
    return { email: p.e, campaignId: p.c, url: p.u, expired };
}

export function clickUrl(email, campaignId, url, env = process.env, now = Date.now()) {
    const t = signClick(email, campaignId, url, env, now);
    return t ? `${PUBLIC_BASE_URL}/api/email/click?t=${encodeURIComponent(t)}` : url;
}

/** Add campaign attribution to one of our own URLs. */
export function withUtm(url, slug) {
    try {
        const u = new URL(url);
        if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', 'email');
        if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', 'campaign');
        if (slug && !u.searchParams.has('utm_campaign')) u.searchParams.set('utm_campaign', slug);
        return u.toString();
    } catch { return url; }
}
