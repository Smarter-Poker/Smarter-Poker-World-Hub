/**
 * POST /api/webhooks/resend - Resend bounce & spam-complaint suppression webhook
 *
 * Protects Smarter.Poker sender reputation by immediately marking bounced and
 * complained recipient addresses inactive in newsletter_subscribers (and
 * disabling marketing_enabled in notification_preferences when matched).
 *
 * Auth: Svix HMAC-SHA256 signature verification against RESEND_WEBHOOK_SECRET.
 * Fails closed so unauthenticated callers can never suppress real player emails.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { verifySvixSignature } from '../../../src/lib/email/svixSignature.mjs';
import {
    applyCampaignTelemetryEvent,
    extractResendCampaignId,
    parseCampaignTelemetrySummary,
} from '../../../src/lib/promoCampaigns/lifecycleEngine.mjs';

export {
    verifySvixSignature,
    extractResendCampaignId,
    parseCampaignTelemetrySummary,
    applyCampaignTelemetryEvent,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function readRawBody(req) {
    if (typeof req.body === 'string') return req.body;
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    return Buffer.concat(chunks).toString('utf8');
}

export const config = {
    api: {
        bodyParser: false,
    },
};

const SUPPRESS_EVENTS = new Set(['email.bounced', 'email.complained']);
const TELEMETRY_EVENTS = new Set(['email.opened', 'email.clicked']);
const TRACKABLE_CAMPAIGN_STATUSES = new Set(['sending', 'sent', 'partial']);

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const secret = (process.env.RESEND_WEBHOOK_SECRET || '').trim();
    if (!secret) return res.status(503).json({ error: 'RESEND_WEBHOOK_SECRET not configured' });

    let rawBody = '';
    try {
        rawBody = await readRawBody(req);
    } catch {
        return res.status(400).json({ error: 'Unable to read request body' });
    }

    if (!verifySvixSignature(rawBody, req.headers, secret)) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    let event;
    try {
        event = JSON.parse(rawBody);
    } catch {
        return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    const type = String(event?.type || '');
    if (TELEMETRY_EVENTS.has(type)) {
        const campaignId = extractResendCampaignId(event?.data?.tags ?? event?.tags);
        if (!campaignId) {
            return res.status(200).json({ ok: true, ignored: true, reason: 'missing_campaign_id', type });
        }
        try {
            const sb = createClient();
            const { data: campaign, error: readErr } = await sb
                .from('newsletter_campaigns')
                .select('id, status, error_summary')
                .eq('id', campaignId)
                .maybeSingle();

            if (readErr || !campaign || !TRACKABLE_CAMPAIGN_STATUSES.has(String(campaign.status || ''))) {
                return res.status(200).json({
                    ok: true,
                    ignored: true,
                    reason: campaign ? 'untrackable_status' : 'not_found',
                    type,
                });
            }

            const updated = applyCampaignTelemetryEvent(campaign.error_summary, type);
            await sb
                .from('newsletter_campaigns')
                .update({
                    error_summary: updated.errorSummary,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', campaign.id);

            return res.status(200).json({
                ok: true,
                tracked: true,
                type,
                campaignId,
                opens: updated.opens,
                clicks: updated.clicks,
            });
        } catch (err) {
            console.error('[resend-webhook-telemetry]', String(err?.message || err));
            return res.status(200).json({ ok: true, ignored: true, reason: 'telemetry_update_error', type });
        }
    }

    if (!SUPPRESS_EVENTS.has(type)) {
        return res.status(200).json({ ok: true, ignored: true, type });
    }

    const rawTo = event?.data?.to;
    const recipients = (Array.isArray(rawTo) ? rawTo : rawTo ? [rawTo] : [])
        .map((addr) => String(addr || '').trim().toLowerCase())
        .filter((addr) => addr.length <= 254 && EMAIL_RE.test(addr));

    const nowIso = new Date().toISOString();
    const source = type === 'email.complained' ? 'resend_complaint' : 'resend_bounce';
    let suppressed = 0;

    try {
        const sb = createClient();
        for (const email of recipients) {
            const { data: existingRows } = await sb
                .from('newsletter_subscribers')
                .select('id')
                .ilike('email', email)
                .limit(20);

            if (Array.isArray(existingRows) && existingRows.length > 0) {
                for (const row of existingRows) {
                    await sb
                        .from('newsletter_subscribers')
                        .update({ is_active: false, unsubscribed_at: nowIso, source })
                        .eq('id', row.id);
                }
            } else {
                await sb
                    .from('newsletter_subscribers')
                    .insert({ email, is_active: false, unsubscribed_at: nowIso, source });
            }
            suppressed += 1;

            const { data: matchedProfiles } = await sb
                .from('profiles')
                .select('id')
                .ilike('email', email)
                .limit(20);
            for (const profile of matchedProfiles || []) {
                if (!profile?.id) continue;
                await sb
                    .from('notification_preferences')
                    .upsert(
                        { user_id: profile.id, marketing_enabled: false, updated_at: nowIso },
                        { onConflict: 'user_id' }
                    );
            }
        }
    } catch (err) {
        console.error('[resend-webhook]', String(err?.message || err));
        return res.status(500).json({ error: 'Failed to record suppression' });
    }

    return res.status(200).json({ ok: true, suppressed, type });
}
