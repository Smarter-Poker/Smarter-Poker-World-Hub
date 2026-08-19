/**
 * push-client.js -- BROWSER ONLY. Push enrollment for smarter.poker.
 *
 * Flow: permission -> VAPID key -> SW ready -> subscribe -> persist to server.
 *
 * ---------------------------------------------------------------------------
 * HARDENING -- every line below exists because of a real failure. Do not
 * "simplify" this file.
 * ---------------------------------------------------------------------------
 *
 * 1. withTimeout() wraps EVERY await. iOS can wedge pushManager.subscribe()
 *    indefinitely with no error and no rejection. Without per-step timeouts the
 *    "Enabling..." spinner hangs forever and the user concludes push is broken.
 *
 * 2. Notification.requestPermission() is called FIRST, before any network
 *    fetch. iOS only honours the permission prompt while the originating user
 *    tap gesture is still active. Fetching the VAPID key first can exhaust that
 *    gesture window on a slow connection, and the OS prompt then never appears
 *    at all -- silently.
 *
 * 3. applicationServerKeyMatches() detects an existing subscription created
 *    with a different VAPID key and re-subscribes instead of leaving a
 *    subscription that will 403 on every send.
 *
 * 4. One automatic retry: if subscribe() fails, the stale subscription is
 *    force-dropped and the subscribe is attempted once more.
 */

import { getAccessToken } from './authUtils';

/**
 * AUTH NOTE: smarter.poker API routes authenticate with a Bearer JWT pulled
 * from the `smarter-poker-auth` localStorage key -- NOT with cookies. Every
 * authenticated fetch in this file must carry that header or it 401s.
 */
function authHeaders(extra) {
    const token = getAccessToken();
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(extra || {}),
    };
}

const T = {
    permission: 90_000, // a human needs time to read the OS dialog
    vapid: 10_000,
    register: 10_000,
    ready: 10_000,
    getSubscription: 8_000,
    subscribe: 20_000,
    save: 10_000,
};

function withTimeout(promise, ms, label) {
    return Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
        ),
    ]);
}

export function isWebPushSupported() {
    if (typeof window === 'undefined') return false;
    return (
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window
    );
}

export function notificationPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
}

/**
 * iOS only exposes the Push API inside an installed PWA (Add to Home Screen).
 * In a plain Safari tab isWebPushSupported() is false, and the honest answer to
 * the user is "install the app first", not "something went wrong".
 */
export function isIosStandalonePwa() {
    if (typeof window === 'undefined') return false;
    return window.navigator.standalone === true ||
        window.matchMedia?.('(display-mode: standalone)')?.matches === true;
}

