/* ═══════════════════════════════════════════════════════════════════════════
   ONESIGNAL — SEND PUSH NOTIFICATION API
   POST /api/notifications/send
   
   Send push notifications to users via OneSignal
   ═══════════════════════════════════════════════════════════════════════════ */

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
        return res.status(500).json({ error: 'OneSignal not configured' });
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
            return res.status(400).json({ error: 'Message is required' });
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

        console.log('Notification sent:', result);

        return res.status(200).json({
            success: true,
            notificationId: result.id,
            recipients: result.recipients,
        });

    } catch (error) {
        console.error('Send notification error:', error);
        return res.status(500).json({ error: 'Failed to send notification' });
    }
}
