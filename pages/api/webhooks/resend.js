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
    parseCampaignTelemetrySummary,
} from '../../../src/lib/promoCampaigns/lifecycleEngine.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function extractResendCampaignId(tagsOrEvent) {
    if (!tagsOrEvent) return null;
    const rawTags = tagsOrEvent?.data?.tags ?? tagsOrEvent?.tags ?? tagsOrEvent;
    if (!rawTags) return null;
    if (Array.isArray(rawTags)) {
        for (const item of rawTags) {
            const name = String(item?.name || '').trim().toLowerCase();
            if (name === 'campaign_id' || name === 'campaignid') {
                const val = String(item?.value || '').trim();
                return UUID_RE.test(val) ? val.toLowerCase() : null;
            }
        }
        return null;
    }
    if (typeof rawTags === 'object') {
        const val = String(rawTags.campaign_id ?? rawTags.campaignId ?? '').trim();
        return UUID_RE.test(val) ? val.toLowerCase() : null;
    }
    return null;
}

export {
    verifySvixSignature,
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

const ENGAGEMENT_STAMPABLE_SOURCES = new Set(['owner_list_20261118', 'admin_import']);

/**
 * Cold-lead sunset shield: a real open or click proves the address is alive, so
 * stamp `engaged:YYYY-MM-DD` on active imported/unlabelled subscriber rows. Never
 * overwrites `pref:*`, `snooze:*`, unsubscribe or bounce/complaint sources.
 */
export function isEngagementStampableSource(source) {
    const raw = String(source || '').trim();
    if (!raw) return true;
    return ENGAGEMENT_STAMPABLE_SOURCES.has(raw) || raw.startsWith('engaged:');
}

export async function stampSubscriberEngagement(sb, recipientEmail, { now = new Date() } = {}) {
    const email = String(recipientEmail || '').trim().toLowerCase();
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) return 0;
    const stamp = `engaged:${now.toISOString().slice(0, 10)}`;
    let stamped = 0;
    try {
        const { data: rows } = await sb
            .from('newsletter_subscribers')
            .select('id, source, is_active')
            .ilike('email', email)
            .limit(20);
        for (const row of Array.isArray(rows) ? rows : []) {
            if (!row?.id || row.is_active === false) continue;
            if (!isEngagementStampableSource(row.source)) continue;
            if (String(row.source || '').trim() === stamp) continue;
            await sb.from('newsletter_subscribers').update({ source: stamp }).eq('id', row.id);
            stamped += 1;
        }
    } catch (err) {
        console.error('[resend-webhook-engagement]', String(err?.message || err));
    }
    return stamped;
}

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
        const rawEngagedTo = event?.data?.to;
        const engagedRecipients = (Array.isArray(rawEngagedTo) ? rawEngagedTo : rawEngagedTo ? [rawEngagedTo] : [])
            .map((addr) => String(addr || '').trim().toLowerCase())
            .filter((addr) => addr.length <= 254 && EMAIL_RE.test(addr))
            .slice(0, 5);
        let engagementStamped = 0;
        for (const recipientEmail of engagedRecipients) {
            try {
                engagementStamped += await stampSubscriberEngagement(createClient(), recipientEmail);
            } catch {
                /* engagement stamp is best-effort and never blocks telemetry */
            }
        }
        const campaignId = extractResendCampaignId(event?.data?.tags ?? event?.tags);
        if (!campaignId) {
            return res.status(200).json({ ok: true, ignored: true, reason: 'missing_campaign_id', type, engagementStamped });
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
                    engagementStamped,
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
                engagementStamped,
            });
        } catch (err) {
            console.error('[resend-webhook-telemetry]', String(err?.message || err));
            return res.status(200).json({ ok: true, ignored: true, reason: 'telemetry_update_error', type, engagementStamped });
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
