/**
 * /api/cron/daily-digest - Smarter.Poker Daily Operations Digest
 * ═══════════════════════════════════════════════════════════════════════════
 * One email to the owner at 7:00 AM Central about the previous Central day,
 * modelled on the Pep Nation Lab daily digest.
 *
 *   1. public.fn_sp_daily_digest(day) returns every metric, the 7 day series,
 *      month to date, the Monday week card and the Needs Your Attention items
 *      (each already handed to the alert-fixing fleet, with its status).
 *   2. Provider spend (Twilio, Vercel) and a three sentence Claude summary are
 *      added. The summary passes a number guard or is replaced by a plain one.
 *   3. The email is sent through Resend and the run is recorded in
 *      public.sp_daily_digest_runs (one row per day, so a retry never sends twice).
 *
 * Schedule (vercel.json): 12:00, 12:20, 12:40, 13:00, 13:20, 13:40 UTC. Only the
 * firings that land in the 7 AM Central hour act, so daylight saving cannot
 * move the send; the later firings in that hour are retries that the run log
 * turns into no-ops once the email is out.
 *
 * Manual use (CRON_SECRET): ?day=YYYY-MM-DD runs a past day, &force=1 re-sends
 * a day already sent, &dry=1 returns the rendered HTML without sending.
 * The 8:15 AM watchdog (fn_sp_digest_watchdog) pages if no send is recorded.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { withCronHealth } from '../../../src/lib/cronHealth';
import { assembleDigest } from '../../../src/lib/dailyDigest/assemble.mjs';
import { digestRecipients, sendEmail } from '../../../src/lib/dailyDigest/delivery.mjs';

export const config = { maxDuration: 300 };

function admin() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key, { auth: { persistSession: false } });
}

function chicagoNow() {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
        }).formatToParts(new Date()).map((p) => [p.type, p.value]),
    );
    return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
}

function previousDay(isoDate) {
    const d = new Date(`${isoDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}

async function handler(req, res) {
    try {
        if (!validateCronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
    } catch {
        return res.status(500).json({ error: 'Cron authentication is not configured' });
    }

    const sb = admin();
    if (!sb) return res.status(500).json({ error: 'Supabase service role not configured' });

    const now = chicagoNow();
    const manualDay = typeof req.query?.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.day) ? req.query.day : null;
    const force = req.query?.force === '1';
    const dry = req.query?.dry === '1';

    if (!manualDay && now.hour !== 7) {
        return res.status(200).json({ ok: true, skipped: true, reason: `not 7 AM Central (hour ${now.hour})` });
    }
    const day = manualDay || previousDay(now.date);

    if (dry) {
        const out = await assembleDigest(sb, day);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send(out.html);
    }

    const { data: claimed, error: claimErr } = await sb.rpc('fn_sp_digest_claim', { p_day: day, p_force: force });
    if (claimErr) return res.status(500).json({ ok: false, error: `claim: ${claimErr.message}` });
    if (!claimed) return res.status(200).json({ ok: true, skipped: true, reason: 'already sent or in progress', day });

    const recipients = digestRecipients();
    try {
        const out = await assembleDigest(sb, day);
        const sent = await sendEmail({
            to: recipients, subject: out.subject, html: out.html, text: out.text,
            idempotencyKey: force ? undefined : `sp-daily-digest-${day}`,
        });
        await sb.rpc('fn_sp_digest_finish', {
            p_day: day,
            p_status: sent.ok ? 'sent' : 'failed',
            p_resend_id: sent.id || null,
            p_recipients: recipients,
            p_subject: out.subject,
            p_ai_summary: out.ai ? `[${out.ai.source}${out.ai.reason ? `: ${out.ai.reason}` : ''}] ${out.ai.text}` : null,
            p_digest: out.digest,
            p_error: sent.ok ? null : sent.error,
        });
        if (!sent.ok) return res.status(502).json({ ok: false, day, error: sent.error });
        return res.status(200).json({
            ok: true, day, resend_id: sent.id, subject: out.subject,
            attention: (out.digest.attention || []).length, ai: out.ai?.source,
        });
    } catch (err) {
        const msg = String(err?.message || err).slice(0, 1000);
        await sb.rpc('fn_sp_digest_finish', {
            p_day: day, p_status: 'failed', p_resend_id: null, p_recipients: recipients,
            p_subject: null, p_ai_summary: null, p_digest: null, p_error: msg,
        });
        console.error('[daily-digest] failed', msg);
        return res.status(500).json({ ok: false, day, error: msg });
    }
}

export default withCronHealth('daily-digest', handler);
