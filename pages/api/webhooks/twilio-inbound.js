/**
 * POST /api/webhooks/twilio-inbound - Inbound SMS STOP / START compliance webhook
 *
 * Records carrier/handset opt-outs (STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT)
 * and re-subscriptions (START, UNSTOP, YES) in newsletter_subscribers (as sms:<E.164>)
 * and mirrors opt-outs to notification_preferences when a profile owns that phone.
 *
 * Auth: Twilio X-Twilio-Signature (HMAC-SHA1 with TWILIO_AUTH_TOKEN). Fails closed.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { signatureValid } from '../../../src/lib/sms/twilioSignature.mjs';
import { sendablePhone } from '../../../src/lib/promoCampaigns/dispatch.mjs';

const OPT_OUT_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const OPT_IN_WORDS = new Set(['START', 'UNSTOP', 'YES']);

export function twilioInboundCallbackUrl(req) {
    const explicit = (process.env.TWILIO_INBOUND_WEBHOOK_URL || '').trim();
    if (explicit) return explicit;
    const proto = String(req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || 'smarter.poker').split(',')[0].trim();
    return `${proto}://${host}/api/webhooks/twilio-inbound`;
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const token = (process.env.TWILIO_AUTH_TOKEN || '').trim();
    const params = typeof req.body === 'object' && req.body ? req.body : {};
    if (!signatureValid(token, twilioInboundCallbackUrl(req), params, req.headers['x-twilio-signature'])) {
        return res.status(403).json({ error: 'Invalid signature' });
    }

    const phone = sendablePhone(params.From);
    const keyword = String(params.Body || '').trim().toUpperCase().split(/\s+/)[0] || '';
    const nowIso = new Date().toISOString();

    if (phone && (OPT_OUT_WORDS.has(keyword) || OPT_IN_WORDS.has(keyword))) {
        const optingOut = OPT_OUT_WORDS.has(keyword);
        const smsKey = `sms:${phone}`;
        try {
            const sb = createClient();
            const { data: existingRows } = await sb
                .from('newsletter_subscribers')
                .select('id')
                .ilike('email', smsKey)
                .limit(20);

            const rows = Array.isArray(existingRows) ? existingRows : [];
            if (rows.length > 0) {
                await sb
                    .from('newsletter_subscribers')
                    .update({
                        is_active: !optingOut,
                        unsubscribed_at: optingOut ? nowIso : null,
                        source: optingOut ? 'sms_opt_out' : 'sms_opt_in',
                    })
                    // in-list: bounded sms:<phone> subscriber rows
                    .in('id', rows.map((r) => r.id).slice(0, 20));
            } else {
                const insertPayload = {
                    email: smsKey.toLowerCase(),
                    is_active: !optingOut,
                    unsubscribed_at: optingOut ? nowIso : null,
                    source: optingOut ? 'sms_opt_out' : 'sms_opt_in',
                };
                if (!optingOut) {
                    insertPayload.subscribed_at = nowIso;
                }
                await sb
                    .from('newsletter_subscribers')
                    .insert(insertPayload);
            }

            // Mirror handset SMS opt-out (STOP) or re-subscription (START) strictly onto
            // `sms_enabled` without disabling `marketing_enabled` (so SMS STOP never kills
            // a player's Weekly Wire email subscription, and SMS START restores SMS delivery).
            const digits10 = phone.startsWith('+1') ? phone.slice(2) : null;
            const candidates = digits10 ? [phone, digits10, `1${digits10}`] : [phone];
            // in-list: bounded to at most 3 phone representations for one handset
            const { data: matchedProfiles } = await sb
                .from('profiles')
                .select('id')
                .in('phone', candidates.slice(0, 3))
                .limit(20);
            for (const p of matchedProfiles || []) {
                if (!p?.id) continue;
                await sb
                    .from('notification_preferences')
                    .upsert(
                        {
                            user_id: p.id,
                            sms_enabled: !optingOut,
                            ...(!optingOut ? { mute_all: false } : {}),
                            updated_at: nowIso,
                        },
                        { onConflict: 'user_id' }
                    );
            }
        } catch (err) {
            console.error('[twilio-inbound]', String(err?.message || err));
        }
    }

    res.setHeader('Content-Type', 'text/xml; charset=utf-8');
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
}
