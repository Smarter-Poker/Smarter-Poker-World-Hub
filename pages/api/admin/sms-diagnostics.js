/**
 * /api/admin/sms-diagnostics — Twilio delivery observability
 * ═══════════════════════════════════════════════════════════════════════════
 * [2026-07-26] Built because an OTP request returned HTTP 200 ("Verification
 * code sent") and the SMS never arrived. Twilio ACCEPTS a message and delivers
 * it asynchronously — so a 200 from /api/sms/send-otp only proves Twilio queued
 * it, NOT that any carrier delivered it. Until now nothing in this codebase
 * ever read back a message's final status or error code, so silent delivery
 * failure (the single most common SMS failure mode) was invisible.
 *
 * This endpoint asks Twilio directly what happened to recent messages.
 *
 * Auth: Bearer <CRON_SECRET>  (same posture as the cron/ops endpoints;
 *       ADMIN_ROUTE_SECRET is not set in this project's prod env)
 *
 * GET /api/admin/sms-diagnostics             → last 20 outbound messages
 * GET /api/admin/sms-diagnostics?to=+1708... → filter to one recipient
 *
 * Common errorCode values you will see here:
 *   30032 — toll-free number not verified (US carriers block unverified 8xx)
 *   30034 — A2P 10DLC campaign not registered for a long-code sender
 *   30007 — carrier filtering / spam block
 *   30003 — unreachable handset      30005 — unknown/inactive number
 *   21608 — trial account: recipient not on the verified-caller-ID list
 */

import { reportApiError } from '../../../src/lib/sentryWrap';

const SID = (process.env.TWILIO_ACCOUNT_SID || '').trim();
const TOKEN = (process.env.TWILIO_AUTH_TOKEN || '').trim();
const FROM = (process.env.TWILIO_PHONE_NUMBER || '').trim();

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

        const auth = req.headers.authorization || '';
        const secret = (process.env.CRON_SECRET || '').trim();
        const adminSecret = process.env.ADMIN_ROUTE_SECRET;
        const ok =
            (secret && auth === `Bearer ${secret}`) ||
            (adminSecret && req.headers['x-admin-secret'] === adminSecret);
        if (!ok) return res.status(401).json({ error: 'Unauthorized' });

        if (!SID || !TOKEN) {
            return res.status(500).json({ error: 'Twilio not configured', hasSid: !!SID, hasToken: !!TOKEN });
        }

        const basic = Buffer.from(`${SID}:${TOKEN}`).toString('base64');
        const params = new URLSearchParams({ PageSize: '20' });
        if (req.query.to) params.set('To', String(req.query.to));

        const url = `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json?${params}`;
        const r = await fetch(url, { headers: { Authorization: `Basic ${basic}` } });
        const body = await r.json().catch(() => ({}));

        if (!r.ok) {
            return res.status(r.status).json({
                error: 'Twilio API error',
                twilioStatus: r.status,
                twilioMessage: body?.message,
                twilioCode: body?.code,
            });
        }

        const messages = (body.messages || []).map((m) => ({
            sid: m.sid,
            to: m.to,
            from: m.from,
            status: m.status,          // queued|sending|sent|delivered|undelivered|failed
            errorCode: m.error_code,
            errorMessage: m.error_message,
            dateSent: m.date_sent,
            direction: m.direction,
        }));

        const failed = messages.filter((m) => m.errorCode || ['failed', 'undelivered'].includes(m.status));

        return res.status(200).json({
            configuredFrom: FROM,
            fromIsTollFree: /^\+1(800|833|844|855|866|877|888)/.test(FROM),
            counts: {
                total: messages.length,
                delivered: messages.filter((m) => m.status === 'delivered').length,
                sent: messages.filter((m) => m.status === 'sent').length,
                queued: messages.filter((m) => ['queued', 'accepted', 'sending'].includes(m.status)).length,
                failed: failed.length,
            },
            failures: failed,
            messages,
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_e) { /* never let logging break the handler */ }
        return res.status(500).json({ error: err?.message || 'unknown' });
    }
}
