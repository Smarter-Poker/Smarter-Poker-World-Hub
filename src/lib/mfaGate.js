/**
 * MFA Gate — Phase 6.1.21
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Server-side helper for gating sensitive API routes on a verified MFA
 * session. Pairs with pages/api/auth/mfa/challenge.js, which issues a
 * short-lived HMAC-signed `mfa_session` cookie after the user passes a
 * TOTP (or backup-code) check.
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
 */

import crypto from 'crypto';

const MFA_TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h — matches challenge.js

/**
 * [Phase 6.1.26] Step-up reauth window.
 *
 * Some actions need a fresh MFA challenge even if the user already has a
 * valid 12h session cookie — e.g. "change email", "withdraw funds",
 * "delete account", "export all my data". Industry standard for step-up
 * is ~5 minutes (Google/AWS/GitHub all cluster around 3-15min).
 *
 * Use `requireRecentMfa(req, user, maxAgeSec)` to enforce the tighter
 * window on those routes.
 */
export const STEP_UP_MAX_AGE_SEC = 5 * 60; // 5 minutes — default step-up window

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
 * Verify an `mfa_session` cookie. Returns
 *   { ok: true, userId, issuedAt }
 * or
 *   { ok: false, reason, status }
 *
 * If `expectedUserId` is provided, the token must belong to that user.
 */
export function verifyMfaCookie(req, expectedUserId = null) {
    const cookieHeader = req.headers?.cookie;
    const token = parseCookie(cookieHeader, 'mfa_session');
    if (!token) {
        return { ok: false, reason: 'MFA challenge required', status: 403 };
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
        return { ok: false, reason: 'Malformed MFA token', status: 403 };
    }
    const [userId, issuedAtStr, sig] = parts;
    const issuedAt = parseInt(issuedAtStr, 10);
    if (!userId || !Number.isFinite(issuedAt)) {
        return { ok: false, reason: 'Malformed MFA token', status: 403 };
    }

    const secret = getSigningSecret();
    if (!secret) {
        console.error('[mfaGate] MFA_SESSION_SECRET not configured');
        return { ok: false, reason: 'MFA service not configured', status: 500 };
    }

    const expectedSig = crypto
        .createHmac('sha256', secret)
        .update(`${userId}.${issuedAtStr}`)
        .digest('hex');

    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expectedSig, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return { ok: false, reason: 'Invalid MFA token', status: 403 };
    }

    if (Date.now() - issuedAt > MFA_TOKEN_TTL_MS) {
        return { ok: false, reason: 'MFA session expired — please re-verify', status: 403 };
    }

    if (expectedUserId && userId !== expectedUserId) {
        // Token was issued for a different user. This happens if someone
        // copies a cookie between browser profiles; refuse.
        return { ok: false, reason: 'MFA token does not match current user', status: 403 };
    }

    return { ok: true, userId, issuedAt };
}

/**
 * Gate helper that takes a Supabase user object (from getUser) and the
 * incoming request, and decides whether the request may proceed.
 *
 * Behaviour:
 * - If the user has MFA disabled OR unenrolled: the gate is a no-op. We
 *   do not enforce MFA globally here — enforcement decisions live in the
 *   calling route (or in a future `profiles.mfa_required` column check).
 * - If the user has MFA enabled AND a valid `mfa_session` cookie: ok.
 * - Otherwise: refuse with 403 and a `requiresMfa: true` hint that the
 *   client can use to trigger the TOTP prompt.
 *
 * Callers that want to *require* MFA even when the user hasn't enrolled
 * (e.g. admin actions that must never be performed without a second
 * factor) should use `requireMfaEnrolled()` below instead.
 */
export async function requireMfaIfEnrolled(req, supabase, user) {
    if (!user) return { ok: false, reason: 'Not authenticated', status: 401 };

    const { data: factor } = await supabase
        .from('user_mfa_factors')
        .select('enabled')
        .eq('user_id', user.id)
        .maybeSingle();

    if (!factor || !factor.enabled) {
        // User hasn't enrolled — let the request through (the calling
        // route may still refuse for other reasons).
        return { ok: true, mfaUsed: false };
    }

    const cookieCheck = verifyMfaCookie(req, user.id);
    if (!cookieCheck.ok) {
        return {
            ...cookieCheck,
            requiresMfa: true,
            requiresEnrollment: false
        };
    }
    return { ok: true, mfaUsed: true };
}

/**
 * Strict variant — refuse the request if the user has not enrolled MFA
 * at all, or has enrolled but hasn't passed a recent challenge.
 * Use on admin / high-risk endpoints.
 */
export async function requireMfaEnrolled(req, supabase, user) {
    if (!user) return { ok: false, reason: 'Not authenticated', status: 401 };

    const { data: factor } = await supabase
        .from('user_mfa_factors')
        .select('enabled')
        .eq('user_id', user.id)
        .maybeSingle();

    if (!factor || !factor.enabled) {
        return {
            ok: false,
            reason: 'MFA enrolment is required for this action',
            status: 403,
            requiresMfa: true,
            requiresEnrollment: true
        };
    }

    const cookieCheck = verifyMfaCookie(req, user.id);
    if (!cookieCheck.ok) {
        return {
            ...cookieCheck,
            requiresMfa: true,
            requiresEnrollment: false
        };
    }
    return { ok: true, mfaUsed: true };
}

/**
 * [Phase 6.1.26] Step-up reauth gate.
 *
 * Like `requireMfaEnrolled`, but in addition to the ordinary signature /
 * TTL checks, also requires the MFA session to have been issued within
 * `maxAgeSec` seconds. Use this on the highest-risk actions:
 *
 *   - Change account email or phone
 *   - Withdraw funds / initiate payout
 *   - Delete account (GDPR erase)
 *   - Disable MFA
 *   - Export all user data
 *   - Change password (if session auth is used)
 *
 * Default window is 5 minutes. The client should respond to
 * `requiresStepUp: true` by routing to `/auth/mfa?next=<cur>&stepUp=1`
 * which forces a fresh challenge.
 *
 * If the user has no MFA enrolled at all, this returns `requiresEnrollment:
 * true` — step-up implies enrolment. Routes that need step-up must also be
 * reachable only via MFA-enrolled accounts (true for admin + VIP by policy,
 * but some user-facing routes like withdrawals may need to fall back to
 * email/SMS confirmation for non-enrolled users — handle that in the
 * calling route, not here).
 */
export async function requireRecentMfa(
    req,
    supabase,
    user,
    maxAgeSec = STEP_UP_MAX_AGE_SEC,
) {
    const base = await requireMfaEnrolled(req, supabase, user);
    if (!base.ok) {
        return { ...base, requiresStepUp: true };
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
            maxAgeSec,
            currentAgeSec: Math.floor(ageMs / 1000),
        };
    }

    return { ok: true, mfaUsed: true, stepUpOk: true };
}

export default {
    STEP_UP_MAX_AGE_SEC,
    verifyMfaCookie,
    requireMfaIfEnrolled,
    requireMfaEnrolled,
    requireRecentMfa,
};
