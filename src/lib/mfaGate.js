/**
 * MFA Gate — Phase 6.1.21
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Server-side helper for gating sensitive API routes on a verified MFA
 * session. Pairs with pages/api/auth/mfa/challenge.js, which issues an
 * HMAC-signed `mfa_session` cookie after the user passes an SMS code
 * (or backup-code) check, and — when the user asks to remember the
 * device — a 30-day `mfa_trusted_device` cookie alongside it.
 *
 * Usage:
 *
 *   import { requireMfa } from '../../src/lib/mfaGate';
 *
 *   export default async function handler(req, res) {
 *     const user = await getUser(req);
 *     const gate = requireMfa(req, user);
 *     if (!gate.ok) return res.status(gate.status).json({ error: gate.reason });
 *     // ...proceed with privileged action
 *   }
 *
 * This is a local HMAC check — no DB round-trip. We trade perfect
 * revocation for latency (rotating MFA_SESSION_SECRET invalidates all
 * outstanding tokens, which is the emergency lever).
 *
 * ── [2026-08-04] One code every 30 days ──────────────────────────────────
 * A valid trusted-device cookie satisfies EVERY gate in this module —
 * ordinary, enrolled-only and step-up. Once a user has passed a text-code
 * challenge and remembered the device, they are not challenged again for
 * 30 days on any gate. The 5-minute step-up freshness window survives only
 * as a fallback for requests arriving WITHOUT a trusted device.
 */

import crypto from 'crypto';

const MFA_TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h — matches challenge.js
const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d — matches challenge.js Max-Age=2592000

export const TRUSTED_DEVICE_COOKIE = 'mfa_trusted_device';
export const TRUSTED_DEVICE_MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days

/**
 * [Phase 6.1.26] Step-up reauth window.
 *
 * Some actions want a fresh challenge even if the user already has a
 * valid 12h session cookie — e.g. "change email", "withdraw funds",
 * "delete account", "export all my data".
 *
 * [2026-08-04] This window is now a FALLBACK ONLY. A user on a trusted
 * device is never re-prompted inside the 30-day trust period; the window
 * below applies only to requests with no trusted-device cookie.
 *
 * Use `requireRecentMfa(req, user, maxAgeSec)` on those routes.
 */
export const STEP_UP_MAX_AGE_SEC = 5 * 60; // 5 minutes — fallback step-up window

function parseCookie(header, name) {
    if (!header) return null;
    const cookies = header.split(/;\s*/);
    for (const c of cookies) {
        const [k, ...v] = c.split('=');
        if (k === name) return decodeURIComponent(v.join('='));
    }
    return null;
}

function getSigningSecret() {
    return (
        process.env.MFA_SESSION_SECRET ||
        process.env.SUPABASE_JWT_SECRET ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        null
    );
}

/**
 * Shared verifier for the `<userId>.<issuedAtMs>.<hmacSha256Hex>` tokens
 * minted by pages/api/auth/mfa/challenge.js. Both `mfa_session` and
 * `mfa_trusted_device` use this exact format — only the cookie name, the
 * TTL and the wording of the failure differ.
 *
 * Never throws: every failure path returns { ok:false, reason, status }.
 */
function verifySignedCookie(req, { cookieName, ttlMs, expectedUserId, messages }) {
    try {
        const token = parseCookie(req?.headers?.cookie, cookieName);
        if (!token) {
            return { ok: false, reason: messages.missing, status: 403 };
        }

        const parts = token.split('.');
        if (parts.length !== 3) {
            return { ok: false, reason: messages.malformed, status: 403 };
        }
        const [userId, issuedAtStr, sig] = parts;
        const issuedAt = parseInt(issuedAtStr, 10);
        if (!userId || !Number.isFinite(issuedAt)) {
            return { ok: false, reason: messages.malformed, status: 403 };
        }

        const secret = getSigningSecret();
        if (!secret) {
            console.warn('[mfaGate] MFA_SESSION_SECRET not configured');
            return { ok: false, reason: 'MFA service not configured', status: 500 };
        }

        const expectedSig = crypto
            .createHmac('sha256', secret)
            .update(`${userId}.${issuedAtStr}`)
            .digest('hex');

        // Constant-time compare. Buffer.from(..., 'hex') silently drops
        // non-hex input, so the length guard doubles as a format check.
        const a = Buffer.from(sig, 'hex');
        const b = Buffer.from(expectedSig, 'hex');
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
            return { ok: false, reason: messages.invalid, status: 403 };
        }

        if (Date.now() - issuedAt > ttlMs) {
            return { ok: false, reason: messages.expired, status: 403 };
        }

        if (expectedUserId && userId !== expectedUserId) {
            // Token was issued for a different user. This happens if someone
            // copies a cookie between browser profiles; refuse.
            return { ok: false, reason: messages.wrongUser, status: 403 };
        }

        return { ok: true, userId, issuedAt };
    } catch (err) {
        console.warn('[mfaGate] verification error:', err?.message || err);
        return { ok: false, reason: messages.invalid, status: 403 };
    }
}

