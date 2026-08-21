/**
 * POST/GET /api/messenger/dispatch-scheduled
 *
 * Sends messenger_scheduled rows that have come due.
 *
 * WHY THIS EXISTS: scheduleMessage() has been writing rows with status
 * 'pending' since it shipped, the UI lists them and can cancel them - and
 * nothing anywhere ever delivered one. Not pages/api/cron (28 handlers), not
 * vercel.json crons, not the Open Claw dispatcher, not pg_cron, not any
 * Postgres function. The table was write-only, so a user who scheduled a
 * message got a confirmation and then silence.
 *
 * The work itself is in fn_messenger_dispatch_scheduled, which claims rows
 * FOR UPDATE SKIP LOCKED so overlapping runs cannot double-send, and marks a
 * row 'failed' rather than retrying forever when its sender has left the
 * conversation.
 *
 * WHY NOT IN pages/api/cron/: CLAUDE.md section 11.3 blocks net-new files in
 * that directory at CI, and forbids pg_cron for application logic. The
 * sanctioned shape is a CRON_SECRET bearer on a normal route driven by Open
 * Claw - the same pattern /api/news/digest and /api/club-arena/union-invoice
 * use. Scheduled every 5 minutes.
 */
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

function isCronCall(req) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
    return bearer === secret || req.headers['x-cron-secret'] === secret;
}

export default async function handler(req, res) {
    try {
        if (!['GET', 'POST'].includes(req.method)) {
            res.setHeader('Allow', 'GET, POST');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        if (!isCronCall(req)) {
            if (!applyRateLimit(req, res, LIMITS.write)) return;
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const limit = Math.min(parseInt(req.query?.limit, 10) || 200, 1000);
        const { data, error } = await getSupabase()
            .rpc('fn_messenger_dispatch_scheduled', { p_limit: limit });

        if (error) {
            console.warn('[dispatch-scheduled] failed:', error.message);
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(200).json({ success: true, ...(data || {}) });
    } catch (err) {
        try { reportApiError(err, req); } catch (_e) { console.warn('[dispatch-scheduled] sentry failed'); }
        console.error('[dispatch-scheduled] error:', err.message);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}
