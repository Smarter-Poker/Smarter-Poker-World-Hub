/**
 * web-push.js -- SERVER ONLY. Lowest-level VAPID sender.
 *
 * Wraps the `web-push` npm package (RFC 8030 Web Push Protocol). One call sends
 * one encrypted payload to one subscription endpoint (FCM for Chrome/Android,
 * Apple Push for Safari/iOS PWA, Mozilla autopush for Firefox).
 *
 * CONTRACT: this function NEVER throws. It returns
 *   { ok: boolean, error?: string, statusCode?: number, expired?: boolean }
 * `expired: true` means the push service answered 404 or 410 -- the endpoint is
 * permanently dead and the caller MUST deactivate that push_subscriptions row.
 * Anything else is a transient failure worth retrying.
 *
 * DO NOT import this from a client component. It pulls in Node crypto.
 */

let _webpush = null;
let _configured = false;
let _configError = null;

function loadWebPush() {
    if (_webpush) return _webpush;
    // Lazy require keeps `web-push` out of any accidental client bundle and out
    // of cold-start cost for routes that never send.
    // eslint-disable-next-line global-require
    _webpush = require('web-push');
    return _webpush;
}

/**
 * Read the VAPID environment. Called once, then cached.
 * VAPID_PUBLIC_KEY and NEXT_PUBLIC_VAPID_PUBLIC_KEY must be IDENTICAL strings.
 */
export function vapidConfig() {
    const subject = process.env.VAPID_SUBJECT || 'mailto:support@smarter.poker';
    const publicKey = (process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim();
    const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
    return { subject, publicKey, privateKey };
}

export function isPushConfigured() {
    const { publicKey, privateKey } = vapidConfig();
    return Boolean(publicKey && privateKey);
}

function ensureConfigured() {
    if (_configured) return _configError;
    _configured = true;
    const { subject, publicKey, privateKey } = vapidConfig();
    if (!publicKey || !privateKey) {
        _configError = 'VAPID keys are not configured (set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY)';
        return _configError;
    }
    // Mismatch between the key the browser subscribed with and the key we sign
    // with produces a silent 403 from every push service. Catch it at boot.
    const clientKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim();
    if (clientKey && clientKey !== publicKey) {
        _configError = 'VAPID_PUBLIC_KEY and NEXT_PUBLIC_VAPID_PUBLIC_KEY differ -- every subscription will fail with 403';
        return _configError;
    }
    try {
        loadWebPush().setVapidDetails(subject, publicKey, privateKey);
        _configError = null;
    } catch (e) {
        _configError = `VAPID setup failed: ${e?.message || e}`;
    }
    return _configError;
}

const DEFAULT_ICON = '/notification-icon.png';
const DEFAULT_BADGE = '/notification-icon.png';

/**
 * Send one push.
 *
 * @param {object} subscription { endpoint, p256dh, auth } or a raw PushSubscription JSON
 * @param {object} payload  { title, body, url, tag, icon, badge, requireInteraction, vibrate, actions, data }
 * @param {object} opts     { ttl, urgency, topic }
 */
export async function sendWebPush(subscription, payload = {}, opts = {}) {
    const configError = ensureConfigured();
    if (configError) return { ok: false, error: configError, expired: false };

    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.p256dh || subscription?.keys?.p256dh;
    const auth = subscription?.auth || subscription?.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
        return { ok: false, error: 'Incomplete subscription (missing endpoint/p256dh/auth)', expired: true };
    }

    const body = {
        title: String(payload.title || 'Smarter Poker').slice(0, 120),
        body: String(payload.body || '').slice(0, 500),
        url: payload.url || '/hub',
        tag: payload.tag || undefined,
        icon: payload.icon || DEFAULT_ICON,
        badge: payload.badge || DEFAULT_BADGE,
        requireInteraction: payload.requireInteraction === true,
        vibrate: payload.vibrate || [120, 60, 120],
        actions: Array.isArray(payload.actions) ? payload.actions.slice(0, 2) : undefined,
        data: payload.data || undefined,
        sentAt: Date.now(),
    };

    try {
        const res = await loadWebPush().sendNotification(
            { endpoint, keys: { p256dh, auth } },
            JSON.stringify(body),
            {
                // 24h TTL: a phone that is off or offline still gets the push when
                // it reconnects, instead of the push service dropping it.
                TTL: typeof opts.ttl === 'number' ? opts.ttl : 86400,
                // `high` tells the push service not to batch this for battery.
                urgency: opts.urgency || 'high',
                ...(opts.topic ? { topic: opts.topic } : {}),
            }
        );
        return { ok: true, statusCode: res?.statusCode || 201 };
    } catch (err) {
        const statusCode = err?.statusCode;
        // 404 Not Found / 410 Gone -- the endpoint no longer exists. This is the
        // single most important branch in the whole stack: without it, dead
        // subscriptions accumulate forever and every dispatch run burns time on
        // devices that were reinstalled months ago.
        const expired = statusCode === 404 || statusCode === 410;
        return {
            ok: false,
            expired,
            statusCode,
            error: err?.body ? String(err.body).slice(0, 300) : (err?.message || 'push failed'),
        };
    }
}

export default { sendWebPush, isPushConfigured, vapidConfig };
