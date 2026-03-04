/**
 * /api/cron/license-reminders.js
 *
 * Vercel cron — runs daily at 9am UTC
 * Scans dealer_documents for gaming licenses expiring in ≤90 days
 * and sends OneSignal push reminders (rate-limited to once per 7 days per doc)
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker';

// Rate-limit: in-memory map keyed by doc ID (per serverless instance)
const rateLimitMap = new Map();
const RATE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function daysUntil(dateStr) {
    const now = new Date();
    const exp = new Date(dateStr + 'T12:00:00');
    return Math.floor((exp - now) / (1000 * 60 * 60 * 24));
}

function urgencyLabel(days) {
    if (days < 0) return { emoji: '🔴', text: 'EXPIRED' };
    if (days === 0) return { emoji: '🔴', text: 'expires TODAY' };
    if (days <= 7) return { emoji: '🔴', text: `expires in ${days} day${days !== 1 ? 's' : ''}` };
    if (days <= 30) return { emoji: '🟡', text: `expires in ${days} days` };
    return { emoji: '🟡', text: `expires in ${days} days` };
}

export default async function handler(req, res) {
    // Allow Vercel cron (GET) or manual trigger (POST with secret)
    if (req.method === 'POST') {
        const secret = req.headers['x-cron-secret'] || req.body?.secret;
        if (secret !== process.env.CRON_SECRET) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    } else if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
        console.warn('[LicenseReminders] OneSignal not configured');
        return res.status(200).json({ skipped: true, reason: 'OneSignal not configured' });
    }

    try {
        const today = new Date();
        const in90Days = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

        // Fetch all gaming licenses expiring within 90 days (or already expired but within last 30 days)
        const cutoffBack = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

        const { data: docs, error } = await supabaseAdmin
            .from('dealer_documents')
            .select('id, user_id, label, state, license_number, expiry_date')
            .eq('category', 'gaming_license')
            .not('expiry_date', 'is', null)
            .gte('expiry_date', cutoffBack.toISOString().split('T')[0])
            .lte('expiry_date', in90Days.toISOString().split('T')[0]);

        if (error) throw error;

        if (!docs || docs.length === 0) {
            console.log('[LicenseReminders] No licenses to remind about');
            return res.status(200).json({ sent: 0, skipped: 0 });
        }

        let sent = 0;
        let skipped = 0;

        for (const doc of docs) {
            // Rate limit check
            const lastSent = rateLimitMap.get(doc.id);
            if (lastSent && Date.now() - lastSent < RATE_LIMIT_MS) {
                skipped++;
                continue;
            }

            const days = daysUntil(doc.expiry_date);
            const { emoji, text } = urgencyLabel(days);
            const licenseName = doc.label || `${doc.state || ''} Gaming License`.trim();
            const stateStr = doc.state ? ` (${doc.state})` : '';

            const payload = {
                app_id: ONESIGNAL_APP_ID,
                include_aliases: {
                    external_id: [doc.user_id],
                },
                target_channel: 'push',
                headings: { en: `${emoji} License Renewal Reminder` },
                contents: { en: `Your ${licenseName}${stateStr} ${text}. Tap to renew now.` },
                url: `${SITE_URL}/hub/bankroll-manager`,
                collapse_id: `license-reminder-${doc.id}`,
                ttl: 86400, // 24 hours
                small_icon: 'ic_stat_notification',
                chrome_web_icon: `${SITE_URL}/icons/icon-192.png`,
                ios_badgeType: 'Increase',
                ios_badgeCount: 1,
                data: {
                    type: 'license_reminder',
                    docId: doc.id,
                    daysUntilExpiry: days,
                },
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
                    rateLimitMap.set(doc.id, Date.now());
                    sent++;
                    console.log(`[LicenseReminders] ✅ Sent to user ${doc.user_id.slice(0, 8)} — ${licenseName} ${text}`);
                } else {
                    console.error(`[LicenseReminders] ❌ OneSignal error for doc ${doc.id}:`, result.errors);
                    skipped++;
                }
            } catch (pushErr) {
                console.error(`[LicenseReminders] Push error for doc ${doc.id}:`, pushErr.message);
                skipped++;
            }
        }

        // Prune old rate-limit entries
        const now = Date.now();
        for (const [key, ts] of rateLimitMap.entries()) {
            if (now - ts > RATE_LIMIT_MS) rateLimitMap.delete(key);
        }

        console.log(`[LicenseReminders] Done — sent: ${sent}, skipped: ${skipped}`);
        return res.status(200).json({ sent, skipped, total: docs.length });

    } catch (err) {
        console.error('[LicenseReminders] Fatal error:', err);
        return res.status(500).json({ error: err.message });
    }
}
