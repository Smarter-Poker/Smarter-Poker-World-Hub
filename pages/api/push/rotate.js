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
import { timingSafeEqual } from 'crypto';
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
            .select('id, user_id, auth, device_label, device_id')
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
        // Constant-time. This compares a 16-byte shared secret that decides
        // whether an unauthenticated caller may move a live subscription, so it
        // should not leak position-of-first-difference through timing. Cheap
        // insurance even though a remote timing attack over HTTPS is unlikely.
        const verified = timingSafeEquals(oldAuth, existing.auth);

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

        /* ═══ CARRY THE DEVICE IDENTITY ACROSS THE ROTATION ═══════════════════
           device_id is what says "the new row and the old row are the same
           phone". Dropping it here silently un-deduplicated every rotated
           device: `push_subscriptions_one_active_per_device_uidx` is
           `WHERE is_active AND device_id IS NOT NULL`, so a row without one is
           EXEMPT from the constraint that keeps a device to a single live
           subscription, and /api/push/subscribe's same-device retire, which
           matches on `.eq('device_id', ...)`, can never see it either.

           The effect was that this route -- whose entire purpose is to keep a
           device reachable across an endpoint change -- quietly created a
           second permanently-undeduplicable row for it. And it fires on
           exactly the events named in this file's own header (OS update,
           storage purge, long idle), so it re-broke the duplicate every time
           the platform healed itself. Measured 2026-08-30 on production: one
           account, 22 rows, 4 active for 2 physical devices, every one of them
           device_id = NULL.

           Note what was already here: device_label was preserved deliberately,
           with a comment explaining why losing it hurt. The field that
           actually prevents duplicate banners was dropped one line away. */
        if (existing.device_id) row.device_id = existing.device_id;

        /* ORDER MATTERS, AND IT IS THE OPPOSITE OF WHAT IT WAS.
           Now that the new row carries device_id, upserting it while the old
           row is still is_active violates the partial unique index above --
           two live rows, one user, one device. The retire therefore has to
           happen FIRST. subscribe.js has the same constraint and the same
           ordering; see the comment there. */
        const supersedes = verified && oldEndpoint !== endpoint;

        // Retire the superseded row ONLY on a proven rotation. Doing this for an
        // unverified caller is a free, unauthenticated mute button for any
        // endpoint an attacker has learned.
        if (supersedes) {
            await supabase
                .from('push_subscriptions')
                .update({ is_active: false, last_failure_reason: 'rotated', updated_at: nowIso })
                .eq('id', existing.id);
        }

        /* ═══ AND RETIRE EVERY OTHER LIVE ROW FOR THIS DEVICE ═════════════════
           /api/push/subscribe has done this since 2026-08-30 (see the long note
           there); this route never did, and it is the route BOTH service
           workers call from `pushsubscriptionchange`. So the one-live-endpoint-
           per-device invariant held on the enrol path and leaked on the
           self-heal path — which fires on exactly the events that produce the
           duplicate in the first place.

           MEASURED 2026-09-07. The Estate Digest arrived TWICE on one device at
           the same second, and the two copies were not identical: one was
           Title Cased and the other was not. That is the fingerprint, because
           this origin has two independently-enrolling push-capable service
           workers — `/sw.js` (worker/index.js, which Title Cases) and
           `/push/sw.js` (which does not) — so the two banners had come from two
           registrations, two endpoints, and two `push_subscriptions` rows.
           `push-dispatch.js` fans one outbox row out to every active row for
           the user, so one notification became two.

           The `tag` on the payload cannot save this: a tag replaces within ONE
           registration's notification list and never across registrations.

           The partial unique index only covers `device_id IS NOT NULL`, so a
           row descended from a legacy NULL-device_id ancestor is exempt from it
           forever — which is why the retire has to be explicit here rather than
           left to the constraint.

           ── `verified &&` IS LOAD-BEARING, AND IT WAS MISSING (2026-09-07) ──
           This shipped as a bare `if (row.device_id)`, which reopened the exact
           hole the block thirty lines above closes and whose comment names it:
           "an unverified caller is a free, unauthenticated mute button for any
           endpoint an attacker has learned."

           This route is UNAUTHENTICATED by design — it is called from a service
           worker's `pushsubscriptionchange`, where no session exists — so proof
           of possession of the OLD subscription's auth secret is the only thing
           standing between a caller and somebody else's notifications. Without
           the guard: post a victim's `oldEndpoint` with an endpoint of your own
           and no `oldKeys`, and `verified` is false, but line 178 still copies
           the victim's `device_id` onto the new row and this update then scopes
           to the victim's `user_id` and that `device_id` and switches off every
           live row for that device.

           That is strictly worse than the 2026-08-19 bug it echoes, which
           silenced one row rather than a whole device. `supersedes` already
           carries the same requirement for the single-row retire above; this
           one needs it for the same reason and is gated on the same flag. */
        if (verified && row.device_id) {
            const { error: retireErr } = await supabase
                .from('push_subscriptions')
                .update({
                    is_active: false,
                    last_failure_reason: 'superseded_same_device',
                    updated_at: nowIso,
                })
                .eq('user_id', existing.user_id)
                .eq('device_id', row.device_id)
                .eq('is_active', true)
                .neq('endpoint', endpoint);
            if (retireErr) {
                // Not fatal by itself, but the upsert below is about to meet the
                // partial unique index if a live row for this device is still
                // there, so say so rather than let it surface as a bare 500.
                console.warn('[push/rotate] same-device retire failed:', retireErr.message);
            }
        }

        const { error: upsertErr } = await supabase
            .from('push_subscriptions')
            .upsert(row, { onConflict: 'user_id,endpoint' });
        if (upsertErr) {
            // The retire above already ran, so this device currently has NO live
            // subscription. Put the old row back rather than leaving it dark:
            // the old endpoint is usually still deliverable, and a silent
            // unsubscribe is the failure this whole file exists to prevent.
            if (supersedes) {
                await supabase
                    .from('push_subscriptions')
                    .update({
                        is_active: true,
                        last_failure_reason: null,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', existing.id);
            }
            console.warn('[push/rotate] upsert failed:', upsertErr.message);
            return res.status(204).end();
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

/**
 * Constant-time string comparison. Returns false for missing/mismatched-length
 * input WITHOUT calling timingSafeEqual, which throws on length mismatch --
 * length is not the secret here, the bytes are.
 */
function timingSafeEquals(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length || bufA.length === 0) return false;
    return timingSafeEqual(bufA, bufB);
}
