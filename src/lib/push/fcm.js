/**
 * fcm.js -- SERVER ONLY. Firebase Cloud Messaging (HTTP v1) for the Club
 * Arena native app (store readiness, phase 4, 2026-09-08).
 *
 * A Capacitor webview has no push service behind it, so the app registers a
 * device token (APNs on iOS, FCM on Android) and Firebase delivers to both.
 * That token is a push_subscriptions row with transport = 'fcm' and the token
 * in `endpoint`; this module is the sender for those rows, and NOTHING else
 * changes: send-push.js picks it per row, and the outbox, the cron, failure
 * counting, retirement and receipts are the ones Web Push already has.
 *
 * Same contract as sendWebPush, so the two are interchangeable to a caller:
 *   { ok: boolean, error?: string, statusCode?: number, expired?: boolean }
 * `expired: true` means Firebase said the token is dead (UNREGISTERED /
 * 404, or INVALID_ARGUMENT on the token) -- retire the row.
 *
 * No dependency: the OAuth2 access token is minted from the service account
 * with Node's own crypto (RS256 JWT -> token endpoint), cached until it is
 * about to expire. The service account JSON is FCM_SERVICE_ACCOUNT_JSON in
 * Vercel (Dan's, 10.84): the whole file, as one line, or base64 of it.
 *
 * DO NOT import this from a client component. It pulls in Node crypto.
 */
import { createSign } from 'node:crypto';
import { accountingDisplayPayload } from './accounting-display.mjs';

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_EARLY_MS = 60_000;

let _account = null;
let _accountError = null;
let _accessToken = null;
let _accessTokenExpiresAt = 0;

function loadAccount() {
    if (_account || _accountError) return _account;
    const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
    if (!raw) { _accountError = 'fcm_not_configured'; return null; }
    try {
        const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
        const parsed = JSON.parse(text);
        if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
            _accountError = 'fcm_service_account_incomplete';
            return null;
        }
        _account = {
            clientEmail: parsed.client_email,
            privateKey: parsed.private_key,
            projectId: parsed.project_id,
            tokenUri: parsed.token_uri || 'https://oauth2.googleapis.com/token',
        };
        return _account;
    } catch {
        _accountError = 'fcm_service_account_unreadable';
        return null;
    }
}

export function isFcmConfigured() {
    return !!loadAccount();
}

