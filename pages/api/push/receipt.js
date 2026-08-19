/**
 * POST /api/push/receipt
 *
 * Called by the SERVICE WORKER -- not by app code -- immediately after
 * showNotification() resolves.
 *
 * WHY THIS ROUTE EXISTS, and why it must never be deleted as "unused":
 * FCM and Apple both answer 2xx for subscriptions whose device is long gone.
 * "Accepted" is NOT "delivered". last_receipt_at is the ONLY ground truth that
 * a push actually painted pixels on a physical screen. /api/cron/push-health
 * compares last_used_at against last_receipt_at to find zombie subscriptions --
 * the exact failure mode where the server reports 100 percent success and the
 * user's phone has been silent for a week.
 *
 * Deliberately session-less: the service worker may run with no auth cookie.
 * The endpoint string is the identifier, and knowing it grants nothing beyond
 * bumping a timestamp.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit } from '../../../src/lib/apiRateLimit';
import { validatePushEndpoint } from '../../../src/lib/push/push-endpoint';

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Receipts are unauthenticated (a service worker cannot read the Bearer
    // token) and therefore bucket purely by IP. 60/min is far too tight: every
    // user behind one carrier CGNAT shares the bucket, so a broadcast push to a
    // few hundred people on the same mobile network would 429 most receipts --
    // and a missing receipt is exactly what push-health reads as a ZOMBIE
    // device. The write is a single idempotent timestamp column, so the cost of
    // a high ceiling is negligible compared to the cost of false zombies.
    if (!applyRateLimit(req, res, { max: 1000, windowMs: 60_000, scope: 'push-receipt' })) return;

    const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
    const endpoint = body?.endpoint;
    if (!endpoint || typeof endpoint !== 'string') {
        // Answer 204 rather than 400 -- the service worker cannot act on an
        // error and must never retry-loop against us.
        return res.status(204).end();
    }

    // Validate the shape before it reaches a query. This route is session-less
    // by necessity, so the endpoint string is the only thing identifying the
    // row; an arbitrary string here is at best a wasted write and at worst a
    // probe. Same allowlist the subscribe/rotate paths use.
    if (!validatePushEndpoint(endpoint).ok) {
        return res.status(204).end();
    }

    try {
        // Scope the update to ACTIVE rows only. A receipt cannot revive a
        // subscription we already retired, and letting it touch inactive rows
        // would let a stale worker keep a dead endpoint looking healthy.
        await getSupabase()
            .from('push_subscriptions')
            .update({ last_receipt_at: new Date().toISOString() })
            .eq('endpoint', endpoint)
            .eq('is_active', true);
    } catch {
        // Receipts are telemetry. Losing one is acceptable; erroring is not.
    }

    return res.status(204).end();
}

function safeParse(s) {
    try { return JSON.parse(s); } catch { return {}; }
}
