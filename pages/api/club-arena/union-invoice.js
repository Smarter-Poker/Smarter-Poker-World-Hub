/**
 * UNION -> CLUB WEEKLY SQUARE-UP INVOICE
 * =============================================================================
 * The trigger surface for fn_union_club_invoice, which computed the whole
 * statement but had no caller anywhere until 2026-08-20.
 *
 * ACTIONS
 *   preview  read-only. What the statement WOULD say for a period. Never
 *            persists, never sends. Safe to hit from a dashboard.
 *   issue    persist + deliver (same thing: delivery is part of issuing).
 *   send     alias of issue, kept because the Monday schedule calls it.
 *
 * DELIVERY IS THE CLUB MESSENGER, NOT EMAIL. Dan: "we aren't sending emails,
 * we use the club messenger as the internal messenger to send and receive
 * messages, images, and invoices." fn_union_issue_weekly_invoices writes the
 * statement into conversations + messages as message_type 'invoice' with the
 * full breakdown in metadata, so it lands in the inbox the club owner already
 * uses, and also raises a notification (which the existing trigger mirrors to
 * push). Nothing here talks to a mail provider.
 *
 * WHY NOT IN pages/api/cron/: CLAUDE.md section 11.3 blocks net-new files in
 * that directory at CI. The sanctioned pattern for a scheduled endpoint that
 * lives elsewhere is the one /api/news/digest uses -- a CRON_SECRET bearer
 * check on a normal route. That is what this does.
 *
 * BELT AND BRACES: fn_union_settlement_cascade (pg_cron, Mondays 00:10 UTC)
 * already issues and delivers from inside Postgres. This route running later
 * the same morning is a no-op if that worked, and the safety net if it did
 * not. Everything downstream is idempotent: one invoice per club per period,
 * and message_sent stops a statement being delivered twice.
 *
 * AUTH: either a CRON_SECRET bearer (the Monday job) or a signed-in union
 * owner / union admin. Club owners read their own statements straight from
 * Supabase via ca_club_union_invoices; they do not come through here.
 */

const { createClient } = require('../../../src/lib/supabaseServerClient');
import { applyRateLimit } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const MIDWAY_UNION_ID = 'fade0000-0000-0000-0000-000000000001';

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

const isUUID = (v) =>
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function isCronCall(req) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
    return bearer === secret || req.headers['x-cron-secret'] === secret;
}

/** Union owner, union admin, or platform admin. */
async function verifyUnionLead(supabase, token, unionId) {
    if (!token) return { ok: false, status: 401, error: 'No auth token' };
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return { ok: false, status: 401, error: 'Invalid token' };

    const { data: union } = await supabase
        .from('unions').select('owner_id').eq('id', unionId).maybeSingle();
    if (union?.owner_id === user.id) return { ok: true, user };

    const { data: admin } = await supabase
        .from('union_admins').select('user_id')
        .eq('union_id', unionId).eq('user_id', user.id).maybeSingle();
    if (admin) return { ok: true, user };

    const { data: profile } = await supabase
        .from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    if (profile?.is_admin) return { ok: true, user };

    return { ok: false, status: 403, error: 'Union owner or admin only' };
}

export default async function handler(req, res) {
    if (!['GET', 'POST'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const supabase = getSupabase();
        const q = { ...(req.query || {}), ...(req.method === 'POST' ? (req.body || {}) : {}) };

        const action = String(q.action || 'preview').toLowerCase();
        const unionId = isUUID(q.unionId) ? q.unionId : MIDWAY_UNION_ID;
        const dryRun = q.dryRun === '1' || q.dryRun === true || q.dryRun === 'true';

        if (!['preview', 'issue', 'send'].includes(action)) {
            return res.status(400).json({ success: false, error: 'Unknown action' });
        }

        const cron = isCronCall(req);
        if (!cron) {
            if (!applyRateLimit(req, res, { scope: 'club-arena/union-invoice', max: 30 })) return;
            const token = (req.headers.authorization || '').replace('Bearer ', '') || null;
            const auth = await verifyUnionLead(supabase, token, unionId);
            if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });
        }

        // Default period is the week that just closed, matching the settlement
        // cascade (date_trunc('week', now()) - 7 days .. date_trunc('week', now())).
        const periodStart = q.start ? new Date(q.start).toISOString() : null;
        const periodEnd = q.end ? new Date(q.end).toISOString() : null;

        // ---- PREVIEW / DRY RUN: compute only, never persist, never deliver --
        if (action === 'preview' || dryRun) {
            const { data, error } = await supabase.rpc('fn_union_club_invoice', {
                p_union_id: unionId,
                p_start: periodStart,
                p_end: periodEnd,
            });
            if (error) {
                console.warn('[union-invoice] preview failed:', error.message);
                return res.status(500).json({ success: false, error: error.message });
            }
            return res.status(200).json({
                success: true,
                action,
                dry_run: dryRun || undefined,
                union_id: unionId,
                clubs: data || [],
            });
        }

        // ---- ISSUE + DELIVER --------------------------------------------------
        const { data: issued, error: issueErr } = await supabase.rpc('fn_union_issue_weekly_invoices', {
            p_union_id: unionId,
            p_start: periodStart,
            p_end: periodEnd,
            p_notify: true,
        });
        if (issueErr) {
            console.warn('[union-invoice] issue failed:', issueErr.message);
            return res.status(500).json({ success: false, error: issueErr.message });
        }
        if (issued && issued.success === false) {
            return res.status(403).json({ success: false, error: issued.error });
        }

        return res.status(200).json({ success: true, action, ...issued });
    } catch (err) {
        reportApiError(err, req);
        console.error('[union-invoice] error:', err.message);
        return res.status(500).json({
            success: false,
            error: 'Internal error',
            detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
        });
    }
}
