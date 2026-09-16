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
 *   - **Sentry capture** — every signup error is sent to Sentry with
 *     custom tags (`auth.flow=signup`, `auth.error_code=...`) so an
 *     on-call engineer can search/filter for signup failures specifically.
 *     Bridges the gap left by `withSentryConfig` being disabled (OOM
 *     workaround in next.config.js), which means auto-instrumentation
 *     does NOT capture uncaught errors — only EXPLICIT captures land.
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

// Sentry — best-effort import. Falls back to a no-op shim if the package
// isn't loadable (e.g. unit tests, ts-node, an older client without
// @sentry/nextjs). NEVER let Sentry being broken break signup.
let Sentry;
try {
    // Dynamically require so this file works in environments without
    // @sentry/nextjs installed (e.g. some local dev modes).
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    Sentry = require('@sentry/nextjs');
} catch (_e) {
    Sentry = {
        captureException: () => null,
        captureMessage: () => null,
        addBreadcrumb: () => null,
        withScope: (cb) => cb({ setTag: () => null, setContext: () => null, setLevel: () => null }),
    };
}

function sentryCaptureSignupFailure({ code, raw, email, ms }) {
    try {
        Sentry.withScope((scope) => {
            scope.setTag('auth.flow', 'signup');
            scope.setTag('auth.error_code', code);
            // Avoid leaking full email — domain only is enough for triage
            scope.setContext('signup', {
                email_domain: typeof email === 'string' ? email.split('@')[1] || 'unknown' : 'unknown',
                duration_ms: ms,
                code,
            });
            scope.setLevel(code === 'enumeration_avoided' ? 'info' : 'error');
            if (raw instanceof Error) {
                Sentry.captureException(raw);
            } else {
                Sentry.captureMessage(`signup ${code}: ${raw?.message || raw || 'unknown'}`);
            }
        });
    } catch (_sentryErr) { /* never let observability break signup */ }
}

function sentryBreadcrumb(category, message, data) {
    try {
        Sentry.addBreadcrumb({
            category,
            message,
            data,
            level: 'info',
        });
    } catch (_) { /* ignore */ }
}

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
    sentryBreadcrumb('auth', 'signupUser called', { has_metadata: !!args?.metadata });

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
            // Still surface to Sentry as `info` level so we can detect
            // patterns (e.g. an attacker probing the form).
            sentryCaptureSignupFailure({ code: 'enumeration_avoided', raw: result.error, email, ms });
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
    sentryCaptureSignupFailure({ code, raw, email, ms });
    return {
        user: null,
        session: null,
        ms,
        error: { code, userMessage, raw },
    };
}

export default { signupUser };
