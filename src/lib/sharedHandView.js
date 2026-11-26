/**
 * A signed-out open of a shared Club Arena hand is counted (2026-11-26).
 * ═══════════════════════════════════════════════════════════════════════════
 * SERVER ONLY. Imported by pages/api/club-arena/shared-hand-view.js and
 * nothing a browser loads: it reads SUPABASE_SERVICE_ROLE_KEY.
 *
 * Club Arena migration 20261126054024 (issue #9828) split the shared-hand
 * door in two. fn_ca_shared_hand_open is anon-executable and writes nothing.
 * fn_ca_shared_hand_count_view is the only writer of view_count and only
 * authenticated and service_role may execute it: the live definer-exposure
 * audit allows zero anon-executable SECURITY DEFINER writers, with no
 * allowlist. A signed-in opener counts through that door with their own
 * session. A signed-out opener has no session, so Club Arena posts here and
 * this route counts the view with the service role.
 *
 * WHAT IS COUNTED, AND WHAT IS NOT
 *  - Only a real browser open. Club Arena's /hub/club-arena/h/<token> page
 *    posts here from its JavaScript after the hand has opened. A link-preview
 *    crawler (iMessage, WhatsApp, Discord, Slack...) fetches /h/<token> and
 *    /api/og/club-hand for the card and runs no client JavaScript, so it never
 *    reaches this route. A crawler user agent that does post is refused too.
 *  - Never a signed-in open twice: a request carrying a Bearer token is not
 *    counted here, because the signed-in client counts through the RPC.
 *  - One view per visitor per link per DEDUPE_WINDOW_SECONDS, held durably by
 *    check_rate_limit_strict (the same authority applyDurableRateLimit uses),
 *    keyed on the link and a hash of the visitor's address (never the raw
 *    address). A reload, a double-fired effect or a script looping on one
 *    address counts once.
 *  - The database still decides the rest: revoked links and deleted senders
 *    count nothing.
 *
 * The answer is always exactly { counted: boolean }. Nothing here throws to
 * the caller; counting is bookkeeping and never stands between a visitor and
 * the hand.
 */
import { createHash } from 'node:crypto';
import { HAND_TOKEN_RE } from './sharedHandLink.js';
import { isLinkPreviewBot } from './clubInvite.js';
import { SUPABASE_URL_FALLBACK } from './supabaseKeys.js';

export const DEDUPE_WINDOW_SECONDS = 600;
export const BURST_LIMIT = { max: 30, windowMs: 60_000, scope: ':shared-hand-view' };
export const COUNT_VIEW_RPC = 'fn_ca_shared_hand_count_view';

/** Exactly the database's token shape; nothing is trimmed or repaired. */
export function strictHandToken(value) {
    return typeof value === 'string' && HAND_TOKEN_RE.test(value) ? value : null;
}

/** Vercel's x-real-ip, else the rightmost x-forwarded-for hop (as apiRateLimit). */
export function visitorAddress(req) {
    const real = req?.headers?.['x-real-ip'];
    if (typeof real === 'string' && real.trim()) return real.trim();
    const fwd = req?.headers?.['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.trim()) {
        const parts = fwd.split(',');
        return parts[parts.length - 1].trim();
    }
    return req?.socket?.remoteAddress || 'unknown';
}

/** The durable dedupe key: the link and a hash of the address, never the address. */
export function dedupeKey(token, address) {
    const who = createHash('sha256').update(String(address)).digest('hex').slice(0, 32);
    return `ca-shared-hand-view:${token}:${who}`;
}

function parseBody(body) {
    if (body && typeof body === 'object') return body;
    if (typeof body === 'string') {
        try { return JSON.parse(body); } catch { return null; }
    }
    return null;
}

async function serviceRpc(fetchImpl, env, name, args) {
    const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
    const url = String(env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL_FALLBACK).trim();
    const res = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: key,
            // A legacy service JWT also goes in Authorization; a modern secret
            // key (sb_secret_...) is not a JWT and travels as apikey alone.
            ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`${name} ${res.status}`);
    return res.json();
}

/**
 * The route's handler. deps are injected so tests run it with no network:
 *   fetchImpl  the fetch used for the two service-role calls
 *   env        process.env, or a test's stand-in
 *   rateLimit  apiRateLimit's in-memory burst limiter (optional)
 */
export function createSharedHandViewHandler({ fetchImpl = fetch, env = process.env, rateLimit } = {}) {
    return async function sharedHandViewHandler(req, res) {
        const reply = (status, counted) => {
            res.setHeader('Cache-Control', 'private, no-store, max-age=0');
            return res.status(status).json({ counted: counted === true });
        };
        try {
            if (req.method !== 'POST') {
                res.setHeader('Allow', 'POST');
                return reply(405, false);
            }
            const token = strictHandToken(parseBody(req.body)?.token);
            if (!token) return reply(400, false);
            // A signed-in open is counted by the client through the RPC.
            if (req.headers?.authorization) return reply(200, false);
            if (isLinkPreviewBot(req.headers?.['user-agent'])) return reply(200, false);
            if (typeof rateLimit === 'function' && !rateLimit(req, BURST_LIMIT).ok) {
                return reply(429, false);
            }
            const fresh = await serviceRpc(fetchImpl, env, 'check_rate_limit_strict', {
                p_key: dedupeKey(token, visitorAddress(req)),
                p_limit: 1,
                p_window_seconds: DEDUPE_WINDOW_SECONDS,
            });
            if (fresh !== true) return reply(200, false);
            const out = await serviceRpc(fetchImpl, env, COUNT_VIEW_RPC, { p_token: token });
            return reply(200, out?.counted === true);
        } catch (err) {
            console.warn('[shared-hand-view] not counted:', err?.message || err);
            return reply(200, false);
        }
    };
}
