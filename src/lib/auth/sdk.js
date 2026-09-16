/**
 * src/lib/auth/sdk.js — Canonical Signup SDK
 * ═══════════════════════════════════════════════════════════════════════════
 * Single function for creating a user. Centralizes:
 *   - Email/password normalization
 *   - Metadata serialization (correct shape: options.data → top-level data
 *     in REST, handled by supabase-js)
 *   - Account-enumeration-safe error normalization
 *   - PostHog identify() (no SIGNUP funnel event — caller decides when
 *     the user is "fully provisioned")
 *   - Telemetry on duration
 *
 * NEW IN 2026-05-03 — not yet adopted by callers. Existing call sites
 * (login.js, signup.js) keep working as-is. New code should import from
 * here. Migration of the existing call sites is deferred because both
 * files are in PROTECTED_FILES and have a history of edits being
 * auto-reverted.
 *
 * Usage:
 *   import { signupUser } from '@/lib/auth/sdk';
 *   const { user, session, error, ms } = await signupUser({
 *     email, password,
 *     metadata: { full_name, first_name, last_name, poker_alias, ... },
 *     emailRedirectTo: window.location.origin + '/auth/callback',
 *   });
 *   if (error) showError(error.userMessage);
 *
 * Error normalization:
 *   error.code     — machine-readable: 'enumeration_avoided' | 'rate_limit'
 *                    | 'weak_password' | 'invalid_email' | 'unknown'
 *   error.userMessage — safe to show users
 *   error.raw      — original error for logging
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { supabase } from '../supabase';

/**
 * Sign up a new user.
 *
 * @param {object} args
 * @param {string} args.email
 * @param {string} args.password
 * @param {object} [args.metadata]
 * @param {string} [args.emailRedirectTo]
 * @param {(uid: string, props: object) => void} [args.onIdentify] — called
 *   with the new user id for analytics identify(). NOT for SIGNUP funnel
 *   event — caller decides when to fire that.
 * @returns {Promise<{user, session, error, ms}>}
 */
export async function signupUser(args) {
    const start = Date.now();

    if (!args || typeof args !== 'object') {
        return _err('invalid_email', 'Signup request was malformed.', { args }, 0, args?.email);
    }
    const email = (args.email || '').trim().toLowerCase();
    const password = args.password || '';
    const metadata = args.metadata && typeof args.metadata === 'object' ? args.metadata : {};

    if (!email || !email.includes('@')) {
        return _err('invalid_email', 'Please enter a valid email address.', { email }, 0, email);
    }
    if (!password || password.length < 10) {
        return _err('weak_password', 'Password must be at least 10 characters.', null, 0, email);
    }

    let result;
    try {
        result = await supabase.auth.signUp({
            email,
            password,
            options: {
                // supabase-js serializes options.data → top-level data in
                // the REST body. The trigger reads NEW.raw_user_meta_data.
                data: metadata,
                emailRedirectTo: args.emailRedirectTo,
            },
        });
    } catch (e) {
        return _err('unknown', 'Could not reach the signup service. Please try again.', e, Date.now() - start, email);
    }

    const ms = Date.now() - start;

    if (result.error) {
        const m = (result.error.message || '').toLowerCase();
        // Account enumeration defense: never confirm whether the email exists
        if (m.includes('already registered') || m.includes('user already') ||
            m.includes('email already') || m.includes('duplicate key')) {
            return {
                user: null,
                session: null,
                ms,
                error: {
                    code: 'enumeration_avoided',
                    userMessage: 'Check your email for a confirmation link.',
                    raw: result.error,
                },
            };
        }
        if (m.includes('rate limit') || m.includes('too many')) {
            return _err('rate_limit', 'Too many signup attempts. Please wait a minute.', result.error, ms, email);
        }
        if (m.includes('password')) {
            return _err('weak_password', 'Please choose a stronger password.', result.error, ms, email);
        }
        if (m.includes('email')) {
            return _err('invalid_email', 'That email address was rejected.', result.error, ms, email);
        }
        return _err('unknown', 'Signup failed. Please try again.', result.error, ms, email);
    }

    // Success
    if (typeof args.onIdentify === 'function' && result.data?.user?.id) {
        try {
            args.onIdentify(result.data.user.id, { email, ...metadata });
        } catch (_) { /* never let analytics break signup */ }
    }

    return {
        user: result.data?.user || null,
        session: result.data?.session || null,
        error: null,
        ms,
    };
}

function _err(code, userMessage, raw, ms = 0, email = '') {
    return {
        user: null,
        session: null,
        ms,
        error: { code, userMessage, raw },
    };
}

export default { signupUser };
