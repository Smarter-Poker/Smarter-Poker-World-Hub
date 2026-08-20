/**
 * UNION -> CLUB WEEKLY SQUARE-UP INVOICE
 * =============================================================================
 * The delivery layer for fn_union_club_invoice, which computed the whole
 * statement but had no caller anywhere until now.
 *
 * ACTIONS
 *   preview  read-only. What the statement WOULD say for a period. Never
 *            persists, never sends. Safe to hit from a dashboard.
 *   issue    persists one settlement_invoices row per club (idempotent, one
 *            per club+period) and notifies club owners/admins in-app + push.
 *   send     issue, then email each club owner. Marks message_sent so a
 *            re-run never double-mails.
 *
 * WHY NOT IN pages/api/cron/: CLAUDE.md section 11.3 blocks net-new files in
 * that directory at CI. The sanctioned pattern for a scheduled endpoint that
 * lives elsewhere is the one /api/news/digest uses -- a CRON_SECRET bearer
 * check on a normal route. That is what this does.
 *
 * BELT AND BRACES: fn_union_settlement_cascade (pg_cron, Mondays 00:10 UTC)
 * already issues and notifies from inside Postgres. This route re-issuing is
 * a no-op by design; its unique job is the email leg. If the mail schedule
 * never fires, clubs still have their statement.
 *
 * AUTH: either a CRON_SECRET bearer (the Monday job) or a signed-in union
 * owner / union admin. Club owners read their own statements straight from
 * Supabase via ca_club_union_invoices; they do not come through here.
 */

const { createClient } = require('../../../src/lib/supabaseServerClient');
import { applyRateLimit } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const MIDWAY_UNION_ID = 'fade0000-0000-0000-0000-000000000001';
const MAX_CLUBS_PER_RUN = 500;

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

