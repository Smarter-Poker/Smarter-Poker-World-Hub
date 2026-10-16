/**
 * /api/cron/critical-pager - instant pages for money-critical conditions
 * ═══════════════════════════════════════════════════════════════════════════
 * Every 5 minutes. public.fn_sp_critical_scan() finds conditions that should
 * not wait for the morning digest (ledger invariant broken, unexplained chip
 * supply, a tournament stuck RUNNING, a failed Stripe webhook or payment
 * dispute, Diamond Spins funded below 2,500, the digest itself not delivered),
 * records each once in public.sp_critical_pages, hands it to the alert-fixing
 * fleet, and returns the pages still owed to the owner. This route emails and
 * texts each one, then marks it so it is never sent twice. A page that keeps
 * failing is retried up to 5 times.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { withCronHealth } from '../../../src/lib/cronHealth';
import { adminRecipients, sendEmail, sendSms } from '../../../src/lib/dailyDigest/delivery.mjs';
import { esc } from '../../../src/lib/dailyDigest/render.mjs';

export const config = { maxDuration: 60 };

function admin() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key, { auth: { persistSession: false } });
}

function pageEmail(p) {
    const when = new Date(p.detected_at).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const subject = `[Critical] Smarter.Poker: ${p.title}`.slice(0, 200);
    const detail = JSON.stringify(p.detail || {}, null, 2);
    const html = `<!doctype html><html><body style="margin:0;background:#05070a;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">`
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">`
        + `<table role="presentation" width="100%" style="max-width:600px;background:#0b0f14;border:1px solid #ef4444;border-radius:12px;"><tr><td style="padding:24px;">`
        + `<div style="color:#4fc1b3;font-weight:800;letter-spacing:3px;font-size:16px;">SMARTER.POKER</div>`
        + `<div style="color:#ef4444;font-weight:800;font-size:13px;letter-spacing:1.2px;margin-top:16px;">CRITICAL PAGE</div>`
        + `<div style="color:#ffffff;font-size:20px;font-weight:700;margin-top:6px;">${esc(p.title)}</div>`
        + `<div style="color:#8a97a8;font-size:12px;margin-top:6px;">Detected ${esc(when)} Central. Already sent to the alert-fixing fleet; it will show in tomorrow's digest with its status.</div>`
        + `<pre style="margin-top:16px;background:#121821;color:#e7edf3;padding:12px;border-radius:8px;font-size:12px;white-space:pre-wrap;">${esc(detail)}</pre>`
        + `</td></tr></table></td></tr></table></body></html>`;
    const text = `CRITICAL PAGE\n${p.title}\nDetected ${when} Central.\n\n${detail}`;
    return { subject, html, text };
}

async function handler(req, res) {
    try {
        if (!validateCronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
    } catch {
        return res.status(500).json({ error: 'Cron authentication is not configured' });
    }
    const sb = admin();
    if (!sb) return res.status(500).json({ error: 'Supabase service role not configured' });

    const { data, error } = await sb.rpc('fn_sp_critical_scan');
    if (error) return res.status(500).json({ ok: false, error: `scan: ${error.message}` });

    const results = [];
    for (const p of data?.pending || []) {
        let emailed = false;
        let texted = false;
        const errors = [];
        if (p.need_email) {
            const msg = pageEmail(p);
            const r = await sendEmail({ to: (await adminRecipients(sb)).map((a) => a.email), ...msg, idempotencyKey: `sp-critical-page-${p.id}` });
            emailed = r.ok;
            if (!r.ok) errors.push(r.error);
        }
        if (p.need_sms) {
            const r = await sendSms(`Smarter.Poker CRITICAL: ${p.title}`);
            texted = r.ok;
            if (!r.ok) errors.push(r.error);
        }
        await sb.rpc('fn_sp_critical_mark', { p_id: p.id, p_emailed: emailed, p_sms: texted, p_error: errors.length ? errors.join(' | ') : null });
        results.push({ id: p.id, rule: p.rule, emailed, texted, errors });
    }
    return res.status(200).json({ ok: true, new: data?.new ?? 0, sent: results });
}

export default withCronHealth('critical-pager', handler);