export function isIos() {
    if (typeof window === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
    return output;
}

function bufferToBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** True when an existing subscription was created with the VAPID key we now use. */
function applicationServerKeyMatches(subscription, vapidKey) {
    try {
        const existing = subscription?.options?.applicationServerKey;
        if (!existing) return true; // cannot tell -- assume fine rather than churn
        return bufferToBase64Url(existing) === vapidKey;
    } catch {
        return true;
    }
}

function deviceLabel() {
    const ua = navigator.userAgent || '';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return 'Android';
    if (/Macintosh/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows';
    return 'Browser';
}

async function fetchVapidKey() {
    const res = await withTimeout(
        fetch('/api/push/vapid-public-key'),
        T.vapid,
        'VAPID key fetch'
    );
    if (!res.ok) {
        if (res.status === 503) throw new Error('Push is not configured on this deployment yet.');
        throw new Error(`Could not load the push key (${res.status})`);
    }
    const json = await res.json();
    if (!json?.key) throw new Error('Push key response was empty');
    return json.key;
}

async function getRegistration() {
    // next-pwa registers /sw.js itself, but on a cold first visit `ready` can
    // outrun that. Register explicitly, then wait for ready.
    try {
        await withTimeout(navigator.serviceWorker.register('/sw.js'), T.register, 'Service worker registration');
    } catch {
        // Already registered, or registration raced. `ready` below is the real gate.
    }
    return withTimeout(navigator.serviceWorker.ready, T.ready, 'Service worker startup');
}

async function persistSubscription(subscription) {
    const json = subscription.toJSON();
    const res = await withTimeout(
        fetch('/api/push/subscribe', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                endpoint: subscription.endpoint,
                keys: json.keys,
                userAgent: navigator.userAgent,
                deviceLabel: deviceLabel(),
            }),
        }),
        T.save,
        'Saving your subscription'
    );
    if (res.status === 401) throw new Error('You need to be signed in to enable notifications.');
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Could not save subscription (${res.status})`);
    }
    return true;
}

/**
 * Enable push on this device.
 * @returns {Promise<{ ok: boolean, error?: string, permission?: string }>}
 */
export async function enablePush() {
    if (!isWebPushSupported()) {
        if (isIos() && !isIosStandalonePwa()) {
            return {
                ok: false,
                error: 'On iPhone and iPad, add Smarter Poker to your Home Screen first. Tap Share, then Add to Home Screen, then open it from there.',
            };
        }
        return { ok: false, error: 'This browser does not support push notifications.' };
    }

    // -- STEP 1: permission FIRST, while the tap gesture is still alive -------
    let permission = Notification.permission;
    if (permission === 'default') {
        try {
            permission = await withTimeout(Notification.requestPermission(), T.permission, 'Permission prompt');
        } catch (e) {
            return { ok: false, error: e?.message || 'The permission prompt did not respond.' };
        }
    }
    if (permission !== 'granted') {
        return {
            ok: false,
            permission,
            error: permission === 'denied'
                ? 'Notifications are blocked for this site. Turn them back on in your browser settings and try again.'
                : 'Notification permission was not granted.',
        };
    }

    try {
        // -- STEP 2: key + worker --------------------------------------------
        const vapidKey = await fetchVapidKey();
        const registration = await getRegistration();

        // -- STEP 3: reuse or replace an existing subscription ----------------
        let subscription = await withTimeout(
            registration.pushManager.getSubscription(),
            T.getSubscription,
            'Reading the existing subscription'
        );

        if (subscription && !applicationServerKeyMatches(subscription, vapidKey)) {
            // Subscribed under a different VAPID key -- every send would 403.
            try { await subscription.unsubscribe(); } catch { /* ignore */ }
            subscription = null;
        }

        if (!subscription) {
            try {
                subscription = await withTimeout(
                    registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(vapidKey),
                    }),
                    T.subscribe,
                    'Subscribing this device'
                );
            } catch (firstError) {
                // -- one automatic retry: drop whatever is stuck, try once more.
                try {
                    const stale = await registration.pushManager.getSubscription();
                    if (stale) await stale.unsubscribe();
                } catch { /* ignore */ }
                subscription = await withTimeout(
                    registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(vapidKey),
                    }),
                    T.subscribe,
                    'Subscribing this device (retry)'
                );
            }
        }

        // -- STEP 4: persist ---------------------------------------------------
        await persistSubscription(subscription);
        clearOptOut();
        return { ok: true, permission: 'granted' };
    } catch (e) {
        return { ok: false, error: e?.message || 'Could not enable notifications.' };
    }
}

/**
 * Explicit opt-out marker.
 *
 * Turning push off does NOT revoke the OS permission — Notification.permission
 * stays 'granted'. PushSubscriptionSync only skips when permission is not
 * granted, so without this marker it would silently re-subscribe the device on
 * the next boot or visibility change, undoing a deliberate user choice. That is
 * a consent bug, not a UX wrinkle.
 */
const OPT_OUT_KEY = 'sp_push_opt_out';

export function isOptedOut() {
    try { return Boolean(localStorage.getItem(OPT_OUT_KEY)); } catch { return false; }
}
function setOptOut() {
    try { localStorage.setItem(OPT_OUT_KEY, String(Date.now())); } catch { /* ignore */ }
}
function clearOptOut() {
    try { localStorage.removeItem(OPT_OUT_KEY); } catch { /* ignore */ }
}

/** Turn push off on this device: unsubscribe locally AND deactivate server-side. */
export async function disablePush() {
    // Record the choice even if the unsubscribe below fails — the user asked
    // for off, and the sync loop must honour that regardless.
    setOptOut();
    if (!isWebPushSupported()) return { ok: true };
    try {
        const registration = await withTimeout(navigator.serviceWorker.ready, T.ready, 'Service worker startup');
        const subscription = await withTimeout(
            registration.pushManager.getSubscription(),
            T.getSubscription,
            'Reading the existing subscription'
        );
        if (subscription) {
            // Timeout the DELETE: it is awaited before the local unsubscribe, so
            // a stalled request used to block "off" entirely.
            await withTimeout(
                fetch('/api/push/subscribe', {
                    method: 'DELETE',
                    headers: authHeaders(),
                    body: JSON.stringify({ endpoint: subscription.endpoint }),
                }),
                T.save,
                'Removing your subscription'
            ).catch(() => null);
            try { await subscription.unsubscribe(); } catch { /* ignore */ }
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e?.message || 'Could not disable notifications.' };
    }
}

/** Fire a test push at this account. Resolves with how many devices accepted it. */
export async function sendTestPush() {
    try {
        const res = await withTimeout(
            fetch('/api/push/test', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({}),
            }),
            15_000,
            'Test push'
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, error: json?.error || `Test failed (${res.status})` };
        return { ok: json.ok === true, sent: json.sent || 0, error: json.ok ? undefined : (json.hint || json.reason) };
    } catch (e) {
        return { ok: false, error: e?.message || 'Test push failed.' };
    }
}

/** Is this specific device currently subscribed? */
export async function hasLocalSubscription() {
    if (!isWebPushSupported()) return false;
    try {
        const registration = await withTimeout(navigator.serviceWorker.ready, T.ready, 'Service worker startup');
        const sub = await withTimeout(registration.pushManager.getSubscription(), T.getSubscription, 'Reading subscription');
        return Boolean(sub);
    } catch {
        return false;
    }
}

export default { enablePush, disablePush, sendTestPush, isWebPushSupported, notificationPermission, hasLocalSubscription };
