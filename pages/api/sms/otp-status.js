/**
 * GET /api/sms/otp-status?sid=SM... — the carrier's answer for one verification code
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-11-07. A code "sent" only meant Twilio accepted it; a new player asked
 * for a code 42 seconds after signing up on 2026-11-06 and nothing told them
 * it never arrived. send-otp now returns the message id and asks Twilio for a
 * status callback (pages/api/webhooks/twilio-status.js records it in
 * sms_delivery_receipts). The verify screen asks here, and on 'undelivered'
 * or 'failed' tells the player straight away and lets them send a new code.
 *
 * Reveals only the delivery state of a message id the caller already holds
 * (Twilio ids are 32 random hex digits): never a number, never a code.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { otpDeliveryAnswer } from '../../../src/lib/sms/codeDelivery.mjs';

const SID = /^SM[0-9a-f]{32}$/;

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    if (!applyRateLimit(req, res, LIMITS.read || { max: 120, windowMs: 60_000 })) return;
    const sid = String(req.query.sid || '');
    if (!SID.test(sid)) return res.status(400).json({ error: 'Invalid message id' });
    try {
        const { data, error } = await createClient()
            .from('sms_delivery_receipts').select('status, error_code').eq('sid', sid).maybeSingle();
        if (error) return res.status(200).json({ state: 'pending' });
        return res.status(200).json(otpDeliveryAnswer(data));
    } catch {
        return res.status(200).json({ state: 'pending' });
    }
}
