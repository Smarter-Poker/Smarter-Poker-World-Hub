/**
 * PROMOTIONAL SIGNUP TOKEN & CAMPAIGN ATTRIBUTION (Dan 2026-11-23)
 *
 * Owner direction: "free chips should be granted at sign up through this
 * promotion only".
 *
 * How it works end-to-end without any forgeable query parameter:
 *   1. Email & SMS blasts embed an HMAC-SHA256 signed promotional token (`?pt=...`)
 *      in the signup link (plus `/go/promo`, a short SMS-friendly redirect route
 *      that mints a fresh signed token and redirects to `/auth/signup?...`).
 *   2. `/auth/signup` preserves `pt` in both `localStorage` (`sp_promo_signup_token`)
 *      and `auth.users.raw_user_meta_data.promo_signup_token` so email confirmation
 *      on a second tab or second device still carries it to `/hub/verify-phone`.
 *   3. `POST /api/sms/verify-otp` verifies the HMAC signature and expiration
 *      server-side before calling `public.fn_sp_grant_promo_signup_chips(user_id, device_id)`.
 *      Organic signups carry no valid `pt` token and therefore never receive the
 *      25 promotional chips.
 */
import crypto from 'crypto';

export const PROMO_SIGNUP_STORAGE_KEY = 'sp_promo_signup_token';
export const CLUB_ARENA_DEVICE_ID_KEY = 'ca_device_id';
export const PROMO_SIGNUP_CAMPAIGN_ID = 'sp_promo_20261123';
export const DEFAULT_PROMO_TOKEN_TTL_DAYS = 90;
export const KINGS_CLUB_JOIN_PATH = '/hub/club-arena/?join=25450';

