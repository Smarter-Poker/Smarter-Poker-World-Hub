/**
 * POST /api/push/rotate  -- SESSION-LESS subscription rotation.
 *
 * Body: { oldEndpoint, endpoint, keys: { p256dh, auth }, oldKeys?: { p256dh, auth } }
 *
 * WHY THIS IS NOT AUTHENTICATED
 * A service worker cannot read localStorage, and smarter.poker authenticates
 * API routes with a Bearer JWT held there -- so the SW physically cannot present
 * credentials. But the browser fires `pushsubscriptionchange` at moments the
 * user is not around to re-authenticate (OS update, storage purge, long idle),
 * and dropping that event lets the endpoint die silently while the server keeps
 * reporting success. That is the zombie-subscription failure this stack exists
 * to eliminate.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SECURITY REWRITE, 2026-08-19. The previous version was exploitable.
 *
 * Its stated argument was: "the worst a caller can do with a stolen endpoint is
 * redirect that one device's own pushes." That was wrong. `user_id` was copied
 * from the matched row, but `endpoint`, `p256dh` and `auth` were taken from the
 * request and written as an ACTIVE subscription. So an unauthenticated caller
 * who learned a victim's endpoint could submit their OWN browser subscription
 * and thereafter receive every notification issued to that user -- direct
 * messages, security notices -- decrypted, on the attacker's device. The
 * victim's real row was then deactivated, so they got no signal at all. That is
 * full notification interception, not a redirect.
 *
 * WHAT MAKES IT SAFE NOW
 * 1. PROOF OF POSSESSION. Migrating an ACTIVE subscription requires the caller
 *    to echo the old subscription's `auth` secret, which is known only to the
 *    browser that owns it and to us. Knowing the endpoint alone is no longer
 *    enough. (Chrome/Firefox expose `event.oldSubscription`; the SW forwards
 *    its keys.)
 * 2. UNVERIFIED ROTATIONS ARE QUARANTINED. Safari does not always populate
 *    `oldSubscription`. Rather than refuse the heal outright, the new row is
 *    written with is_active = FALSE. No push is ever sent to an unverified
 *    endpoint. PushSubscriptionSync re-enrols it through the AUTHENTICATED
 *    /api/push/subscribe on the next app open, which activates it.
 * 3. HOST ALLOWLIST + KEY SHAPE. Both endpoints must belong to a real push
 *    service and share the same one, closing the SSRF/exfiltration primitive
 *    (see src/lib/push/push-endpoint.js).
 *
 * Still: no row is ever created for an unknown endpoint, no user is inferred
 * from the request, and no data is returned.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit } from '../../../src/lib/apiRateLimit';
import {
    validatePushEndpoint,
    validatePushKeys,
    samePushService,
} from '../../../src/lib/push/push-endpoint';

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, { max: 20, windowMs: 60_000, scope: 'push-rotate' })) return;

    const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
    const oldEndpoint = body?.oldEndpoint;
    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh || body?.p256dh;
    const auth = body?.keys?.auth || body?.auth;
    const oldAuth = body?.oldKeys?.auth || null;

    // A service worker cannot act on an error, so every rejection is a silent
    // 204. The reasons are logged server-side instead.
    if (!oldEndpoint || !endpoint || !p256dh || !auth) return res.status(204).end();

    const oldValid = validatePushEndpoint(oldEndpoint);
    const newValid = validatePushEndpoint(endpoint);
    const keysValid = validatePushKeys(p256dh, auth);
    if (!oldValid.ok || !newValid.ok || !keysValid.ok) {
        console.warn('[push/rotate] rejected:', {
            old: oldValid.reason, new: newValid.reason, keys: keysValid.reason,
        });
        return res.status(204).end();
    }
    if (!samePushService(oldEndpoint, endpoint)) {
        console.warn('[push/rotate] rejected: push service changed across rotation');
        return res.status(204).end();
    }

    try {
        const supabase = getSupabase();

        // NOT .maybeSingle(): push_subscriptions is UNIQUE(user_id, endpoint),
        // NOT unique on endpoint alone, and subscribe.js deliberately KEEPS the
        // displaced row (is_active=false) when a device changes account. So a
        // shared phone legitimately has 2+ rows per endpoint, and .maybeSingle()
        // errored with PGRST116 -- silently disabling self-heal forever on
        // exactly the devices that need it most.
        const { data: rows, error: lookupErr } = await supabase
            .from('push_subscriptions')
            .select('id, user_id, auth, device_label')
            .eq('endpoint', oldEndpoint)
            .eq('is_active', true)
            .order('updated_at', { ascending: false })
            .limit(1);

        if (lookupErr) {
            console.warn('[push/rotate] lookup failed:', lookupErr.message);
            return res.status(204).end();
        }

        const existing = rows && rows[0];
        // Unknown old endpoint: nothing to migrate. Never create a row here --
        // that would let an anonymous caller invent subscriptions.
        if (!existing?.user_id) return res.status(204).end();

        // PROOF OF POSSESSION. Only a caller that already holds the old
        // subscription's auth secret may hand us an ACTIVE replacement.
        const verified = Boolean(oldAuth) && oldAuth === existing.auth;

        // UNVERIFIED CALLERS MUST NOT TOUCH A LIVE ROW.
        //
        // Quarantining the NEW row stopped interception, but an unverified caller
        // could still cause DENIAL: submit the victim's oldEndpoint plus any
        // endpoint of their own and the deactivation below would silence the
        // victim's real device. And when oldEndpoint === endpoint, the upsert
        // itself would overwrite the victim's live keys with is_active=false.
        // Both are unauthenticated and repeatable. So: if we cannot prove
        // possession, and the target row is already live, do nothing at all.
        if (!verified && oldEndpoint === endpoint) {
            console.warn('[push/rotate] unverified self-rotation ignored (would overwrite a live row)');
            return res.status(204).end();
        }

        const nowIso = new Date().toISOString();
        const row = {
            user_id: existing.user_id,
            endpoint,
            p256dh,
            auth,
            is_active: verified, // unverified rotations are quarantined
            failure_count: 0,
            last_failure_reason: verified ? null : 'awaiting_reverification',
            updated_at: nowIso,
        };
        // Preserve the human label; overwriting it with 'auto-healed' destroyed
        // whatever the device was called on the settings screen.
        if (existing.device_label) row.device_label = existing.device_label;

        const { error: upsertErr } = await supabase
            .from('push_subscriptions')
            .upsert(row, { onConflict: 'user_id,endpoint' });
        if (upsertErr) {
            console.warn('[push/rotate] upsert failed:', upsertErr.message);
            return res.status(204).end();
        }

        // Retire the superseded row ONLY on a proven rotation. Doing this for an
        // unverified caller is a free, unauthenticated mute button for any
        // endpoint an attacker has learned.
        if (verified && oldEndpoint !== endpoint) {
            await supabase
                .from('push_subscriptions')
                .update({ is_active: false, last_failure_reason: 'rotated', updated_at: nowIso })
                .eq('id', existing.id);
        }

        return res.status(204).end();
    } catch (e) {
        console.warn('[push/rotate] threw:', e?.message || e);
        return res.status(204).end();
    }
}

function safeParse(s) {
    try { return JSON.parse(s); } catch { return {}; }
}