/**
 * Verify an `mfa_session` cookie. Returns
 *   { ok: true, userId, issuedAt }
 * or
 *   { ok: false, reason, status }
 *
 * If `expectedUserId` is provided, the token must belong to that user.
 */
export function verifyMfaCookie(req, expectedUserId = null) {
    return verifySignedCookie(req, {
        cookieName: 'mfa_session',
        ttlMs: MFA_TOKEN_TTL_MS,
        expectedUserId,
        messages: {
            missing: 'MFA challenge required',
            malformed: 'Malformed MFA token',
            invalid: 'Invalid MFA token',
            expired: 'MFA session expired — please re-verify',
            wrongUser: 'MFA token does not match current user',
        },
    });
}

/**
 * [2026-08-04] Verify the 30-day `mfa_trusted_device` cookie.
 *
 * Minted by pages/api/auth/mfa/challenge.js when the user ticks "remember
 * this device", in exactly the same shape as `mfa_session`:
 *
 *   <userId>.<issuedAtMs>.<hex hmac-sha256 of "<userId>.<issuedAtMs>">
 *
 * signed with the same secret and set HttpOnly/Secure/SameSite=Lax with
 * Max-Age=2592000. Verified here the same way as `mfa_session`:
 * constant-time HMAC compare, user-id binding, 30-day expiry.
 *
 * Returns the same { ok, reason, status } shape and never throws — this is
 * the token that means "one code every 30 days covers everything", so a
 * failure here must degrade to a normal challenge, never to a 500.
 */
export function verifyTrustedDevice(req, expectedUserId = null) {
    return verifySignedCookie(req, {
        cookieName: TRUSTED_DEVICE_COOKIE,
        ttlMs: TRUSTED_DEVICE_TTL_MS,
        expectedUserId,
        messages: {
            missing: 'No trusted device on this browser',
            malformed: 'Malformed trusted-device token',
            invalid: 'Invalid trusted-device token',
            expired: 'Trusted device expired — please re-verify',
            wrongUser: 'Trusted-device token does not match current user',
        },
    });
}

/**
 * Gate helper that takes a Supabase user object (from getUser) and the
 * incoming request, and decides whether the request may proceed.
 *
 * Behaviour:
 * - If the request carries a valid trusted-device cookie: ok.
 * - If the user has MFA disabled OR unenrolled: the gate is a no-op. We
 *   do not enforce MFA globally here — enforcement decisions live in the
 *   calling route (or in a future `profiles.mfa_required` column check).
 * - If the user has MFA enabled AND a valid `mfa_session` cookie: ok.
 * - Otherwise: refuse with 403 and a `requiresMfa: true` hint that the
 *   client can use to trigger the SMS code prompt.
 *
 * Callers that want to *require* MFA even when the user hasn't enrolled
 * (e.g. admin actions that must never be performed without a second
 * factor) should use `requireMfaEnrolled()` below instead.
 */
export async function requireMfaIfEnrolled(req, supabase, user) {
    if (!user) return { ok: false, reason: 'Not authenticated', status: 401 };

    const trusted = verifyTrustedDevice(req, user.id);
    if (trusted.ok) {
        return { ok: true, mfaUsed: true, trustedDevice: true, verifiedAt: trusted.issuedAt };
    }

    const { data: factor } = await supabase
        .from('user_mfa_factors')
        .select('enabled')
        .eq('user_id', user.id)
        .maybeSingle();

    if (!factor || !factor.enabled) {
        // User hasn't enrolled — let the request through (the calling
        // route may still refuse for other reasons).
        return { ok: true, mfaUsed: false, trustedDevice: false };
    }

    const cookieCheck = verifyMfaCookie(req, user.id);
    if (!cookieCheck.ok) {
        return {
            ...cookieCheck,
            requiresMfa: true,
            requiresEnrollment: false
        };
    }
    return { ok: true, mfaUsed: true, trustedDevice: false, verifiedAt: cookieCheck.issuedAt };
}

/**
 * Strict variant — refuse the request if the user has not enrolled MFA
 * at all, or has enrolled but hasn't passed a challenge.
 * Use on admin / high-risk endpoints.
 *
 * [2026-08-04] EITHER a valid `mfa_session` cookie OR a valid
 * `mfa_trusted_device` cookie satisfies this gate. Both are minted by the
 * server only after a successful code check and are bound to the user id,
 * so either one is itself proof of enrolment — the DB lookup is only
 * needed to word the failure correctly when neither is present.
 */
