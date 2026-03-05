/**
 * /api/cron/license-reminders.js
 *
 * Vercel cron — runs daily at 9am UTC
 * Scans dealer_documents for gaming licenses expiring in ≤90 days
 * and sends OneSignal push reminders.
 *
 * Auth: Vercel cron sends Authorization: Bearer <CRON_SECRET> on GET.
 *       Manual POST also accepted for testing with x-cron-secret header.
 *
 * Rate limiting: stored in dealer_documents.last_reminder_sent_at  (persists across serverless instances)
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker';
const CRON_SECRET = process.env.CRON_SECRET;

const RATE_LIMIT_DAYS = 7;

function daysUntil(dateStr) {
    const now = new Date();
    const exp = new Date(dateStr + 'T12:00:00');
    return Math.floor((exp - now) / (1000 * 60 * 60 * 24));
}

function urgencyLabel(days) {
    if (days < 0) return { emoji: '🔴', text: 'EXPIRED' };
    if (days === 0) return { emoji: '🔴', text: 'expires TODAY' };
    if (days <= 7) return { emoji: '🔴', text: `expires in ${days} day${days !== 1 ? 's' : ''}` };
    return { emoji: '🟡', text: `expires in ${days} days` };
}

function isAuthorized(req) {
    const secret = CRON_SECRET;

    // Allow unauthenticated access in development when no secret is configured
    if (!secret) {
        if (process.env.NODE_ENV !== 'production') return true;
        console.error('[LicenseReminders] ⚠️ CRON_SECRET not set in production — all requests rejected. Add it to Vercel env vars.');
        return false;
    }

    // Vercel cron sends: Authorization: Bearer <CRON_SECRET>
    const authHeader = req.headers['authorization'] || '';
    if (authHeader === `Bearer ${secret}`) return true;

    // Manual POST with x-cron-secret header or body.secret
    if (req.method === 'POST') {
        const headerSecret = req.headers['x-cron-secret'];
        const bodySecret = req.body?.secret;
        if (headerSecret === secret || bodySecret === secret) return true;
    }

    return false;
}

export default async function handler(req, res) {
    // Allow GET (Vercel cron) or POST (manual trigger), both require auth
    if (!['GET', 'POST'].includes(req.method)) {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!isAuthorized(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
        return res.status(200).json({ skipped: true, reason: 'OneSignal not configured' });
    }

    try {
        const today = new Date();
        const in90Days = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
        const cutoffBack = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        // Rate limit cutoff: don't re-send to docs notified within RATE_LIMIT_DAYS
        const rateLimitCutoff = new Date(today.getTime() - RATE_LIMIT_DAYS * 24 * 60 * 60 * 1000).toISOString();

        // Fetch gaming licenses expiring within 90 days (or recently expired within 30 days)
        // AND not notified within the last 7 days (DB-level rate limit — persists across serverless instances)
        const { data: docs, error } = await supabaseAdmin
            .from('dealer_documents')
            .select('id, user_id, label, state, license_number, expiry_date, last_reminder_sent_at')
            .eq('category', 'gaming_license')
            .not('expiry_date', 'is', null)
            .gte('expiry_date', cutoffBack.toISOString().split('T')[0])
            .lte('expiry_date', in90Days.toISOString().split('T')[0])
            .or(`last_reminder_sent_at.is.null,last_reminder_sent_at.lt.${rateLimitCutoff}`)
                .limit(100);

        if (error) throw error;

        if (!docs || docs.length === 0) {
            return res.status(200).json({ sent: 0, skipped: 0 });
        }

        let sent = 0;
        let skipped = 0;

        for (const doc of docs) {
            const days = daysUntil(doc.expiry_date);
            const { emoji, text } = urgencyLabel(days);
            const licenseName = doc.label || `${doc.state || ''} Gaming License`.trim();
            const stateStr = doc.state ? ` (${doc.state})` : '';

            const payload = {
                app_id: ONESIGNAL_APP_ID,
                include_aliases: { external_id: [doc.user_id] },
                target_channel: 'push',
                headings: { en: `${emoji} License Renewal Reminder` },
                contents: { en: `Your ${licenseName}${stateStr} ${text}. Tap to renew now.` },
                url: `${SITE_URL}/hub/bankroll-manager`,
                collapse_id: `license-reminder-${doc.id}`,
                ttl: 86400,
                small_icon: 'ic_stat_notification',
                chrome_web_icon: `${SITE_URL}/icons/icon-192.png`,
                ios_badgeType: 'Increase',
                ios_badgeCount: 1,
                data: { type: 'license_reminder', docId: doc.id, daysUntilExpiry: days },
            };

            try {
                const response = await fetch('https://api.onesignal.com/notifications', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Key ${ONESIGNAL_REST_API_KEY}`,
                    },
                    body: JSON.stringify(payload),
                });
                const result = await response.json();

                if (result.id) {
                    // Persist timestamp to DB so rate limit survives serverless cold starts
                    await supabaseAdmin
                        .from('dealer_documents')
                        .update({ last_reminder_sent_at: new Date().toISOString() })
                        .eq('id', doc.id);
                    sent++;
                } else {
                    console.error(`[LicenseReminders] ❌ OneSignal error for doc ${doc.id}:`, result.errors);
                    skipped++;
                }
            } catch (pushErr) {
                console.error(`[LicenseReminders] Push error for doc ${doc.id}:`, pushErr.message);
                skipped++;
            }
        }

        return res.status(200).json({ sent, skipped, total: docs.length });

    } catch (err) {
        console.error('[LicenseReminders] Fatal error:', err);
        return res.status(500).json({ error: err.message });
    }
}
