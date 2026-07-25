/**
 * OneSignal Server-Side Helpers for sending push notifications
 */
export async function sendPushNotification({ playerIds, externalIds, collapseId, heading, content, url, data = {}, options = {} }) {
    if (!process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || !process.env.ONESIGNAL_REST_API_KEY) {
        console.warn('[OneSignal Server] Missing App ID or API Key. Push notification aborted.');
        return { success: false, error: 'Missing OneSignal credentials' };
    }

    if ((!playerIds || playerIds.length === 0) && (!externalIds || externalIds.length === 0)) {
        return { success: false, error: 'No player IDs or external IDs provided' };
    }

    const payload = {
        app_id: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID,
        headings: { en: heading },
        contents: { en: content },
        url: url || 'https://smarter.poker/hub',
        data: data,
        ...options
    };

    if (playerIds && playerIds.length > 0) payload.include_player_ids = playerIds;
    if (externalIds && externalIds.length > 0) payload.include_aliases = { external_id: externalIds };
    if (collapseId) payload.collapse_id = collapseId;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8-second circuit breaker

        const response = await fetch('https://onesignal.com/api/v1/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Authorization': `Basic ${(process.env.ONESIGNAL_REST_API_KEY || '').trim()}`
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Defensive parsing: prevent unexpected HTML gateway errors from crashing the Node instance
        const textData = await response.text();
        let result;
        try {
            result = JSON.parse(textData);
        } catch (parseErr) {
            console.warn('[OneSignal Server] Non-JSON response received:', textData.substring(0, 500));
            return { success: false, error: 'Upstream Gateway Error: Invalid JSON response' };
        }
        
        if (response.ok && !result.errors) {
            return { success: true, result };
        } else {
            console.warn('[OneSignal Server] API returned an error:', result);
            return { success: false, error: result.errors || 'Unknown API Error' };
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            console.warn('[OneSignal Server] Request timed out after 8000ms');
            return { success: false, error: 'OneSignal API Timeout' };
        }
        console.warn('[OneSignal Server] Request failed:', e);
        return { success: false, error: e.message };
    }
}
