/* ═══════════════════════════════════════════════════════════════════════════
   ONESIGNAL — LINK USER ID API
   POST /api/notifications/link-user
   
   Links a Supabase user ID to their OneSignal player ID via REST API
   (Fallback because OneSignal.login() JavaScript SDK isn't working)
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
        const { playerId, userId } = req.body;

        if (!playerId || !userId) {
            return res.status(400).json({ error: 'playerId and userId are required' });
        }

        console.log('[OneSignal] Linking player', playerId, 'to user', userId);

        // Update the player's external_user_id via REST API
        const response = await fetch(`https://onesignal.com/api/v1/players/${playerId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
            },
            body: JSON.stringify({
                app_id: ONESIGNAL_APP_ID,
                external_user_id: userId,
            }),
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('[OneSignal] Link failed:', result);
            return res.status(response.status).json({
                error: result.errors?.[0] || 'Failed to link user',
                details: result
            });
        }

        console.log('[OneSignal] Link successful:', result);

        return res.status(200).json({
            success: true,
            message: 'User linked to OneSignal',
        });

    } catch (error) {
        console.error('[OneSignal] Link user error:', error);
        return res.status(500).json({ error: 'Failed to link user' });
    }
}