let _resend = null;
async function getResend() {
    if (_resend) return _resend;
    if (!process.env.RESEND_API_KEY) return null;
    const { Resend } = await import('resend');
    _resend = new Resend(process.env.RESEND_API_KEY);
    return _resend;
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

const money = (n) => {
    const v = Number(n || 0);
    return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function invoiceHtml({ unionName, clubName, row, dueAt, siteUrl }) {
    const outstanding = Number(row.outstanding || 0);
    const owesUnion = outstanding < 0;
    const headline = outstanding === 0
        ? 'You are square for the week'
        : owesUnion
            ? `${clubName} owes ${money(Math.abs(outstanding))}`
            : `${unionName} owes you ${money(Math.abs(outstanding))}`;

    const line = (label, value, note) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #E4E6EB;font-size:14px;color:#050505;">
            ${label}${note ? `<div style="color:#65676B;font-size:12px;margin-top:2px;">${note}</div>` : ''}
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #E4E6EB;font-size:14px;color:#050505;text-align:right;white-space:nowrap;">
            ${value}
          </td>
        </tr>`;

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${unionName} weekly statement</title></head>
<body style="margin:0;padding:0;background:#F0F2F5;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#FFFFFF;border:1px solid #DADDE1;border-radius:12px;overflow:hidden;">
    <div style="background:#1877F2;padding:24px;text-align:center;">
      <h1 style="color:#FFFFFF;margin:0;font-size:22px;font-weight:800;">${unionName}</h1>
      <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px;">Weekly statement for ${clubName}</p>
    </div>
    <div style="padding:24px;">
      <p style="font-size:13px;color:#65676B;margin:0 0 4px;">
        ${String(row.period_start).slice(0, 10)} to ${String(row.period_end).slice(0, 10)}
      </p>
      <h2 style="font-size:20px;font-weight:700;color:#050505;margin:0 0 20px;">${headline}</h2>

      <table style="width:100%;border-collapse:collapse;">
        ${line('Rake generated', money(row.rake_generated), 'Cash game rake from your players')}
        ${line('Your rakeback (90%)', money(row.rakeback_due), 'Already credited during the week')}
        ${line('Union fee kept (10%)', money(row.union_fee_kept), '')}
        ${line('Player win/loss', money(row.players_won), 'Negative means your players lost')}
        ${line('Settled in chips', money(row.settled_in_chips), 'Moved automatically during the week')}
        ${row.eco_enabled ? line('ECO adjustment', money(row.eco_amount), 'Win tax / loss rebate') : ''}
        ${Number(row.presettled || 0) !== 0 ? line('Payments received', money(row.presettled), '') : ''}
      </table>

      <div style="margin-top:20px;padding:16px;background:${owesUnion ? '#FFF3F3' : '#F0FBF4'};border-radius:8px;">
        <div style="font-size:12px;color:#65676B;text-transform:uppercase;letter-spacing:.4px;">
          ${owesUnion ? 'Amount due' : 'Amount owed to you'}
        </div>
        <div style="font-size:26px;font-weight:800;color:${owesUnion ? '#C0392B' : '#1B7F4B'};margin-top:4px;">
          ${money(Math.abs(outstanding))}
        </div>
        ${dueAt ? `<div style="font-size:12px;color:#65676B;margin-top:6px;">Due ${String(dueAt).slice(0, 10)}</div>` : ''}
      </div>

      <p style="font-size:13px;color:#65676B;line-height:1.6;margin:20px 0 0;">
        Player win/loss and rakeback already moved in chips during the week. The
        amount above is what is left to square up.
      </p>

      <p style="margin:24px 0 0;">
        <a href="${siteUrl}/hub/club-arena/" style="display:inline-block;padding:12px 28px;background:#1877F2;color:#FFFFFF;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
          Open Club Data
        </a>
      </p>
    </div>
  </div>
  <p style="text-align:center;color:#8A8D91;font-size:11px;margin:16px 0 0;">
    Sent by ${unionName} via smarter.poker
  </p>
</div>
</body></html>`;
}

function invoiceText({ unionName, clubName, row, dueAt }) {
    const outstanding = Number(row.outstanding || 0);
    const owesUnion = outstanding < 0;
    return [
        `${unionName} - weekly statement for ${clubName}`,
        `${String(row.period_start).slice(0, 10)} to ${String(row.period_end).slice(0, 10)}`,
        '',
        `Rake generated:      ${money(row.rake_generated)}`,
        `Your rakeback (90%): ${money(row.rakeback_due)}`,
        `Union fee kept:      ${money(row.union_fee_kept)}`,
        `Player win/loss:     ${money(row.players_won)}`,
        `Settled in chips:    ${money(row.settled_in_chips)}`,
        row.eco_enabled ? `ECO adjustment:      ${money(row.eco_amount)}` : null,
        '',
        owesUnion
            ? `AMOUNT DUE: ${money(Math.abs(outstanding))}`
            : `OWED TO YOU: ${money(Math.abs(outstanding))}`,
        dueAt ? `Due ${String(dueAt).slice(0, 10)}` : null,
        '',
        'Player win/loss and rakeback already moved in chips during the week.',
        'The amount above is what is left to square up.',
    ].filter(Boolean).join('\n');
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

        // ---- PREVIEW -------------------------------------------------------
        if (action === 'preview') {
            const { data, error } = await supabase.rpc('fn_union_club_invoice', {
                p_union_id: unionId,
                p_start: periodStart,
                p_end: periodEnd,
            });
            if (error) {
                console.warn('[union-invoice] preview failed:', error.message);
                return res.status(500).json({ success: false, error: error.message });
            }
            return res.status(200).json({ success: true, action, union_id: unionId, clubs: data || [] });
        }

        // ---- ISSUE ---------------------------------------------------------
        if (dryRun) {
            const { data, error } = await supabase.rpc('fn_union_club_invoice', {
                p_union_id: unionId, p_start: periodStart, p_end: periodEnd,
            });
            if (error) return res.status(500).json({ success: false, error: error.message });
            return res.status(200).json({
                success: true, action, dry_run: true, union_id: unionId,
                would_issue: (data || []).length, clubs: data || [],
            });
        }

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

        if (action === 'issue') {
            return res.status(200).json({ success: true, action, ...issued });
        }

        // ---- SEND (email leg) ----------------------------------------------
        const resend = await getResend();
        if (!resend) {
            return res.status(503).json({
                success: false,
                error: 'RESEND_API_KEY not configured - invoices were issued and delivered in-app, email skipped',
                issued,
            });
        }

        const from = process.env.UNION_INVOICE_FROM
            || process.env.NEWS_DIGEST_FROM
            || 'Smarter.Poker Unions <unions@smarter.poker>';
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker';

        const { data: union } = await supabase
            .from('unions').select('name').eq('id', unionId).maybeSingle();
        const unionName = union?.name || 'Your union';

        const { data: invoices, error: invErr } = await supabase
            .from('settlement_invoices')
            .select('id, club_id, net_amount, due_at, breakdown, message_sent')
            .eq('invoice_type', 'union_weekly_squareup')
            .eq('status', 'generated')
            .order('created_at', { ascending: false })
            .limit(MAX_CLUBS_PER_RUN);
        if (invErr) return res.status(500).json({ success: false, error: invErr.message });

        const periodKey = (issued?.period_start || '').slice(0, 10);
        const targets = (invoices || []).filter(
            (i) => !i.message_sent
                && String(i.breakdown?.union_id || '') === unionId
                && String(i.breakdown?.period_start || '').slice(0, 10) === periodKey
        );

        const results = [];
        for (const inv of targets) {
            const { data: club } = await supabase
                .from('clubs').select('name, owner_id').eq('id', inv.club_id).maybeSingle();
            if (!club?.owner_id) {
                results.push({ club_id: inv.club_id, sent: false, reason: 'no club owner' });
                continue;
            }
            const { data: owner } = await supabase
                .from('profiles').select('email').eq('id', club.owner_id).maybeSingle();
            const to = owner?.email;
            if (!to) {
                results.push({ club_id: inv.club_id, sent: false, reason: 'owner has no email' });
                continue;
            }

            const row = inv.breakdown || {};
            const payload = {
                unionName,
                clubName: club.name || row.club_name || 'your club',
                row,
                dueAt: inv.due_at,
                siteUrl,
            };

            try {
                await resend.emails.send({
                    from,
                    to: [to],
                    subject: `${unionName} weekly statement - ${payload.clubName}`,
                    html: invoiceHtml(payload),
                    text: invoiceText(payload),
                });
                const { error: markErr } = await supabase
                    .from('settlement_invoices')
                    .update({ message_sent: true, message_sent_at: new Date().toISOString() })
                    .eq('id', inv.id);
                if (markErr) {
                    console.warn('[Supabase] Silent mutation failed in settlement_invoices:', markErr.message);
                }
                results.push({ club_id: inv.club_id, sent: true });
            } catch (mailErr) {
                console.warn('[union-invoice] mail failed for club', inv.club_id, mailErr.message);
                results.push({ club_id: inv.club_id, sent: false, reason: mailErr.message });
            }
        }

        return res.status(200).json({
            success: true,
            action,
            ...issued,
            emails_attempted: targets.length,
            emails_sent: results.filter((r) => r.sent).length,
            results,
        });
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
