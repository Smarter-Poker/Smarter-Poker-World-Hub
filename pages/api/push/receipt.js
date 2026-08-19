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

    if (!applyRateLimit(req, res, { max: 60, windowMs: 60_000, scope: 'push-receipt' })) return;

    const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
    const endpoint = body?.endpoint;
    if (!endpoint || typeof endpoint !== 'string') {
        // Answer 204 rather than 400 -- the service worker cannot act on an
        // error and must never retry-loop against us.
        return res.status(204).end();
    }

    try {
        await getSupabase()
            .from('push_subscriptions')
            .update({ last_receipt_at: new Date().toISOString() })
            .eq('endpoint', endpoint);
    } catch {
        // Receipts are telemetry. Losing one is acceptable; erroring is not.
    }

    return res.status(204).end();
}

function safeParse(s) {
    try { return JSON.parse(s); } catch { return {}; }
}
