/* ═══════════════════════════════════════════════════════════════════════════
   AUTH CALLBACK — /auth/callback
   ───────────────────────────────────────────────────────────────────────────
   This route is the redirect target for ALL Supabase auth flows that leave
   the SPA and come back via the browser:

     1. Google OAuth                  →  ?code=<pkce-code>
     2. Email signup confirmation     →  ?token_hash=<hash>&type=signup
     3. Magic link                    →  ?token_hash=<hash>&type=magiclink
     4. Email change confirmation     →  ?token_hash=<hash>&type=email_change
     5. Password recovery             →  ?token_hash=<hash>&type=recovery
     6. OAuth/email error from server →  ?error=…&error_description=…
     7. Implicit-flow legacy hash     →  #access_token=…&refresh_token=…

   This file went MISSING which caused EVERY signup (regular + Google) to
   404 after the redirect. Restoration is part of the auth-protect commit;
   the file is now in PROTECTED_FILES and pages/auth/ is in SENSITIVE_PATHS
   in deploy-autofix.js so it cannot be deleted by autofix again.

   See e2e/07-auth.spec.ts and __tests__/auth-routes-exist.test.mjs for the
   regression tests that guard this route.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';

// Email-link `type` values that Supabase produces.
// https://supabase.com/docs/reference/javascript/auth-verifyotp
const EMAIL_VERIFY_TYPES = new Set([
    'signup',
    'invite',
    'magiclink',
    'email',
    'email_change',
    'recovery',
]);

export default function AuthCallback() {
    const router = useRouter();
    const [status, setStatus] = useState('Verifying…');
    const [error, setError] = useState('');
    // Guard against StrictMode double-invocation in dev and any router re-render
    // racing the in-flight exchange. Without this, exchangeCodeForSession can
    // be called twice and the second call fails with "code has already been used".
    const ranRef = useRef(false);

    useEffect(() => {
        if (ranRef.current) return;
        ranRef.current = true;

        const goLogin = (msg) => {
            setError(msg);
            // 1500ms: still long enough to read the error; was 2500ms which caused
            // the e2e/07-auth.spec.ts 8000ms timeout to expire in CI.
            setTimeout(() => router.replace('/auth/login'), 1500);
        };

        // [2026-08-04] Server-side error capture — client Sentry is disabled,
        // so console.warn here was invisible in prod. Best-effort, never throws.
        const reportAuthError = (flow, err) => {
            try {
                fetch('/api/auth/log-client-error', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        flow,
                        message: err?.message || String(err),
                        stack: err?.stack,
                        code: err?.code || err?.status,
                        url: typeof window !== 'undefined' ? window.location.href : '',
                    }),
                }).catch(() => { /* best-effort */ });
            } catch (_e) { /* never throw from telemetry */ }
        };

        const handleCallback = async () => {
            try {
                // ── 0. Wait for router to be ready so query/hash are populated ──
                if (!router.isReady) {
                    // useEffect re-fires when isReady flips; bail and let it retry.
                    ranRef.current = false;
                    return;
                }

                const { code, token_hash, type, error: qError, error_description } = router.query;
                const hash = typeof window !== 'undefined' ? window.location.hash : '';

                // ── 1. Surface OAuth/email-link server errors first ──
                if (qError) {
                    const desc = (Array.isArray(error_description) ? error_description[0] : error_description) || qError;
                    console.warn('[auth-callback] provider error:', qError, desc);
                    return goLogin(typeof desc === 'string' ? desc : 'Sign-in failed. Please try again.');
                }

                // ── 2. PKCE OAuth code exchange (Google, etc.) ──
                if (code) {
                    setStatus('Completing sign-in…');
                    const codeStr = Array.isArray(code) ? code[0] : code;
                    const { error: exchErr } = await supabase.auth.exchangeCodeForSession(codeStr);
                    if (exchErr) {
                        console.warn('[auth-callback] exchangeCodeForSession failed:', exchErr);
                        reportAuthError('signup_oauth_callback', exchErr);
                        return goLogin('Could not complete sign-in. Please try again.');
                    }
                }

                // ── 3. Email-link / magic-link verification ──
                else if (token_hash && type) {
                    setStatus('Verifying email…');
                    const tokenStr = Array.isArray(token_hash) ? token_hash[0] : token_hash;
                    const typeStr = Array.isArray(type) ? type[0] : type;
                    if (!EMAIL_VERIFY_TYPES.has(typeStr)) {
                        return goLogin('Unsupported verification type.');
                    }
                    const { error: verifyErr } = await supabase.auth.verifyOtp({
                        token_hash: tokenStr,
                        type: typeStr,
                    });
                    if (verifyErr) {
                        console.warn('[auth-callback] verifyOtp failed:', verifyErr);
                        return goLogin('Verification link is invalid or expired. Please request a new one.');
                    }

                    // Recovery links go to the password-reset page, not the hub.
                    if (typeStr === 'recovery') {
                        setStatus('Redirecting to password reset…');
                        return setTimeout(() => router.replace('/auth/reset-password'), 600);
                    }
                }

                // ── 4. Implicit-flow legacy: hash has #access_token=… ──
                // detectSessionInUrl in supabase-js v2 normally handles this on
                // page load, but it's a no-op for /auth/callback specifically
                // until getSession is called once. Calling getSession below
                // covers it.

                // ── 5. Resolve session, with a short retry to absorb the race
                //      between cookie set and SPA hydration on some browsers ──
                let session = null;
                for (let i = 0; i < 5; i++) {
                    const { data, error: sErr } = await supabase.auth.getSession();
                    if (sErr) {
                        console.warn('[auth-callback] getSession error:', sErr);
                        break;
                    }
                    if (data?.session) {
                        session = data.session;
                        break;
                    }
                    await new Promise((r) => setTimeout(r, 400));
                }

                if (!session?.user) {
                    return goLogin('No active session found. Please sign in again.');
                }

                const user = session.user;

                // ── 6. Ensure the profile exists. /api/auth/ensure-profile is
                //      the single source of truth for profile creation; it
                //      handles new users (CREATED), existing users (EXISTS),
                //      and same-email-different-provider linking (LINKED). ──
                setStatus('Setting up your account…');
                try {
                    const meta = user.user_metadata || {};
                    const fullName =
                        meta.full_name ||
                        meta.name ||
                        [meta.given_name, meta.family_name].filter(Boolean).join(' ') ||
                        null;
                    const username =
                        meta.poker_alias ||
                        meta.preferred_username ||
                        (fullName ? fullName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 15) : null) ||
                        (user.email ? user.email.split('@')[0] : null);

                    const resp = await fetch('/api/auth/ensure-profile', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${session.access_token}`,
                        },
                        body: JSON.stringify({
                            user_id: user.id,
                            email: user.email || null,
                            full_name: fullName,
                            username,
                            avatar_url: meta.avatar_url || meta.picture || null,
                            metadata: meta,
                        }),
                    });

                    if (!resp.ok) {
                        // Non-blocking: surface a warning but still let the user in.
                        // A subsequent app load will retry ensure-profile.
                        const body = await resp.text().catch(() => '');
                        console.warn('[auth-callback] ensure-profile non-200:', resp.status, body);
                        reportAuthError('profile_provision', {
                            message: `ensure-profile ${resp.status}: ${String(body).slice(0, 300)}`,
                            status: resp.status,
                        });
                    }
                } catch (epErr) {
                    // Non-blocking
                    console.warn('[auth-callback] ensure-profile error (non-blocking):', epErr);
                    reportAuthError('profile_provision', epErr);
                }

                // ── 7. Decide where to send the user ──
                let isCommanderOrigin = false;
                try {
                    isCommanderOrigin =
                        typeof window !== 'undefined' &&
                        window.localStorage?.getItem('commander_login_origin') === 'true';
                    if (isCommanderOrigin) window.localStorage.removeItem('commander_login_origin');
                } catch (_lsErr) {
                    // localStorage unavailable (privacy mode) — default to /hub
                }

                // Honour an explicit ?next=/path override if it's a same-origin path
                let nextPath = null;
                const rawNext = Array.isArray(router.query.next) ? router.query.next[0] : router.query.next;
                if (typeof rawNext === 'string' && rawNext.startsWith('/') && !rawNext.startsWith('//')) {
                    nextPath = rawNext;
                }

                const dest = nextPath || (isCommanderOrigin ? '/commander/dashboard' : '/hub');

                // ── 7.5 MFA challenge gate (parity with password login) ──
                // [2026-07-25] OAuth sign-ins must not silently bypass a
                // user's enabled second factor. STRICT === true checks: any
                // error / null / RLS denial fails OPEN so a broken table can
                // never strand a sign-in on this screen.
                //
                // [2026-08-04] LOCKOUT FIX: challenge ONLY when an enabled
                // factor is actually enrolled. profiles.mfa_required was
                // force-set to TRUE for 525 users (VIP/admin trigger) while
                // ZERO users had an enrolled factor — the challenge page was
                // unpassable and sign-ins silently dead-ended. mfa_required
                // alone must never gate a sign-in.
                try {
                    const factorRes = await supabase
                        .from('user_mfa_factors')
                        .select('enabled')
                        .eq('user_id', user.id)
                        .maybeSingle();
                    const hasMfa = factorRes?.error == null && factorRes?.data?.enabled === true;
                    if (hasMfa) {
                        setStatus('Two-factor check…');
                        return setTimeout(() => router.replace(`/auth/mfa?next=${encodeURIComponent(dest)}`), 300);
                    }
                } catch (_mfaErr) { /* fail open — never block the callback */ }

                try {
                    if (typeof window !== 'undefined') {
                        window.sessionStorage.setItem('just_authenticated', 'true');
                    }
                } catch (_ssErr) { /* ignore */ }

                setStatus('Redirecting…');
                setTimeout(() => router.replace(dest), 400);
            } catch (err) {
                console.warn('[auth-callback] unexpected error:', err);
                goLogin('Something went wrong. Please try signing in.');
            }
        };

        handleCallback();
    }, [router, router.isReady]);

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(180deg, #0a1628 0%, #0d1f35 100%)',
                color: '#ffffff',
                fontFamily: 'Inter, -apple-system, sans-serif',
                padding: '24px',
                textAlign: 'center',
            }}
        >
            <div
                style={{
                    width: 64,
                    height: 64,
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #0a1628, #1a2a4a)',
                    border: '2px solid #00D4FF',
                    boxShadow: '0 0 40px rgba(0, 212, 255, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '24px',
                }}
            >
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2">
                    <path d="M12 2a4 4 0 014 4c0 1.5-.8 2.8-2 3.5V12h2a4 4 0 110 8h-8a4 4 0 110-8h2V9.5A4 4 0 018 6a4 4 0 014-4z" />
                </svg>
            </div>

            <h1
                style={{
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: '24px',
                    fontWeight: 600,
                    color: error ? '#ff4d4d' : '#00D4FF',
                    marginBottom: '12px',
                    maxWidth: 520,
                }}
            >
                {error || status}
            </h1>

            {!error && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            style={{
                                width: '12px',
                                height: '12px',
                                borderRadius: '50%',
                                background: '#00D4FF',
                                animation: `pulse 1.5s ease-in-out ${i * 0.2}s infinite`,
                            }}
                        />
                    ))}
                </div>
            )}

            <style jsx>{`
                @keyframes pulse {
                    0%, 100% { opacity: 0.3; transform: scale(0.8); }
                    50% { opacity: 1; transform: scale(1.2); }
                }
            `}</style>
        </div>
    );
}