const TOKEN_SHAPE_RE = /^[A-Za-z0-9_-]{8,256}\.[A-Za-z0-9_-]{16,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let memoryDeviceId = null;

export function isValidDeviceUuid(raw) {
    return typeof raw === 'string' && UUID_RE.test(raw.trim().toLowerCase());
}

function generateDeviceUuid() {
    const webCrypto = globalThis.crypto;
    if (webCrypto && typeof webCrypto.randomUUID === 'function') {
        return webCrypto.randomUUID().toLowerCase();
    }
    const bytes = crypto.randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Return or create the persistent `ca_device_id` UUID shared with Club Arena's
 * `src/lib/deviceSighting.ts` on the same `https://smarter.poker` origin so
 * `fn_ca_signup_promo_claim_identity` enforces 1 promo grant per physical install.
 */
export function getOrCreateClubArenaDeviceId(storage = typeof window !== 'undefined' ? window.localStorage : null) {
    try {
        const stored = storage ? storage.getItem(CLUB_ARENA_DEVICE_ID_KEY) : null;
        if (stored && UUID_RE.test(stored.trim().toLowerCase())) {
            return stored.trim().toLowerCase();
        }
        const id = memoryDeviceId || generateDeviceUuid();
        if (storage) storage.setItem(CLUB_ARENA_DEVICE_ID_KEY, id);
        memoryDeviceId = id;
        return id;
    } catch {
        if (!memoryDeviceId) memoryDeviceId = generateDeviceUuid();
        return memoryDeviceId;
    }
}

export function cleanPromoTokenShape(raw) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    return TOKEN_SHAPE_RE.test(value) ? value : null;
}

export function rememberPromoSignupToken(raw, storage = typeof window !== 'undefined' ? window.localStorage : null) {
    const token = cleanPromoTokenShape(raw);
    if (!token || !storage) return null;
    try {
        storage.setItem(PROMO_SIGNUP_STORAGE_KEY, token);
    } catch {
        /* private browsing: query string / user_metadata still carries it */
    }
    return token;
}

export function readPendingPromoSignupToken(storage = typeof window !== 'undefined' ? window.localStorage : null) {
    if (!storage) return null;
    try {
        return cleanPromoTokenShape(storage.getItem(PROMO_SIGNUP_STORAGE_KEY));
    } catch {
        return null;
    }
}

export function clearPendingPromoSignupToken(storage = typeof window !== 'undefined' ? window.localStorage : null) {
    if (!storage) return;
    try {
        storage.removeItem(PROMO_SIGNUP_STORAGE_KEY);
    } catch {
        /* ignore */
    }
}

function promoTokenSecret(explicitSecret) {
    if (typeof explicitSecret === 'string' && explicitSecret.trim()) {
        return explicitSecret.trim();
    }
    return (
        process.env.PROMO_SIGNUP_SECRET ||
        process.env.NEWSLETTER_UNSUBSCRIBE_SECRET ||
        process.env.CRON_SECRET ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        ''
    ).trim();
}

function b64urlEncode(input) {
    return Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function b64urlDecode(input) {
    const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(normalized + pad, 'base64').toString('utf8');
}

/**
 * Mint an HMAC-SHA256 signed promotional signup token.
 */
export function signPromoSignupToken({
    campaign = PROMO_SIGNUP_CAMPAIGN_ID,
    ttlDays = DEFAULT_PROMO_TOKEN_TTL_DAYS,
    nowMs = Date.now(),
    secret,
} = {}) {
    const signingKey = promoTokenSecret(secret);
    if (!signingKey) return '';
    const safeCampaign = /^[a-z0-9_-]{3,48}$/i.test(String(campaign || ''))
        ? String(campaign)
        : PROMO_SIGNUP_CAMPAIGN_ID;
    const expSec = Math.floor(nowMs / 1000) + Math.max(1, Number(ttlDays) || DEFAULT_PROMO_TOKEN_TTL_DAYS) * 86400;
    const payload = b64urlEncode(JSON.stringify({ v: 1, c: safeCampaign, exp: expSec }));
    const sig = b64urlEncode(crypto.createHmac('sha256', signingKey).update(payload).digest());
    return `${payload}.${sig}`;
}

/**
 * Verify an HMAC-SHA256 signed promotional signup token in constant time.
 * Returns `{ valid: true, campaign, exp }` or `{ valid: false, reason }`.
 */
export function verifyPromoSignupToken(token, { nowMs = Date.now(), secret } = {}) {
    const raw = typeof token === 'string' ? token.trim() : '';
    if (!raw || raw.length > 512) return { valid: false, reason: 'missing' };

    const signingKey = promoTokenSecret(secret);
    if (!signingKey) return { valid: false, reason: 'unconfigured' };

    const dot = raw.indexOf('.');
    if (dot <= 0 || dot !== raw.lastIndexOf('.')) {
        return { valid: false, reason: 'malformed' };
    }

    const payloadPart = raw.slice(0, dot);
    const sigPart = raw.slice(dot + 1);
    if (!/^[A-Za-z0-9_-]+$/.test(payloadPart) || !/^[A-Za-z0-9_-]+$/.test(sigPart)) {
        return { valid: false, reason: 'malformed' };
    }

    const expectedSig = b64urlEncode(crypto.createHmac('sha256', signingKey).update(payloadPart).digest());
    const a = Buffer.from(sigPart, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return { valid: false, reason: 'bad_signature' };
    }

    let parsed;
    try {
        parsed = JSON.parse(b64urlDecode(payloadPart));
    } catch {
        return { valid: false, reason: 'bad_payload' };
    }

    if (!parsed || parsed.v !== 1 || typeof parsed.c !== 'string' || !/^[a-z0-9_-]{3,48}$/i.test(parsed.c)) {
        return { valid: false, reason: 'bad_payload' };
    }

    const expSec = Number(parsed.exp);
    if (!Number.isFinite(expSec) || expSec <= Math.floor(nowMs / 1000)) {
        return { valid: false, reason: 'expired' };
    }

    return { valid: true, campaign: parsed.c, exp: expSec };
}

/**
 * Build a promotional signup URL carrying `?redirect=%2Fhub%2Fclub-arena%2F%3Fjoin%3D25450&pt=<signed_token>`.
 * If `rawUrl` already points to `/auth/signup` or `/go/promo`, attaches a signed `pt` token when missing.
 */
export function buildPromoSignupUrl(rawUrl, { siteUrl = 'https://smarter.poker', secret, nowMs = Date.now() } = {}) {
    const token = signPromoSignupToken({ secret, nowMs });
    const base = String(siteUrl || 'https://smarter.poker').replace(/\/+$/, '');
    let parsed;
    try {
        parsed = new URL(rawUrl || `${base}/auth/signup`, base);
    } catch {
        parsed = new URL(`${base}/auth/signup`);
    }

    if (parsed.pathname === '/auth/signup') {
        if (!parsed.searchParams.get('redirect') && !parsed.searchParams.get('next')) {
            parsed.searchParams.set('redirect', KINGS_CLUB_JOIN_PATH);
        } else if (parsed.searchParams.get('next') && !parsed.searchParams.get('redirect')) {
            parsed.searchParams.set('redirect', parsed.searchParams.get('next'));
            parsed.searchParams.delete('next');
        }
        if (token && !parsed.searchParams.get('pt')) {
            parsed.searchParams.set('pt', token);
        }
    }
    return parsed.toString();
}
