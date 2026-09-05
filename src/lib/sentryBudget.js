/**
 * Sentry free-tier budget for the World Hub SERVER runtime.
 * ═══════════════════════════════════════════════════════════════════════════
 * Policy: docs/SENTRY-FREE-TIER-POLICY.md, section 4 ("the budgets are code,
 * not intent"). Sentry is on the free Developer plan: 5,000 errors a month
 * shared by three projects. This runtime's share is:
 *
 *   DAILY_BUDGET        60 events a day (UTC day)
 *   FINGERPRINT_BUDGET   3 a day per fingerprint (the fourth copy is dropped)
 *
 * Vercel functions do not share memory, so the bucket lives in Postgres:
 * public.sentry_event_budget + public.sentry_event_fingerprints, taken
 * atomically by fn_sentry_budget_take() (migration
 * 20260904220519_sentry_event_budget.sql). One RPC per event we are about to
 * send; at 60 a day that is nothing.
 *
 * FAIL CLOSED. If the RPC cannot be reached, errors, or the service key is
 * missing, the event is DROPPED and a console.warn says so. A budget that
 * fails open is not a budget, and the first noisy day would blind the Arena
 * client and the engine for the rest of the month.
 *
 * Nothing here filters by error class. Filter known identifiers by name
 * inside sentry.server.config.js if you must; never by type.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createHash } from 'crypto';

export const DAILY_BUDGET = 60;
export const FINGERPRINT_BUDGET = 3;

let _client = null;
let _dropped = 0;

/** Events dropped by this lambda since it booted (visible in Vercel logs). */
export function droppedCount() {
    return _dropped;
}

/**
 * Lazily build the service-role client. Imported inside the function so that
 * requiring this module never throws at import time (it is loaded from
 * sentry.server.config.js during instrumentation, before anything else).
 */
async function getClient() {
    if (_client) return _client;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    const { createClient } = await import('./supabaseServerClient');
    _client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { 'x-application-name': 'sentry-budget' } },
    });
    return _client;
}

/**
 * Derive a stable fingerprint for an event. Sentry's own grouping is close to
 * this: exception type + message + the top in-app frame, or the message for
 * captureMessage events. If the caller set an explicit fingerprint, honour it.
 */
export function fingerprintOf(event) {
    try {
        if (Array.isArray(event?.fingerprint) && event.fingerprint.length) {
            return hash(event.fingerprint.join('|'));
        }
        const ex = event?.exception?.values?.[0];
        if (ex) {
            const frames = ex.stacktrace?.frames || [];
            let top = null;
            for (let i = frames.length - 1; i >= 0; i--) {
                if (frames[i]?.in_app) { top = frames[i]; break; }
            }
            if (!top && frames.length) top = frames[frames.length - 1];
            const where = top ? `${top.filename || top.abs_path || ''}:${top.function || ''}` : '';
            return hash(`${ex.type || ''}|${normalise(ex.value)}|${where}`);
        }
        const msg = event?.message?.formatted || event?.message?.message || event?.message || '';
        const route = event?.tags?.route || '';
        return hash(`msg|${normalise(String(msg))}|${route}`);
    } catch {
        return 'unknown';
    }
}

function normalise(s) {
    // Strip the parts of a message that vary per occurrence (ids, numbers,
    // uuids) so "row 123 not found" and "row 456 not found" share a bucket.
    return String(s || '')
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
        .replace(/\d+/g, '<n>')
        .slice(0, 300);
}

function hash(s) {
    return createHash('sha1').update(s).digest('hex').slice(0, 32);
}

/**
 * Ask the shared bucket for one token. Resolves true if the event may be
 * sent, false otherwise. Never throws.
 *
 * @param {object} event  Sentry event (for the fingerprint)
 * @param {object} [opts] { daily, perFingerprint } overrides, for tests
 */
export async function takeBudget(event, opts = {}) {
    const daily = Number.isFinite(opts.daily) ? opts.daily : DAILY_BUDGET;
    const perFingerprint = Number.isFinite(opts.perFingerprint) ? opts.perFingerprint : FINGERPRINT_BUDGET;
    const fp = fingerprintOf(event);
    try {
        const sb = opts.client || (await getClient());
        if (!sb) {
            _dropped += 1;
            console.warn('[sentry-budget] dropped event: no service client (fail closed)', { fingerprint: fp });
            return false;
        }
        const { data, error } = await sb.rpc('fn_sentry_budget_take', {
            p_fingerprint: fp,
            p_daily_limit: daily,
            p_fingerprint_limit: perFingerprint,
        });
        if (error) {
            _dropped += 1;
            console.warn('[sentry-budget] dropped event: budget RPC failed (fail closed)', { fingerprint: fp, error: error.message || error });
            return false;
        }
        if (!data || data.allowed !== true) {
            _dropped += 1;
            console.warn('[sentry-budget] dropped event: budget exhausted', {
                fingerprint: fp,
                reason: data?.reason || 'unknown',
                sent_today: data?.sent,
                fingerprint_sent_today: data?.fingerprint_sent,
                daily_limit: daily,
                fingerprint_limit: perFingerprint,
            });
            return false;
        }
        return true;
    } catch (err) {
        _dropped += 1;
        console.warn('[sentry-budget] dropped event: budget check threw (fail closed)', { fingerprint: fp, error: err?.message || err });
        return false;
    }
}

/** Test hook: reset the cached client. */
export function _resetForTests() {
    _client = null;
    _dropped = 0;
}
