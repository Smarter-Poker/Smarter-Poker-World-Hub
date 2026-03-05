/* ═══════════════════════════════════════════════════════════════════════════
   ONESIGNAL — SEND PUSH NOTIFICATION API
   POST /api/notifications/send
   
   Send push notifications to users via OneSignal.
   Auth: Bearer token required.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
        return res.status(500).json({ success: false, error: 'OneSignal not configured' });
    }

    // ── Auth: verify JWT identity OR admin secret (for internal server-to-server calls) ──
    const adminSecret = req.headers['x-admin-secret'];
    const envSecret = process.env.ADMIN_ROUTE_SECRET;
    const hasAdminAuth = envSecret && adminSecret === envSecret;

    if (!hasAdminAuth) {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
        const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

        // BUG #243 FIX: JWT users can only send to specific users (not broadcast to segments)
        // This prevents any authenticated user from spamming all users via segments: ['All']
        const { segments, playerIds, externalUserIds, tags } = req.body;
        if (segments || tags || (playerIds && playerIds.length > 5) || (externalUserIds && externalUserIds.length > 5)) {
            return res.status(403).json({ success: false, error: 'Broadcast notifications require admin access' });
        }
        if (!externalUserIds?.length && !playerIds?.length) {
            return res.status(400).json({ success: false, error: 'Must specify target user(s) for notification' });
        }
    }

    try {
        const {
            title,
            message,
            url,
            // Target options (use one):
            segments,        // e.g., ['All', 'Active Users']
            playerIds,       // Array of OneSignal player IDs
            externalUserIds, // Array of your database user IDs
            tags,            // Tag filters
            // Optional:
            data,            // Custom data payload
            buttons,         // Action buttons
            image,           // Image URL
            isCall,          // NEW: Is this a call notification?
            callType,        // NEW: 'voice' or 'video'
            roomName,        // NEW: Room to join if accepted
            callerId,        // NEW: Who is calling
        } = req.body;

        if (!message) {
            return res.status(400).json({ success: false, error: 'Message is required' });
        }

        // Build notification payload
        const notification = {
            app_id: ONESIGNAL_APP_ID,
            contents: { en: message },
            headings: title ? { en: title } : undefined,
            url: url || undefined,
            web_url: url || undefined,
            chrome_web_link: url || undefined,
            data: data || undefined,
            buttons: buttons || undefined,
            big_picture: image || undefined,
        };

        // 📞 SPECIAL HANDLING FOR CALLS - Make it ring like a real call!
        if (isCall) {
            // Custom data for the call
            notification.data = {
                ...notification.data,
                isCall: true,
                callType: callType || 'voice',
                roomName: roomName || '',
                callerId: callerId || '',
            };

            // Android: High priority + ringtone sound + persistent
            notification.priority = 10; // Highest priority
            notification.android_visibility = 1; // Show on lock screen
            notification.android_sound = 'ringtone'; // Use ringtone sound
            notification.android_channel_id = '80694c07-ed3b-4016-9525-083b5f59d812'; // OneSignal "Incoming Calls" channel
            notification.ttl = 120; // Expire after 2 minutes (call timeout)

            // iOS: Critical alert style for calls
            notification.ios_sound = 'ringtone.wav'; // Custom ringtone (if uploaded)
            notification.ios_interruption_level = 'time-sensitive'; // Bypass Do Not Disturb
            notification.ios_relevance_score = 1.0; // Highest relevance

            // Web: Require interaction (don't auto-dismiss)
            notification.web_push_topic = `call-${callerId}`; // Replace previous call notifs
            notification.chrome_web_badge = '/icons/call-badge.png';

            // Action buttons for call
            notification.buttons = [
                { id: 'accept', text: '✓ Accept', icon: 'ic_call_accept' },
                { id: 'decline', text: '✗ Decline', icon: 'ic_call_decline' },
            ];
            notification.web_buttons = [
                { id: 'accept', text: '✓ Accept', url: url || 'https://smarter.poker/hub/messenger' },
                { id: 'decline', text: '✗ Decline', url: 'https://smarter.poker/hub' },
            ];
        } else {
            // Regular notification settings
            notification.ios_sound = 'default';
            notification.android_sound = 'default';
            notification.android_channel_id = null;
            notification.priority = 10;
            notification.android_visibility = 1;
            notification.ios_badgeType = 'Increase';
            notification.ios_badgeCount = 1;
        }

        // Set targeting
        if (playerIds && playerIds.length > 0) {
            notification.include_player_ids = playerIds;
        } else if (externalUserIds && externalUserIds.length > 0) {
            notification.include_external_user_ids = externalUserIds;
            notification.channel_for_external_user_ids = 'push';
        } else if (tags) {
            notification.filters = tags;
        } else if (segments && segments.length > 0) {
            notification.included_segments = segments;
        } else {
            notification.included_segments = ['Subscribed Users'];
        }

        // Send to OneSignal API
        const response = await fetch('https://onesignal.com/api/v1/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
            },
            body: JSON.stringify(notification),
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('OneSignal error:', result);
            return res.status(response.status).json({
                error: result.errors?.[0] || 'Failed to send notification',
                details: result
            });
        }


        return res.status(200).json({
            success: true,
            notificationId: result.id,
            recipients: result.recipients,
        });

    } catch (error) {
        console.error('Send notification error:', error);
        return res.status(500).json({ success: false, error: 'Failed to send notification' });
    }
}
