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
            // iOS Safari requires web_url for PWA clicks
            web_url: url || undefined,
            // Chrome also uses this
            chrome_web_link: url || undefined,
            data: data || undefined,
            buttons: buttons || undefined,
            big_picture: image || undefined,
            // 🔔 SOUND & VIBRATION - Make the phone actually ring!
            ios_sound: 'default', // Use phone's default notification sound
            android_sound: 'default',
            android_channel_id: null, // Use default channel
            priority: 10, // High priority for immediate delivery
            android_visibility: 1, // Show on lock screen
            ios_badgeType: 'Increase',
            ios_badgeCount: 1,
        };

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
            // Default: send to all subscribed users
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
