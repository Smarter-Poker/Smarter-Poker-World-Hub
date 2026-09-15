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
import { timingSafeEqual } from 'crypto';

/**
 * Constant-time compare. Guards length separately because timingSafeEqual
 * throws on a length mismatch, and the length is not the secret.
 */
function timingSafeEquals(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length || bufA.length === 0) return false;
    return timingSafeEqual(bufA, bufB);
}

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

export default async function handler(req, res) {
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST, DELETE');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 10 writes / 60s per caller. Enrollment retries are legitimate; a loop is
    // not. GET is a read the client makes once per load, so it gets its own,
    // looser bucket rather than spending the enrolment budget.
    const limit = req.method === 'GET'
        ? applyRateLimit(req, res, { max: 60, windowMs: 60_000, scope: 'push-subscribe-status' })
        : applyRateLimit(req, res, { max: 10, windowMs: 60_000, scope: 'push-subscribe' });
    if (!limit) return;

    const supabase = getSupabase();
    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user?.id) return res.status(401).json({ error: 'Not authenticated' });

    const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
    const endpoint = req.method === 'GET'
        ? (typeof req.query?.endpoint === 'string' ? req.query.endpoint : '')
        : body?.endpoint;

    if (!endpoint || typeof endpoint !== 'string') {
        return res.status(400).json({ error: 'endpoint is required' });
    }

    /* ---- GET: does the SERVER still consider this endpoint live? ----------
       WHY THIS EXISTS. The client decided whether push was on by asking the
       BROWSER - hasLocalSubscription() reads pushManager.getSubscription() and
       nothing ever compared that against the server. So the two could disagree
       silently and for ever, and on 2026-09-15 they did: Dan's iPhone held a
       perfectly good local subscription while its server row had accepted
       twelve days of sends without once confirming one. The UI said
       notifications were on. They had not worked since 09-03.

       Returning the retirement REASON, not just a boolean, is the part that
       makes the loop terminate. An endpoint the server merely does not know
       about should be re-posted as-is. One retired as undeliverable must NOT
       be re-posted - that just resurrects the dead row - so the client throws
       the browser subscription away and mints a fresh one instead. */
    if (req.method === 'GET') {
        if (!validatePushEndpoint(endpoint).ok) {
            return res.status(400).json({ error: 'endpoint is not a recognised push host' });
        }
        try {
            const { data, error } = await supabase
                .from('push_subscriptions')
                .select('is_active, last_failure_reason')
                .eq('user_id', user.id)
                .eq('endpoint', endpoint)
                .order('updated_at', { ascending: false })
                .limit(1);
            if (error) throw new Error(error.message);
            const row = (data || [])[0] || null;
            return res.status(200).json({
                active: Boolean(row?.is_active),
                known: Boolean(row),
                // Only meaningful when active is false.
                reason: row?.is_active ? null : (row?.last_failure_reason || null),
            });
        } catch (e) {
            // A status read that fails must not be reported as "inactive" —
            // that would make the client tear down a working subscription on a
            // transient error. Unknown is its own answer.
            console.warn('[push/subscribe] status read failed:', e?.message || e);
            return res.status(503).json({ error: 'status unavailable' });
        }
    }

    // ---- DELETE: deactivate ------------------------------------------------
    if (req.method === 'DELETE') {
        try {
            await supabase
                .from('push_subscriptions')
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq('user_id', user.id)
                .eq('endpoint', endpoint);

            // If this was their last active device, flip push_enabled off so the
            // settings UI and the gate agree with reality.
            const { data: remaining } = await supabase
                .from('push_subscriptions')
                .select('id')
                .eq('user_id', user.id)
                .eq('is_active', true)
                .limit(1);

            if (!remaining || remaining.length === 0) {
                await supabase
                    .from('notification_preferences')
                    .upsert({ user_id: user.id, push_enabled: false, updated_at: new Date().toISOString() },
                        { onConflict: 'user_id' });
            }
            return res.status(200).json({ ok: true, deactivated: true });
        } catch (e) {
            return res.status(500).json({ error: e?.message || 'Failed to deactivate subscription' });
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

    const nowIso = new Date().toISOString();

    try {
        // ONE ACCOUNT PER DEVICE -- with proof of possession.
        //
        // This deactivates rows other users hold for the same endpoint, which is
        // what stops a shared phone leaking one person's notifications to the
        // next person who logs in. But taken on the caller's word alone it is
        // also a mute button: any authenticated user who learns someone's
        // endpoint could silence that device, and the victim would just see
        // themselves flagged as "subscription dead" on push-health as though it
        // were their own fault.
        //
        // The browser only hands `auth` to the origin that owns the
        // subscription, so requiring it to MATCH the stored secret proves the
        // caller is really sitting at that device. A mismatch means the endpoint
        // was learned some other way -- refuse, and leave the incumbent alone.
        const { data: incumbents } = await supabase
            .from('push_subscriptions')
            .select('id, user_id, auth')
            .eq('endpoint', endpoint)
            .eq('is_active', true)
            .neq('user_id', user.id);

        for (const row of incumbents || []) {
            // A native token has no keys: the same phone signing in as another
            // account IS the takeover, and it is allowed - the token can only
            // ever reach that one phone, so possession is proven by having it.
            if (transport === 'webpush' && !timingSafeEquals(auth, row.auth)) {
                console.warn('[push/subscribe] refused takeover of an endpoint without matching keys');
                return res.status(409).json({
                    error: 'This endpoint is registered to another account and the keys do not match.',
                });
            }
            await supabase
                .from('push_subscriptions')
                .update({ is_active: false, last_failure_reason: 'reassigned_to_other_user', updated_at: nowIso })
                .eq('id', row.id);

            // Tell the displaced account what happened. Being silently unsubscribed
            // is indistinguishable from push being broken, and that is precisely
            // the confusion this stack exists to eliminate. Bell only -- their
            // push on this device is exactly what just stopped working.
            try {
                await notify(supabase, {
                    userId: row.user_id,
                    type: 'system',
                    withPush: false,
                    title: 'Notifications moved to another account',
                    body: 'Another account signed in on a device you had notifications enabled on, so they were turned off here. Re-enable them on your own device any time.',
                    url: '/hub/settings/notifications',
                });
            } catch { /* never block enrollment on a courtesy notice */ }
        }

        /* ═══ ONE LIVE ENDPOINT PER DEVICE (Dan 2026-08-30) ═══════════════════
           `replacesEndpoint` below only works while the CLIENT still remembers
           what it is replacing. It does not after a service-worker reinstall,
           cleared site data or a PWA re-add — the browser mints a fresh
           endpoint and the old row is left is_active with nothing referencing
           it. The push service never 410s it (it is a perfectly valid
           endpoint), so nothing reaps it, and every send pays for it. Measured
           2026-08-29: one account, eleven active rows, nine redundant, and one
           seat offer delivered to the same iPhone twice.

           `deviceId` is a random id the client keeps in localStorage — stable
           across re-subscribes on one browser profile, different between
           devices. It is the only safe key here: the endpoint is not stable,
           and user_agent is not unique (two identical iPhones on one account
           produce byte-identical strings, and deduping on that would switch
           off one of the person's real devices).

           This runs BEFORE the upsert, and must: the partial unique index
           `push_subscriptions_one_active_per_device_uidx` would otherwise
           reject the insert of a second live row for the same device.

           Validated to the shape the client mints. An unusable value is
           ignored rather than rejected — a bad device id must never cost
           somebody their subscription, and without one they simply keep the
           pre-2026-08-30 behaviour. */
        const rawDeviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : '';
        const deviceId = /^[A-Za-z0-9-]{8,64}$/.test(rawDeviceId) ? rawDeviceId : null;

        if (deviceId) {
            const { error: retireErr } = await supabase
                .from('push_subscriptions')
                .update({
                    is_active: false,
                    last_failure_reason: 'superseded_same_device',
                    updated_at: nowIso,
                })
                .eq('user_id', user.id)
                .eq('device_id', deviceId)
                .eq('is_active', true)
                .neq('endpoint', endpoint);
            if (retireErr) {
                // Not fatal on its own, but the upsert below is about to hit
                // the unique index if a live row really is still there, so the
                // caller gets a real error rather than a confusing 500 later.
                console.warn('[push/subscribe] same-device retire failed:', retireErr.message);
            }
        }

        const { error: upsertErr } = await supabase
            .from('push_subscriptions')
            .upsert(
                {
                    user_id: user.id,
                    endpoint,
                    p256dh,
                    auth,
                    transport,
                    platform,
                    user_agent: String(body.userAgent || req.headers['user-agent'] || '').slice(0, 500),
                    device_label: body.deviceLabel ? String(body.deviceLabel).slice(0, 120) : null,
                    device_id: deviceId,
                    is_active: true,
                    failure_count: 0,
                    last_failure_reason: null,
                    updated_at: nowIso,
                },
                { onConflict: 'user_id,endpoint' }
            );

        if (upsertErr) return res.status(500).json({ error: upsertErr.message });

        // Retire the endpoint this subscription supersedes. The browser rotates
        // endpoints on VAPID-key change and on a failed-then-retried subscribe;
        // without this the superseded row stays is_active=true, inflating the
        // device count and costing a wasted send on every future notification.
        const replaces = body?.replacesEndpoint;
        if (replaces && typeof replaces === 'string' && replaces !== endpoint) {
            await supabase
                .from('push_subscriptions')
                .update({ is_active: false, last_failure_reason: 'superseded', updated_at: nowIso })
                .eq('user_id', user.id)
                .eq('endpoint', replaces);
        }

        await supabase
            .from('notification_preferences')
            .upsert({ user_id: user.id, push_enabled: true, browser_push: true, updated_at: nowIso },
                { onConflict: 'user_id' });

        return res.status(200).json({ ok: true, subscribed: true });
    } catch (e) {
        return res.status(500).json({ error: e?.message || 'Failed to save subscription' });
    }
}

function safeParse(s) {
    try { return JSON.parse(s); } catch { return {}; }
}