function b64url(input) {
    return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** RS256 JWT for the service account, signed with Node crypto. Exported for tests. */
export function signServiceAccountJwt(account, nowSec = Math.floor(Date.now() / 1000)) {
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({
        iss: account.clientEmail,
        scope: SCOPE,
        aud: account.tokenUri,
        iat: nowSec,
        exp: nowSec + 3600,
    }));
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${claims}`);
    const signature = signer.sign(account.privateKey, 'base64')
        .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `${header}.${claims}.${signature}`;
}

async function getAccessToken(fetchImpl) {
    const account = loadAccount();
    if (!account) throw new Error(_accountError || 'fcm_not_configured');
    if (_accessToken && Date.now() < _accessTokenExpiresAt - TOKEN_EARLY_MS) return _accessToken;
    const assertion = signServiceAccountJwt(account);
    const res = await fetchImpl(account.tokenUri, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
        throw new Error(`fcm_token_${res.status}:${body.error || body.error_description || 'no_access_token'}`);
    }
    _accessToken = body.access_token;
    _accessTokenExpiresAt = Date.now() + Number(body.expires_in || 3600) * 1000;
    return _accessToken;
}

/**
 * The FCM v1 message for one of our payloads. Exported for tests: what the
 * phone shows is decided here, and it must say the same thing the service
 * worker would have shown for the same payload.
 *
 * Every custom field travels in `data` as a string (FCM's rule), including the
 * url the tap opens, so src/lib/native/push.ts in Club Arena can route it.
 */
export function buildFcmMessage(token, payload = {}, opts = {}) {
    // The OS can display this notification block before native JavaScript runs.
    // Sanitize here even if a caller bypassed the canonical dispatch formatter.
    payload = accountingDisplayPayload(payload);
    const title = String(payload.title || 'Smarter Poker').slice(0, 120);
    const body = String(payload.body || '').slice(0, 500);
    const url = String(payload.url || '/hub');
    const tag = payload.tag ? String(payload.tag) : undefined;
    const data = {
        url,
        ...(tag ? { tag } : {}),
        ...(payload.data && typeof payload.data === 'object'
            ? Object.fromEntries(Object.entries(payload.data).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]))
            : {}),
        sentAt: String(Date.now()),
    };
    const ttlSeconds = typeof opts.ttl === 'number' && opts.ttl > 0 ? Math.floor(opts.ttl) : 86400;
    return {
        message: {
            token,
            notification: { title, body, ...(payload.image ? { image: String(payload.image) } : {}) },
            data,
            android: {
                priority: 'high',
                ttl: `${ttlSeconds}s`,
                notification: {
                    ...(tag ? { tag } : {}),
                    channel_id: 'club_arena',
                    default_sound: true,
                    default_vibrate_timings: true,
                    ...(payload.image ? { image: String(payload.image) } : {}),
                },
            },
            apns: {
                headers: {
                    'apns-priority': '10',
                    'apns-expiration': String(Math.floor(Date.now() / 1000) + ttlSeconds),
                    ...(tag ? { 'apns-collapse-id': tag.slice(0, 64) } : {}),
                },
                payload: {
                    aps: {
                        sound: 'default',
                        ...(typeof payload.badgeCount === 'number' ? { badge: payload.badgeCount } : {}),
                        'thread-id': tag || 'club_arena',
                        'mutable-content': 1,
                    },
                },
            },
        },
    };
}

/** True when Firebase's error means the token is dead and the row should be retired. */
export function isFcmTokenDead(statusCode, errorBody) {
    if (statusCode === 404) return true;
    const details = errorBody?.error?.details || [];
    const code = details.find((d) => d && d.errorCode)?.errorCode;
    if (code === 'UNREGISTERED') return true;
    if (statusCode === 400 && (code === 'INVALID_ARGUMENT' || /not a valid FCM registration token/i.test(errorBody?.error?.message || ''))) return true;
    return false;
}

/**
 * Send one push to one native token. Never throws.
 * `subscription.endpoint` holds the token (a push_subscriptions row with
 * transport = 'fcm').
 */
export async function sendFcm(subscription, payload = {}, opts = {}) {
    const fetchImpl = opts.fetch || globalThis.fetch;
    const token = subscription?.endpoint;
    if (!token || typeof token !== 'string' || token.length < 20) {
        return { ok: false, expired: true, error: 'invalid_fcm_token' };
    }
    const account = loadAccount();
    if (!account) return { ok: false, expired: false, error: _accountError || 'fcm_not_configured' };
    let accessToken;
    try {
        accessToken = await getAccessToken(fetchImpl);
    } catch (e) {
        return { ok: false, expired: false, error: e?.message || 'fcm_auth_failed' };
    }
    try {
        const res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${account.projectId}/messages:send`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(buildFcmMessage(token, payload, opts)),
        });
        if (res.ok) return { ok: true, statusCode: res.status };
        const errorBody = await res.json().catch(() => ({}));
        if (res.status === 401) { _accessToken = null; _accessTokenExpiresAt = 0; }
        const expired = isFcmTokenDead(res.status, errorBody);
        return {
            ok: false,
            expired,
            statusCode: res.status,
            error: `http_${res.status}:${errorBody?.error?.status || 'unknown'}`,
        };
    } catch (e) {
        return { ok: false, expired: false, error: e?.message || 'fcm_network_error' };
    }
}

/** Test-only: forget the cached token and account. */
export function __resetFcmForTests() {
    _account = null; _accountError = null; _accessToken = null; _accessTokenExpiresAt = 0;
}

export default { sendFcm, isFcmConfigured, buildFcmMessage, isFcmTokenDead, signServiceAccountJwt };
