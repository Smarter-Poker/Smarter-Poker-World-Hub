/**
 * push-endpoint.js -- SERVER ONLY. Validation for push subscription material.
 *
 * WHY THIS EXISTS (2026-08-19 security review)
 *
 * `web-push` does not restrict where it sends. It parses whatever endpoint
 * string it is handed and issues an https.request() to that host:port, carrying
 * a valid VAPID Authorization JWT. Nothing in the stack validated the endpoint,
 * so a stored subscription row was an arbitrary server-side request primitive:
 *
 *   1. SSRF -- point `endpoint` at an internal host and the server dials it.
 *   2. Response exfiltration -- web-push rejects non-2xx with err.body attached.
 *      web-push.js captures that into `error`, push-deliver/push-dispatch write
 *      it into push_subscriptions.last_failure_reason, and the row's OWNER can
 *      read that column back through RLS. That is up to 300 bytes of an internal
 *      HTTPS response body per attempt, plus host/port scanning via timing and
 *      failure_count.
 *
 * Validating the host at the point of ingestion closes both. Everything here is
 * pure, so it is cheap to call on every write path.
 */

/**
 * Hosts that actually issue Web Push endpoints. Anything else is either a
 * mistake or an attack; there is no legitimate fourth party.
 */
const ALLOWED_HOST_PATTERNS = [
    /^fcm\.googleapis\.com$/,                       // Chrome, Edge, Android
    /^android\.googleapis\.com$/,                   // legacy GCM
    /^updates\.push\.services\.mozilla\.com$/,      // Firefox
    /^[a-z0-9-]+\.push\.services\.mozilla\.com$/,   // Firefox autopush shards
    /^[a-z0-9-]+\.notify\.windows\.com$/,           // Windows / WNS
    /^[a-z0-9-]+\.push\.apple\.com$/,               // Safari, iOS PWA
    /^web\.push\.apple\.com$/,                      // Safari (current)
];

/**
 * Is this a well-formed endpoint belonging to a real push service?
 * @returns {{ ok: boolean, reason?: string, host?: string }}
 */
export function validatePushEndpoint(endpoint) {
    if (!endpoint || typeof endpoint !== 'string') {
        return { ok: false, reason: 'missing_endpoint' };
    }
    if (endpoint.length > 2048) {
        return { ok: false, reason: 'endpoint_too_long' };
    }

    let url;
    try {
        url = new URL(endpoint);
    } catch {
        return { ok: false, reason: 'malformed_endpoint' };
    }

    if (url.protocol !== 'https:') return { ok: false, reason: 'not_https' };
    // An explicit port is never present on a real push endpoint and is the
    // giveaway for internal-port scanning.
    if (url.port) return { ok: false, reason: 'explicit_port' };
    if (url.username || url.password) return { ok: false, reason: 'embedded_credentials' };

    const host = url.hostname.toLowerCase();
    if (!ALLOWED_HOST_PATTERNS.some((re) => re.test(host))) {
        return { ok: false, reason: 'unknown_push_service', host };
    }
    return { ok: true, host };
}

/**
 * Web Push keys are fixed-size. p256dh is an uncompressed P-256 point (65
 * bytes) and auth is a 16-byte secret, both base64url. Rejecting the wrong
 * shape here stops rows that can never encrypt from being stored -- those rows
 * throw inside web-push with NO statusCode, so they are never classified as
 * expired and get retried on every dispatch run forever.
 */
export function validatePushKeys(p256dh, auth) {
    const b64url = /^[A-Za-z0-9\-_]+=*$/;
    if (!p256dh || typeof p256dh !== 'string' || !b64url.test(p256dh)) {
        return { ok: false, reason: 'bad_p256dh' };
    }
    if (!auth || typeof auth !== 'string' || !b64url.test(auth)) {
        return { ok: false, reason: 'bad_auth' };
    }
    if (decodedLength(p256dh) !== 65) return { ok: false, reason: 'p256dh_wrong_length' };
    if (decodedLength(auth) !== 16) return { ok: false, reason: 'auth_wrong_length' };
    return { ok: true };
}

function decodedLength(b64) {
    const clean = b64.replace(/=+$/, '');
    return Math.floor((clean.length * 3) / 4);
}

/** Both endpoints must come from the same push service. */
export function samePushService(a, b) {
    try {
        return new URL(a).hostname.toLowerCase() === new URL(b).hostname.toLowerCase();
    } catch {
        return false;
    }
}

export default { validatePushEndpoint, validatePushKeys, samePushService };
