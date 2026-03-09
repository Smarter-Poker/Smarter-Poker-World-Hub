/**
 * /api/notifications/geofence-alert.js
 *
 * Server-side endpoint that sends a targeted OneSignal push notification
 * when a user enters a geofence zone near a poker venue.
 *
 * POST body: { userId, venueId, venueName, venueType }
 * Response:  { success, messageId?, error? }
 */

import { createClient } from '../../../src/lib/supabaseServerClient';

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

// Rate-limit map: userId:venueId -> timestamp (in-memory, per-instance)
const rateLimitMap = new Map();
const RATE_LIMIT_MS = 4 * 60 * 60 * 1000; // 4 hours

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { userId, venueId, venueName, venueType } = req.body;

    if (!userId || !venueId || !venueName) {
        return res.status(400).json({ success: false, error: 'Missing required fields: userId, venueId, venueName' });
    }

    // BUG #241 FIX: Require JWT auth and verify caller is the target user
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });
    if (user.id !== userId) {
        return res.status(403).json({ success: false, error: 'Cannot send geofence alerts for other users' });
    }

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
        return res.status(503).json({ success: false, error: 'Push notifications not configured' });
    }

    // Server-side rate limit
    const rateLimitKey = `${userId}:${venueId}`;
    const lastSent = rateLimitMap.get(rateLimitKey);
    if (lastSent && Date.now() - lastSent < RATE_LIMIT_MS) {
        return res.status(429).json({ success: false, error: 'Rate limited — already notified for this venue recently' });
    }

    try {
        // Emoji based on venue type
        const venueEmoji = {
            casino: '🎲',
            card_room: '♠️',
            poker_club: '🃏',
            charity: '🎗️',
        }[venueType] || '📍';

        const payload = {
            app_id: ONESIGNAL_APP_ID,
            // Target by external user ID (set via OneSignal.login or link-user API)
            include_aliases: {
                external_id: [userId],
            },
            target_channel: 'push',
            headings: { en: `${venueEmoji} Poker Venue Nearby` },
            contents: { en: `You're near ${venueName}! Tap to log a session.` },
            // Deep link to bankroll manager with venue context
            url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker'}/hub/bankroll-manager?venue=${venueId}`,
            // Collapse duplicate notifications
            collapse_id: `geofence-${venueId}`,
            // Auto-dismiss after 1 hour
            ttl: 3600,
            // Small icon
            small_icon: 'ic_stat_notification',
            // Chrome/Firefox web push icon
            chrome_web_icon: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker'}/icons/icon-192.png`,
            // iOS-specific
            ios_badgeType: 'Increase',
            ios_badgeCount: 1,
            // Android channel for geofence alerts
            android_channel_id: process.env.ONESIGNAL_GEOFENCE_CHANNEL_ID || undefined,
            // Data payload for native app handling
            data: {
                type: 'geofence_alert',
                venueId,
                venueName,
                venueType,
                timestamp: new Date().toISOString(),
            },
        };

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
            // Success — update rate limit
            rateLimitMap.set(rateLimitKey, Date.now());

            // Prune old rate limit entries (prevent memory leak)
            const now = Date.now();
            for (const [key, ts] of rateLimitMap.entries()) {
                if (now - ts > RATE_LIMIT_MS) {
                    rateLimitMap.delete(key);
                }
            }

            return res.status(200).json({ success: true, messageId: result.id });
        }

        console.error('[GeofenceAlert] OneSignal error:', result);
        return res.status(500).json({ success: false, error: result.errors?.[0] || 'OneSignal push failed' });
    } catch (err) {
        console.error('[GeofenceAlert] Server error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
