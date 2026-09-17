/**
 * POST   /api/push/subscribe  -- persist a device push subscription
 * DELETE /api/push/subscribe  -- deactivate it
 *
 * Body (POST): { endpoint, keys: { p256dh, auth }, userAgent, deviceLabel }
 *
 * ONE ACCOUNT PER DEVICE: the same browser endpoint can only belong to one user
 * at a time. When a second account subscribes from the same endpoint, every row
 * owned by a DIFFERENT user for that endpoint is deactivated. Without this,
 * a shared phone leaks one user's notifications to the next person who logs in.
 *
 * Side effect: upserts notification_preferences.push_enabled = true, so the
 * gate in push-enqueue does not immediately suppress what the user just enabled.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit } from '../../../src/lib/apiRateLimit';
import { validatePushEndpoint, validatePushKeys } from '../../../src/lib/push/push-endpoint';
import { notify } from '../../../src/lib/notify';
import { changePushSubscription } from '../../../src/lib/push/subscription-ownership.mjs';

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

export default async function handler(req, res) {
    if (!['POST', 'DELETE'].includes(req.method)) {
        res.setHeader('Allow', 'POST, DELETE');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 10 writes / 60s per caller. Enrollment retries are legitimate; a loop is not.
    if (!applyRateLimit(req, res, { max: 10, windowMs: 60_000, scope: 'push-subscribe' })) return;

    const supabase = getSupabase();
    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user?.id) return res.status(401).json({ error: 'Not authenticated' });

    const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
    const endpoint = body?.endpoint;

    if (!endpoint || typeof endpoint !== 'string') {
        return res.status(400).json({ error: 'endpoint is required' });
    }

    // ---- DELETE: deactivate ------------------------------------------------
    if (req.method === 'DELETE') {
        try {
            await changePushSubscription(supabase, user.id, { endpoint }, false);
            return res.status(200).json({ ok: true, deactivated: true });
        } catch (e) {
            return res.status(e.status || 503).json({ error: e?.message || 'Failed to deactivate subscription' });
        }
    }

    // ---- POST: upsert ------------------------------------------------------
    /* THE CLUB ARENA APP (2026-09-08). A native device token (APNs via
       Firebase, or FCM) enrols through this same route with
       `transport: 'fcm'`: the token is the endpoint, there are no VAPID keys,
       and the push-service host check does not apply (a token is not a URL
       and is never dialled - Firebase is). Everything after this - one
       account per device, one live row per device, the preference flip - is
       the same for both transports. */
    const transport = body?.transport === 'fcm' ? 'fcm' : 'webpush';
    const platform = ['ios', 'android', 'web'].includes(body?.platform) ? body.platform : null;
    let p256dh = null;
    let auth = null;
    if (transport === 'fcm') {
        if (!/^[A-Za-z0-9_:.-]{20,4096}$/.test(endpoint)) {
            return res.status(400).json({ error: 'Malformed device token' });
        }
    } else {
        p256dh = body?.keys?.p256dh || body?.p256dh;
        auth = body?.keys?.auth || body?.auth;
        if (!p256dh || !auth) {
            return res.status(400).json({ error: 'keys.p256dh and keys.auth are required' });
        }

        // Endpoint host allowlist. web-push will dial ANY host:port it is handed,
        // carrying a valid VAPID JWT, and the failure body comes back into
        // last_failure_reason -- a column the row's owner can read through RLS. So
        // an unvalidated endpoint is a server-side request primitive with response
        // exfiltration. Validate before the value is ever persisted.
        const endpointCheck = validatePushEndpoint(endpoint);
        if (!endpointCheck.ok) {
            console.warn('[push/subscribe] rejected endpoint:', endpointCheck.reason, endpointCheck.host || '');
            return res.status(400).json({ error: 'Unsupported push service endpoint' });
        }
        // Wrong-shaped keys throw inside web-push with no statusCode, so they are
        // never classified as expired and get retried on every dispatch forever.
        const keyCheck = validatePushKeys(p256dh, auth);
        if (!keyCheck.ok) {
            return res.status(400).json({ error: 'Malformed subscription keys' });
        }
    }

    try {
        // The service-only RPC serializes competing account enrollments and
        // verifies stored key possession in the same transaction as retirement,
        // the new subscription, endpoint replacement, and the preference update.
        const rawDeviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : '';
        const deviceId = /^[A-Za-z0-9-]{8,64}$/.test(rawDeviceId) ? rawDeviceId : null;
        const result = await changePushSubscription(supabase, user.id, {
            endpoint, p256dh, auth, transport, platform, device_id: deviceId,
            user_agent: String(body.userAgent || req.headers['user-agent'] || '').slice(0, 500),
            device_label: body.deviceLabel ? String(body.deviceLabel).slice(0, 120) : null,
            replaces_endpoint: typeof body.replacesEndpoint === 'string' ? body.replacesEndpoint : null,
        }, true);
        for (const displacedUserId of result.displaced_user_ids) {
            try {
                await notify(supabase, {
                    userId: displacedUserId, type: 'system', withPush: false,
                    title: 'Notifications moved to another account',
                    body: 'Another account signed in on a device you had notifications enabled on, so they were turned off here. Re-enable them on your own device any time.',
                    url: '/hub/settings/notifications',
                });
            } catch { /* enrollment is already committed; this is a courtesy notice */ }
        }

        return res.status(200).json({ ok: true, subscribed: true });
    } catch (e) {
        return res.status(e.status || 503).json({ error: e?.message || 'Failed to save subscription' });
    }
}

function safeParse(s) {
    try { return JSON.parse(s); } catch { return {}; }
}