export async function requireMfaEnrolled(req, supabase, user) {
    if (!user) return { ok: false, reason: 'Not authenticated', status: 401 };

    const trusted = verifyTrustedDevice(req, user.id);
    if (trusted.ok) {
        return { ok: true, mfaUsed: true, trustedDevice: true, verifiedAt: trusted.issuedAt };
    }

    const cookieCheck = verifyMfaCookie(req, user.id);
    if (cookieCheck.ok) {
        return { ok: true, mfaUsed: true, trustedDevice: false, verifiedAt: cookieCheck.issuedAt };
    }

    // Neither factor present. Work out whether the user needs to enrol
    // first, or merely to re-verify, so the client can route correctly.
    let enrolled = false;
    try {
        const { data: factor } = await supabase
            .from('user_mfa_factors')
            .select('enabled')
            .eq('user_id', user.id)
            .maybeSingle();
        enrolled = !!(factor && factor.enabled);
    } catch (err) {
        console.warn('[mfaGate] enrolment lookup failed:', err?.message || err);
    }

    if (!enrolled) {
        return {
            ok: false,
            reason: 'MFA enrolment is required for this action',
            status: 403,
            requiresMfa: true,
            requiresEnrollment: true
        };
    }

    return {
        ...cookieCheck,
        requiresMfa: true,
        requiresEnrollment: false
    };
}

/**
 * [Phase 6.1.26] Step-up reauth gate.
 *
 * Used on the highest-risk actions:
 *
 *   - Change account email or phone
 *   - Withdraw funds / approve payout
 *   - Delete account (GDPR erase)
 *   - Disable MFA
 *   - Export all user data
 *
 * [2026-08-04] A valid 30-day trusted device satisfies this gate outright
 * — `maxAgeSec` is NOT applied to it. One code every 30 days covers every
 * gate, including this one; re-prompting a trusted device on each
 * sensitive action is exactly the behaviour that was rejected.
 *
 * The freshness window remains ONLY as the fallback for requests with no
 * trusted device: those still need an `mfa_session` issued within
 * `maxAgeSec` seconds. The client should respond to `requiresStepUp: true`
 * by routing to `/auth/mfa?next=<cur>&stepUp=1`.
 *
 * Successful results carry `trustedDevice: true|false` so callers (and
 * audit logs) can tell which path allowed the action.
 */
export async function requireRecentMfa(
    req,
    supabase,
    user,
    maxAgeSec = STEP_UP_MAX_AGE_SEC,
) {
    if (!user) return { ok: false, reason: 'Not authenticated', status: 401 };

    // ── Trusted device: no freshness requirement, valid for 30 days ──────
    const trusted = verifyTrustedDevice(req, user.id);
    if (trusted.ok) {
        return {
            ok: true,
            mfaUsed: true,
            stepUpOk: true,
            trustedDevice: true,
            verifiedAt: trusted.issuedAt,
        };
    }

    // ── Fallback: no trusted device, so require a fresh session cookie ───
    const base = await requireMfaEnrolled(req, supabase, user);
    if (!base.ok) {
        return { ...base, requiresStepUp: true };
    }
    if (base.trustedDevice) {
        // Defensive: requireMfaEnrolled found a trusted device we didn't.
        return { ...base, stepUpOk: true };
    }

    // requireMfaEnrolled already verified the signature + user binding.
    // Re-verify here so we get at `issuedAt`.
    const cookieCheck = verifyMfaCookie(req, user.id);
    if (!cookieCheck.ok) {
        // Shouldn't happen (base check already returned ok) — defensive.
        return { ...cookieCheck, requiresMfa: true, requiresStepUp: true };
    }

    const ageMs = Date.now() - cookieCheck.issuedAt;
    if (ageMs > maxAgeSec * 1000) {
        return {
            ok: false,
            reason: 'This action requires a fresh second-factor confirmation',
            status: 403,
            requiresMfa: true,
            requiresStepUp: true,
            trustedDevice: false,
            maxAgeSec,
            currentAgeSec: Math.floor(ageMs / 1000),
        };
    }

    return {
        ok: true,
        mfaUsed: true,
        stepUpOk: true,
        trustedDevice: false,
        verifiedAt: cookieCheck.issuedAt,
    };
}

export default {
    STEP_UP_MAX_AGE_SEC,
    TRUSTED_DEVICE_COOKIE,
    TRUSTED_DEVICE_MAX_AGE_SEC,
    verifyMfaCookie,
    verifyTrustedDevice,
    requireMfaIfEnrolled,
    requireMfaEnrolled,
    requireRecentMfa,
};
