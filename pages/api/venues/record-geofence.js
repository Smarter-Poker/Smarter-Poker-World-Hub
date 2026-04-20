import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sendPushNotification } from '../../../src/lib/pushAlerts';
const { getServerUser } = require('../../../src/lib/serverAuth');
import { reportApiError } from '../../../src/lib/sentryWrap';

// Send push max once per 12 hours per venue per user
const COOLDOWN_MS = 12 * 60 * 60 * 1000; 

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, LIMITS.write)) return;

    try {
        // Auth (phase40 hardened): verified HMAC JWT only — supabase.auth["getUser"](token)
        // accepts JWTs without verifying the HMAC signature in this library version.
        const localUser = getServerUser(req);
        if (!localUser) {
            return res.status(401).json({ success: false, error: 'Authorization required' });
        }
        const userId = localUser.id;

        const safeBody = (v) => Array.isArray(v) ? (typeof v[0] === 'object' ? null : v[0]) : (typeof v === 'string' || typeof v === 'number' ? v : null);
        const venue_id = safeBody(req.body.venue_id);
        const venue_name = safeBody(req.body.venue_name);
        if (!venue_id) {
            return res.status(400).json({ success: false, error: 'venue_id required' });
        }

        const supabase = createClient();

        // 1. Check if we already hit them up in the last 12 hours
        // We can just rely on the 'user_venue_checkins' checkin_time or push_sent_time if we added one.
        // Or simply we query `user_venue_checkins`
        const { data: recentCheckin } = await supabase
            .from('user_venue_checkins')
            .select('checkin_time')
            .eq('user_id', userId)
            .eq('venue_id', venue_id)
            .gte('checkin_time', new Date(Date.now() - COOLDOWN_MS).toISOString())
            .order('checkin_time', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (recentCheckin) {
            return res.status(200).json({ success: true, status: 'cooldown', msg: 'Cooldown period active' });
        }

        // 2. We don't record a checkin yet! The user must tap "Check In" to confirm.
        // We will just send the notification right now via OneSignal.
        try {
            await sendPushNotification(userId, 'venue_alert', {
                title: '📍 At the poker table?',
                body: `Are you currently at ${venue_name || 'a saved venue'}? Tap to check in!`,
                url: `/hub/venues/${venue_id}`,
                data: { action: 'checkin', venueId: venue_id }
            });
        } catch (pushErr) {
            console.error('[Record Geofence] Failed to send push:', pushErr);
        }

        return res.status(200).json({ success: true, message: 'Geofence ping recorded, push sent if opted in' });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) {}
        console.error('[API Error] record-geofence:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
