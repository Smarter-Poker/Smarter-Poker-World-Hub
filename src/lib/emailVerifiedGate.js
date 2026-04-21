/**
 * emailVerifiedGate.js — helper for routes that require a verified email
 * ═════════════════════════════════════════════════════════════════════════
 * Phase 6.1.12 — Trust & Safety §1.3.4
 *
 * Supabase's auth.users row has `email_confirmed_at` (nullable). Any route
 * that takes real-value actions (purchases, transfers, account changes)
 * should block unverified users to kill a very common signup-spam /
 * chargeback-shield pattern: attacker opens 1000 accounts with fake emails,
 * burns the signup bonus, abandons. With this gate, signup-bonus diamonds
 * still land on the profile — but the moment the user tries to *do*
 * anything with them, we force email verification first.
 *
 * Usage:
 *   const { requireEmailVerified } = require('../../../src/lib/emailVerifiedGate');
 *   // `user` is the object returned from supabase.auth.getUser(token)
 *   const gate = requireEmailVerified(user);
 *   if (!gate.ok) return res.status(gate.status).json(gate.body);
 *
 * Or, for routes that have the Supabase client already:
 *   const gate = await requireEmailVerifiedByUserId(supabase, userId);
 *   if (!gate.ok) return res.status(gate.status).json(gate.body);
 */

const UNVERIFIED_RESPONSE = {
    ok: false,
    status: 403,
    body: {
        success: false,
        error: 'Email verification required',
        code: 'email_not_verified',
        message:
            'Please verify your email address to complete this action. Check your inbox for the confirmation link we sent when you signed up, or request a new one from your account settings.',
    },
};

/**
 * Synchronous check against a user object already returned from
 * supabase.auth.getUser(token).
 *
 * @param {object|null} user
 * @returns {{ok:boolean, status?:number, body?:object}}
 */
function requireEmailVerified(user) {
    if (!user) {
        return {
            ok: false,
            status: 401,
            body: { success: false, error: 'Not authenticated' },
        };
    }
    if (user.email_confirmed_at) {
        return { ok: true };
    }
    return UNVERIFIED_RESPONSE;
}

/**
 * Async check using the service-role client to look up the auth.users row.
 * Use when the caller has a user id but not the full user object.
 *
 * @param {object} supabase - service-role client
 * @param {string} userId
 * @returns {Promise<{ok:boolean, status?:number, body?:object}>}
 */
async function requireEmailVerifiedByUserId(supabase, userId) {
    if (!userId) {
        return {
            ok: false,
            status: 401,
            body: { success: false, error: 'Not authenticated' },
        };
    }
    try {
        const { data, error } = await supabase.auth.admin.getUserById(userId);
        if (error || !data?.user) {
            return {
                ok: false,
                status: 401,
                body: { success: false, error: 'Invalid session' },
            };
        }
        if (data.user.email_confirmed_at) return { ok: true };
        return UNVERIFIED_RESPONSE;
    } catch (err) {
        console.warn('[App] Handled exception:', err?.message || err);
        return UNVERIFIED_RESPONSE;
    }
}

module.exports = {
    requireEmailVerified,
    requireEmailVerifiedByUserId,
};
