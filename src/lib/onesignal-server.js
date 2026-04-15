/**
 * OneSignal Server-Side Helpers for sending push notifications
 */
export async function sendPushNotification({ playerIds, heading, content, url, data = {} }) {
    if (!process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || !process.env.ONESIGNAL_REST_API_KEY) {
        console.warn('[OneSignal Server] Missing App ID or API Key. Push notification aborted.');
        return { success: false, error: 'Missing OneSignal credentials' };
    }

    if (!playerIds || playerIds.length === 0) {
        return { success: false, error: 'No player IDs provided' };
    }

    const payload = {
        app_id: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID,
        include_player_ids: playerIds,
        headings: { en: heading },
        contents: { en: content },
        url: url || 'https://smarter.poker/hub',
        data: data
    };

    try {
        const response = await fetch('https://onesignal.com/api/v1/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Authorization': `Basic ${process.env.ONESIGNAL_REST_API_KEY}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        
        if (response.ok && !result.errors) {
            return { success: true, result };
        } else {
            console.error('[OneSignal Server] API returned an error:', result);
            return { success: false, error: result.errors || 'Unknown API Error' };
        }
    } catch (e) {
        console.error('[OneSignal Server] Request failed:', e);
        return { success: false, error: e.message };
    }
}
