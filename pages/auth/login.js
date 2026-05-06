/* ═══════════════════════════════════════════════════════════════════════════
   ACCESS NODE — CANONICAL SIGN-IN PAGE
   URL: /auth/login  (this is the ONLY sign-in page)
   
   ⚠ AGENTS: The Sign In button URL is /auth/login — NOT /auth/signin
   A redirect exists at pages/auth/signin.js as a safety net, but the 
   canonical route is THIS FILE. Do NOT change the Sign In URL to /auth/signin.
   Vanguard Silver | Next.js Unified
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';
import { getAuthUser } from '../../src/lib/authUtils';
import { capture, identify, FunnelEvents } from '../../src/lib/analytics';
// [2026-05-03] Defense-in-depth: this page has a 'signup' mode that uses a
// stripped-down supabase.auth.signUp(). The canonical signup flow lives at
// /auth/signup.js with HIBP + entropy + state + age + alias-availability
// checks. Importing validatePassword here so the simple form can refuse
// weak passwords AND nudge users to the canonical form, instead of silently
// minting accounts that fail downstream provisioning.
import { validatePassword } from '../../src/lib/passwordStrength';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [mode, setMode] = useState('login'); // 'login' or 'signup'
    const [message, setMessage] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(true); // Default to checked
    const [existingUser, setExistingUser] = useState(null); // Track if already signed in
    const [oauthLoading, setOauthLoading] = useState(''); // Google OAuth loading state

    // Honor ?redirect= param from useRequireAuth() — send user back to the page they came from
    const getRedirectUrl = () => {
        const r = router.query.redirect;
        // Only allow internal redirects (prevent open redirect attacks)
        if (r && typeof r === 'string' && r.startsWith('/')) return r;
        return '/hub';
    };

    // Load remembered email on mount
    useEffect(() => {
        const savedEmail = localStorage.getItem('smarter-poker-remembered-email');
        const wasRemembered = localStorage.getItem('smarter-poker-remember-me') === 'true';
        if (savedEmail && wasRemembered) {
            setEmail(savedEmail);
            setRememberMe(true);
        }
    }, []);

    useEffect(() => {
        // Check for existing Supabase session
        async function checkSession() {
            const user = await getAuthUser();
            if (user) {
                // ONLY auto-redirect if user was bounced FROM a protected page (?redirect= param)
                // If they explicitly navigated to /auth/login, let them see the form
                if (router.query.redirect) {
                    sessionStorage.setItem('just_authenticated', 'true');
                    router.push(getRedirectUrl());
                } else {
                    // Show "already signed in" banner instead of auto-redirecting
                    setExistingUser(user?.email || 'your account');
                }
            }
        }
        checkSession();
    }, [router]);

    // Handle switching accounts
    const handleSwitchAccount = async () => {
        setIsLoading(true);
        await supabase.auth.signOut();
        setExistingUser(null);
        setIsLoading(false);
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        // [HARDENED] Military-Grade sanitization to prevent accidental trailing spaces
        const safeEmail = email.trim().toLowerCase();
        const safePassword = password.trim();

        try {
            const { data, error: authError } = await supabase.auth.signInWithPassword({
                email: safeEmail,
                password: safePassword,
            });

            if (authError) throw authError;

            console.log('✅ Login successful:', data.user?.email);

            // ── [Phase 5.1.2] PostHog activation-funnel instrumentation ─────
            // identify() on every login keeps person-properties fresh even if
            // the user has cleared cookies. We also fire the canonical
            // `first_login` funnel event when this login happens within 5
            // minutes of account creation — the signup API fires `signup`
            // server-side, so the pair signup → first_login wires up the
            // first two funnel steps without an extra DB round-trip.
            try {
                if (data?.user?.id) {
                    identify(data.user.id, {
                        email: data.user.email,
                        created_at: data.user.created_at,
                    });
                    const createdMs = data.user.created_at
                        ? new Date(data.user.created_at).getTime()
                        : 0;
                    if (createdMs && Date.now() - createdMs < 5 * 60 * 1000) {
                        capture(FunnelEvents.FIRST_LOGIN, { source: 'password' });
                    } else {
                        capture('login', { source: 'password' });
                    }
                }
            } catch (_analyticsErr) { console.warn('[App] Handled exception:', _analyticsErr?.message || _analyticsErr); }

            // Remember device if checkbox is checked
            if (rememberMe) {
                localStorage.setItem('smarter-poker-remembered-email', safeEmail);
                localStorage.setItem('smarter-poker-remember-me', 'true');
            } else {
                localStorage.removeItem('smarter-poker-remembered-email');
                localStorage.removeItem('smarter-poker-remember-me');
            }

            // ── [Phase 6.1.23] MFA challenge gate — DISABLED ───────────────
            // MFA enrollment is not yet live for any users. This probe was
            // randomly redirecting users to /auth/mfa because the
            // user_mfa_factors table or mfa_required flag returned unexpected
            // values. Re-enable this block once MFA enrollment is deployed.
            //
            // try {
            //     const [factorRes, profileRes] = await Promise.all([
            //         supabase
            //             .from('user_mfa_factors')
            //             .select('enabled')
            //             .eq('user_id', data.user.id)
            //             .maybeSingle(),
            //         supabase
            //             .from('profiles')
            //             .select('mfa_required')
            //             .eq('id', data.user.id)
            //             .maybeSingle(),
            //     ]);
            //     const hasMfa = !!factorRes?.data?.enabled;
            //     const mfaRequired = !!profileRes?.data?.mfa_required;
            //     if (hasMfa || mfaRequired) {
            //         const next = encodeURIComponent(getRedirectUrl());
            //         router.push(`/auth/mfa?next=${next}`);
            //         return;
            //     }
            // } catch (mfaProbeErr) { console.warn('[App] Handled exception:', mfaProbeErr?.message || mfaProbeErr); }

            // Set flag so hub plays intro animation
            sessionStorage.setItem('just_authenticated', 'true');
            router.push(getRedirectUrl());
        } catch (err) {
            console.warn('Login error:', err);

            // ── [Phase 6.1.19] Account enumeration defense ──────────────────
            // Supabase normalises both "email not found" and "wrong password"
            // to a single `invalid login credentials` error, so the backend
            // itself is enumeration-safe. The legacy copy said "Invalid
            // Password" which implied the email was valid — we replace it
            // with neutral wording. For rate limit / server errors we still
            // show a generic message.
            const msg = (err?.message || '').toLowerCase();
            if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
                setError("Email Or Password Doesn't Match. Use The Magic Link Below To Sign In Without A Password.");
            } else if (msg.includes('email not confirmed')) {
                setError('Please Confirm Your Email Before Signing In. Check Your Inbox For The Confirmation Link.');
            } else if (msg.includes('rate limit') || msg.includes('too many')) {
                setError('Too Many Sign-In Attempts. Please Wait A Minute And Try Again.');
            } else {
                setError('Unable To Sign In Right Now. Please Try Again In A Moment.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignup = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setMessage(null);

        // [HARDENED] Military-Grade sanitization for signup flow
        const safeEmail = email.trim().toLowerCase();
        const safePassword = password.trim();

        // ── [2026-05-03] Parity with canonical /auth/signup ──────────────────
        // This simplified form historically allowed any 6+ char password and
        // captured no metadata, so users created here landed in auth.users
        // with no first/last name, no state, no age verification, no alias.
        // Downstream pages (the hub, the diamond store, prize-redemption
        // gates) assume those fields exist and crash without them. We now:
        //   1. Run the SAME validatePassword (HIBP + entropy) used on
        //      /auth/signup. Weak/breached passwords are rejected here too.
        //   2. If the user is missing fields the canonical flow requires
        //      (name, state, age, phone), redirect them to /auth/signup
        //      with email pre-filled instead of creating a half-built account.
        const pwCheck = await validatePassword(safePassword);
        if (!pwCheck.ok) {
            setError(pwCheck.reason || 'Please choose a stronger password.');
            setIsLoading(false);
            return;
        }

        // Always route real signups through the full /auth/signup form so we
        // capture state/age/alias. Saves users from being blocked at the
        // diamond store later because their profile is incomplete.
        try {
            sessionStorage.setItem('signup_email_prefill', safeEmail);
        } catch (_ssErr) { /* ignore */ }
        router.push('/auth/signup');
        setIsLoading(false);
    };

    const handleMagicLink = async () => {
        // Safe check
        const safeEmail = email ? email.trim().toLowerCase() : '';
        if (!safeEmail) {
            setError('Please Enter Your Email');
            return;
        }
        setIsLoading(true);
        setError(null);

        try {
            const { error: authError } = await supabase.auth.signInWithOtp({
                email: safeEmail,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                }
            });

            if (authError) throw authError;

            setMessage('Magic link sent! Check your email.');
        } catch (err) {
            console.warn('Magic link error:', err);
            setError(err.message || 'Failed to send magic link');
        } finally {
            setIsLoading(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // GOOGLE OAUTH SIGN IN
    // ─────────────────────────────────────────────────────────────────────────
    const handleOAuthSignIn = async (provider) => {
        setError(null);
        setOauthLoading(provider);
        try {
            // Apex-domain hardening (same as signup.js)
            const host = (typeof window !== 'undefined' && window.location.hostname) || '';
            if (host.startsWith('www.')) {
                const apex = host.replace(/^www\./, '');
                window.location.replace(`https://${apex}/auth/login?provider=${encodeURIComponent(provider)}`);
                return;
            }
        } catch (_originErr) { /* SSR — skip */ }

        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                    queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
                },
            });
            if (error) throw error;
        } catch (err) {
            console.warn(`${provider} sign in error:`, err);
            setError(err.message || `Failed to sign in with ${provider}`);
            setOauthLoading('');
        }
    };

    // Resume OAuth after www→apex bounce
    useEffect(() => {
        if (!router.isReady) return;
        const provider = router.query.provider;
        if (typeof provider === 'string' && ['google', 'apple', 'discord', 'facebook'].includes(provider)) {
            const cleanQuery = { ...router.query };
            delete cleanQuery.provider;
            router.replace({ pathname: router.pathname, query: cleanQuery }, undefined, { shallow: true });
            handleOAuthSignIn(provider);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router.isReady]);

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(180deg, #0a1628 0%, #0d1f35 50%, #0a1628 100%)',
            fontFamily: 'Inter, system-ui, sans-serif',
            padding: 20,
        }}>
            {/* Logo - Clean Text Brand */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginBottom: 40,
            }}>
                <span style={{
                    fontSize: 32,
                    fontWeight: 700,
                    color: '#ffffff',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.1,
                }}>SMARTER.POKER</span>
                <span style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'rgba(0, 212, 255, 0.8)',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    marginTop: 6,
                }}>Train Smarter, Win More</span>
            </div>

            {/* Title */}
            <h1 style={{
                fontSize: 24,
                fontWeight: 600,
                color: '#ffffff',
                marginBottom: 8,
                letterSpacing: '-0.01em',
            }}>
                {mode === 'login' ? 'Welcome Back' : 'Create Account'}
            </h1>

            <p style={{
                fontSize: 14,
                color: 'rgba(255, 255, 255, 0.5)',
                marginBottom: 32,
            }}>
                {mode === 'login' ? 'Sign In To Continue' : 'Join The Smarter.Poker Community'}
            </p>

            {/* Already signed in banner */}
            {existingUser && (
                <div style={{
                    width: '100%',
                    maxWidth: 360,
                    padding: '16px 20px',
                    background: 'rgba(24, 119, 242, 0.15)',
                    border: '1px solid rgba(24, 119, 242, 0.4)',
                    borderRadius: 12,
                    marginBottom: 24,
                    textAlign: 'center',
                }}>
                    <p style={{ fontSize: 14, color: '#fff', margin: '0 0 4px', fontWeight: 600 }}>
                        You Are Already Signed In
                    </p>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '0 0 12px' }}>
                        {existingUser}
                    </p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        <button
                            onClick={() => { sessionStorage.setItem('just_authenticated', 'true'); router.push('/hub'); }}
                            style={{
                                padding: '10px 20px', fontSize: 14, fontWeight: 600,
                                background: 'linear-gradient(135deg, #1877F2, #0a5dc2)',
                                color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer',
                            }}
                        >
                            Continue To Hub
                        </button>
                        <button
                            onClick={handleSwitchAccount}
                            disabled={isLoading}
                            style={{
                                padding: '10px 20px', fontSize: 14, fontWeight: 600,
                                background: 'transparent', color: 'rgba(255,255,255,0.7)',
                                border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, cursor: 'pointer',
                            }}
                        >
                            Switch Account
                        </button>
                    </div>
                </div>
            )}

            {/* Google Sign In Button */}
            {mode === 'login' && (
                <>
                    <button
                        type="button"
                        onClick={() => handleOAuthSignIn('google')}
                        disabled={!!oauthLoading}
                        style={{
                            width: '100%',
                            maxWidth: 360,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 12,
                            padding: '14px 24px',
                            background: '#ffffff',
                            border: 'none',
                            borderRadius: 8,
                            cursor: oauthLoading ? 'wait' : 'pointer',
                            fontSize: 16,
                            fontWeight: 600,
                            color: '#1f1f1f',
                            marginBottom: 4,
                            opacity: oauthLoading && oauthLoading !== 'google' ? 0.5 : 1,
                            transition: 'all 0.2s ease',
                        }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        <span>{oauthLoading === 'google' ? 'Connecting...' : 'Continue With Google'}</span>
                    </button>

                    {/* Facebook Sign In Button — mirrors Google flow */}
                    <button
                        type="button"
                        onClick={() => handleOAuthSignIn('facebook')}
                        disabled={!!oauthLoading}
                        style={{
                            width: '100%',
                            maxWidth: 360,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 12,
                            padding: '14px 24px',
                            background: '#1877F2',
                            border: 'none',
                            borderRadius: 8,
                            cursor: oauthLoading ? 'wait' : 'pointer',
                            fontSize: 16,
                            fontWeight: 600,
                            color: '#ffffff',
                            marginBottom: 4,
                            opacity: oauthLoading && oauthLoading !== 'facebook' ? 0.5 : 1,
                            transition: 'all 0.2s ease',
                        }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                            <path fill="#ffffff" d="M24 12.073c0-6.627-5.373-12-12-12S0 5.446 0 12.073c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.875v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                        <span>{oauthLoading === 'facebook' ? 'Connecting...' : 'Continue With Facebook'}</span>
                    </button>

                    <div style={{
                        width: '100%',
                        maxWidth: 360,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        margin: '8px 0',
                    }}>
                        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.15)' }} />
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Or</span>
                        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.15)' }} />
                    </div>
                </>
            )}

            {/* Auth Form */}
            <form onSubmit={mode === 'login' ? handleLogin : handleSignup} autoComplete="off" style={{
                width: '100%',
                maxWidth: 360,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
            }}>
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="off"
                    style={{
                        padding: '14px 16px',
                        fontSize: 16,
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: 8,
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: '#fff',
                        outline: 'none',
                    }}
                />

                <div style={{ position: 'relative' }}>
                    <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        style={{
                            width: '100%',
                            padding: '14px 48px 14px 16px',
                            fontSize: 16,
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: 8,
                            background: 'rgba(255, 255, 255, 0.1)',
                            color: '#fff',
                            outline: 'none',
                            boxSizing: 'border-box',
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                            position: 'absolute',
                            right: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'rgba(255, 255, 255, 0.6)',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        tabIndex={-1}
                    >
                        {showPassword ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                        )}
                    </button>
                </div>

                {mode === 'login' && (
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: -4,
                    }}>
                        {/* Remember Me Checkbox */}
                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                            color: 'rgba(255, 255, 255, 0.7)',
                            fontSize: 13,
                        }}>
                            <input
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                style={{
                                    width: 16,
                                    height: 16,
                                    accentColor: '#1877F2',
                                    cursor: 'pointer',
                                }}
                            />
                            Remember Me
                        </label>
                        <button
                            type="button"
                            onClick={() => router.push('/auth/forgot-password')}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'rgba(255, 255, 255, 0.6)',
                                fontSize: 13,
                                cursor: 'pointer',
                            }}
                        >
                            Forgot Password?
                        </button>
                    </div>
                )}

                {error && (
                    <div style={{
                        padding: '12px',
                        background: 'rgba(220, 38, 38, 0.2)',
                        border: '1px solid rgba(220, 38, 38, 0.5)',
                        borderRadius: 8,
                        color: '#f87171',
                        fontSize: 14,
                        textAlign: 'center',
                    }}>
                        {error}
                    </div>
                )}

                {message && (
                    <div style={{
                        padding: '12px',
                        background: 'rgba(34, 197, 94, 0.2)',
                        border: '1px solid rgba(34, 197, 94, 0.5)',
                        borderRadius: 8,
                        color: '#4ade80',
                        fontSize: 14,
                        textAlign: 'center',
                    }}>
                        {message}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={isLoading}
                    style={{
                        padding: '14px 24px',
                        fontSize: 16,
                        fontWeight: 600,
                        color: '#ffffff',
                        background: isLoading
                            ? 'rgba(100, 100, 100, 0.5)'
                            : 'linear-gradient(135deg, #1877F2, #0a5dc2)',
                        border: 'none',
                        borderRadius: 8,
                        cursor: isLoading ? 'wait' : 'pointer',
                        transition: 'all 0.3s ease',
                    }}
                >
                    {isLoading
                        ? 'Please wait...'
                        : mode === 'login'
                            ? 'Sign In'
                            : 'Create Account'}
                </button>

                {mode === 'login' && (
                    <button
                        type="button"
                        onClick={handleMagicLink}
                        disabled={isLoading}
                        style={{
                            padding: '14px 24px',
                            fontSize: 14,
                            fontWeight: 500,
                            color: 'rgba(255, 255, 255, 0.7)',
                            background: 'transparent',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: 8,
                            cursor: 'pointer',
                        }}
                    >
                        ✨ Send Magic Link
                    </button>
                )}
            </form>

            {/* Toggle Mode */}
            <p style={{
                marginTop: 24,
                fontSize: 14,
                color: 'rgba(255, 255, 255, 0.6)',
            }}>
                {mode === 'login' ? "Don't Have An Account? " : "Already Have An Account? "}
                <button
                    onClick={() => {
                        setMode(mode === 'login' ? 'signup' : 'login');
                        setError(null);
                        setMessage(null);
                    }}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#1877F2',
                        cursor: 'pointer',
                        fontWeight: 600,
                        textDecoration: 'underline',
                    }}
                >
                    {mode === 'login' ? 'Sign Up' : 'Sign In'}
                </button>
            </p>

            {/* Footer */}
            <p style={{
                position: 'absolute',
                bottom: 24,
                fontSize: 12,
                color: 'rgba(255, 255, 255, 0.3)',
            }}>
                © 2026 Smarter.Poker — All Rights Reserved
            </p>
        </div>
    );
}
