/**
 * POST /api/webhooks/twilio-status — Twilio delivery receipts
 * ═══════════════════════════════════════════════════════════════════════════
 * Dan, 2026-11-05: "GET TO THE ROOT CAUSE OF WHY THE TEXTS ... DIDN'T GO
 * THROUGH." Every text the platform sends was recorded as "sent" the moment
 * Twilio accepted it; nothing ever read the carrier's final answer, so the
 * owner's own phone had been rejecting every text (error 30005) for a week
 * unseen. sendSms (src/lib/dailyDigest/delivery.mjs) now asks Twilio to POST
 * each status change here, and this route records it in
 * public.sms_delivery_receipts, keyed by Twilio's message id.
 *
 * Auth: Twilio's X-Twilio-Signature (HMAC-SHA1 with TWILIO_AUTH_TOKEN over the
 * exact callback URL plus the sorted form fields). Anything unsigned is 403.
 * Always answers fast: Twilio retries on errors, and a receipt is best-effort.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { smsStatusCallbackUrl } from '../../../src/lib/dailyDigest/delivery.mjs';
import { signatureValid } from '../../../src/lib/sms/twilioSignature.mjs';

// Twilio can report statuses out of order; never let an earlier one overwrite a final one.
const FINAL = new Set(['delivered', 'undelivered', 'failed']);

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const token = (process.env.TWILIO_AUTH_TOKEN || '').trim();
    const params = typeof req.body === 'object' && req.body ? req.body : {};
    if (!signatureValid(token, smsStatusCallbackUrl(), params, req.headers['x-twilio-signature'])) {
        return res.status(403).json({ error: 'Invalid signature' });
    }
    const sid = String(params.MessageSid || params.SmsSid || '').slice(0, 64);
    const status = String(params.MessageStatus || params.SmsStatus || '').slice(0, 32);
    if (!sid || !status) return res.status(200).json({ ok: true, ignored: true });
    const code = Number.parseInt(params.ErrorCode, 10);
    try {
        const sb = createClient();
        const { data: prior } = await sb.from('sms_delivery_receipts').select('status').eq('sid', sid).maybeSingle();
        if (prior && FINAL.has(prior.status) && !FINAL.has(status)) return res.status(200).json({ ok: true, kept: prior.status });
        const { error } = await sb.from('sms_delivery_receipts').upsert({
            sid,
            to_number: params.To ? String(params.To).slice(0, 32) : null,
            status,
            error_code: Number.isFinite(code) ? code : null,
            error_message: params.ErrorMessage ? String(params.ErrorMessage).slice(0, 300) : null,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'sid' });
        if (error) console.error('[twilio-status] write failed', error.message);
    } catch (e) {
        console.error('[twilio-status]', String(e?.message || e));
    }
    return res.status(200).json({ ok: true });
}
