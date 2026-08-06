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
        // Only allow internal redirects (prevent open redirect attacks).
        // '//evil.com' is protocol-relative and WOULD leave the site — block it.
        if (r && typeof r === 'string' && r.startsWith('/') && !r.startsWith('//')) return r;
        return '/hub';
    };

    // ── [2026-08-04] Server-side error visibility ────────────────────────────
    // Client Sentry is disabled (OOM workaround), so console.warn in these
    // catch blocks was invisible in production — a big reason auth failures
    // looked "silent". Fire-and-forget POST to the capture endpoint; never
    // let telemetry break the auth flow itself.
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
            }).catch(() => { /* telemetry is best-effort */ });
        } catch (_e) { /* never throw from telemetry */ }
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

    // ── [Phase 6.1.27] MFA step 2 ────────────────────────────
    // Nothing in the app routed to /auth/mfa, so an enrolled second factor was
    // never actually challenged at sign-in — the page existed and no code path
    // reached it. One POST answers both questions we have at this moment:
    //
    //   mfaEnabled — is there a factor on this account at all?
    //   trusted    — does this browser hold a live 30-day trusted device?
    //
    // Trusted also mints a fresh 12h `mfa_session` server-side, so a returning
    // user inside their 30 days goes straight through with no code. That is
    // the "one code every 30 days, good for everything" path.
    //
    // Fails OPEN: if this call errors we let the user into the hub. It only
    // decides whether to PROMPT — every sensitive route still enforces
    // independently via src/lib/mfaGate.js, so a skipped prompt cannot grant
    // access to anything. Failing closed would lock everyone out on a blip.
    const needsMfaChallenge = async (accessToken) => {
        if (!accessToken) return false;
        try {
            const res = await fetch('/api/auth/mfa/check-trusted', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            if (!res.ok) return false;
            const json = await res.json().catch(() => ({}));
            return json?.mfaEnabled === true && json?.trusted !== true;
        } catch (err) {
            console.warn('[login] MFA status check failed, continuing:', err?.message || err);
            return false;
        }
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


            // ── Step 2: second factor, if this browser isn't already trusted ──
            if (await needsMfaChallenge(data?.session?.access_token)) {
                const dest = getRedirectUrl();
                router.push(`/auth/mfa?redirect=${encodeURIComponent(dest)}`);
                return;
            }

            // Set flag so hub plays intro animation
            sessionStorage.setItem('just_authenticated', 'true');
            router.push(getRedirectUrl());
        } catch (err) {
            console.warn('Login error:', err);
            reportAuthError('login_form_submit', err);

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
            reportAuthError('magic_link_send', err);
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
            reportAuthError('login_oauth_init', err);
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
            position: 'relative',
            width: '100%',
            height: '100vh',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: '#000',
            overflow: 'hidden'
        }}>
            {/* Aspect-ratio locked container — image is 682×1024 (2:3) */}
            <div style={{
                position: 'relative',
                width: '100%',
                maxWidth: 'min(100vw, 66.6vh)',
                aspectRatio: '682 / 1024',
                backgroundImage: `url('/images/dynamic-login-bg.jpg')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                boxShadow: '0 0 50px rgba(0, 212, 255, 0.2)'
            }}>
                <style>{`
                    input:-webkit-autofill,
                    input:-webkit-autofill:hover,
                    input:-webkit-autofill:focus,
                    input:-webkit-autofill:active {
                        transition: background-color 5000s ease-in-out 0s;
                        -webkit-text-fill-color: #fff !important;
                    }
                    .login-input-box {
                        background: rgba(0, 8, 25, 0.65) !important;
                        border: 1.5px solid rgba(0, 212, 255, 0.4) !important;
                        border-radius: 6px !important;
                        color: #fff !important;
                        font-size: 14px !important;
                        transition: border-color 0.2s, box-shadow 0.2s;
                    }
                    .login-input-box:focus {
                        border-color: rgba(0, 212, 255, 0.8) !important;
                        box-shadow: 0 0 8px rgba(0, 212, 255, 0.35) !important;
                        outline: none !important;
                    }
                    .login-field-label {
                        position: absolute;
                        color: rgba(255,255,255,0.7);
                        font-size: 10px;
                        font-weight: 600;
                        letter-spacing: 0.1em;
                        text-transform: uppercase;
                        zIndex: 10;
                        pointer-events: none;
                    }
                `}</style>

                {/* ── Already-signed-in button row ── */}
                {existingUser && (
                    <div style={{
                        position: 'absolute', top: '47%', left: '25%', width: '50%', height: '3.2%',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10
                    }}>
                        <button
                            onClick={() => { sessionStorage.setItem('just_authenticated', 'true'); router.push('/hub'); }}
                            style={{ width: '48%', height: '100%', background: 'transparent', border: 'none', cursor: 'pointer', outline: 'none' }}
                            title="Continue To Hub"
                        />
                        <button
                            onClick={handleSwitchAccount}
                            disabled={isLoading}
                            style={{ width: '48%', height: '100%', background: 'transparent', border: 'none', cursor: 'pointer', outline: 'none' }}
                            title="Switch Account"
                        />
                    </div>
                )}

                {/* ── OAuth buttons ── */}
                {mode === 'login' && (
                    <>
                        <button
                            type="button"
                            onClick={() => handleOAuthSignIn('google')}
                            disabled={!!oauthLoading}
                            title="Continue With Google"
                            style={{
                                position: 'absolute', top: '52%', left: '25%', width: '50%', height: '4.4%',
                                background: 'transparent', border: 'none', cursor: oauthLoading ? 'wait' : 'pointer', zIndex: 10, outline: 'none',
                            }}
                            onFocus={(e) => e.target.style.boxShadow = '0 0 8px 2px rgba(255,255,255,0.4)'}
                            onBlur={(e) => e.target.style.boxShadow = 'none'}
                        />
                        <button
                            type="button"
                            onClick={() => handleOAuthSignIn('facebook')}
                            disabled={!!oauthLoading}
                            title="Continue With Facebook"
                            style={{
                                position: 'absolute', top: '57%', left: '25%', width: '50%', height: '4.4%',
                                background: 'transparent', border: 'none', cursor: oauthLoading ? 'wait' : 'pointer', zIndex: 10, outline: 'none',
                            }}
                            onFocus={(e) => e.target.style.boxShadow = '0 0 8px 2px rgba(24,119,242,0.7)'}
                            onBlur={(e) => e.target.style.boxShadow = 'none'}
                        />
                    </>
                )}

                {/* ── Main Auth Form ── */}
                <form onSubmit={mode === 'login' ? handleLogin : handleSignup} autoComplete="on" style={{ position: 'absolute', inset: 0, margin: 0, padding: 0 }}>

                    {/* Error / Success banner */}
                    {(error || message) && (
                        <div style={{
                            position: 'absolute', top: '62%', left: '24%', width: '52%',
                            padding: '7px 10px',
                            background: error ? 'rgba(220,38,38,0.92)' : 'rgba(34,197,94,0.92)',
                            border: `1px solid ${error ? '#f87171' : '#4ade80'}`,
                            borderRadius: 8, color: '#fff', fontSize: '0.75rem', textAlign: 'center', zIndex: 20
                        }}>
                            {error || message}
                        </div>
                    )}

                    {/* Email input */}
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        placeholder="Enter Your Email"
                        className="login-input-box"
                        style={{
                            position: 'absolute', top: '63.6%', left: '25%', width: '50%', height: '2.5%',
                            padding: '0 14px', boxSizing: 'border-box', zIndex: 10,
                            background: 'transparent', border: 'none', outline: 'none', color: '#fff',
                            boxShadow: 'none'
                        }}
                        onFocus={(e) => e.target.style.boxShadow = '0 0 5px 1px rgba(0,212,255,0.3)'}
                        onBlur={(e) => e.target.style.boxShadow = 'none'}
                    />

                    {/* Password input */}
                    <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        placeholder="Password"
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        className="login-input-box"
                        style={{
                            position: 'absolute', top: '69.8%', left: '25%', width: '46%', height: '2.5%',
                            padding: '0 14px', boxSizing: 'border-box', zIndex: 10,
                            background: 'transparent', border: 'none', outline: 'none', color: '#fff',
                            boxShadow: 'none'
                        }}
                        onFocus={(e) => e.target.style.boxShadow = '0 0 5px 1px rgba(0,212,255,0.3)'}
                        onBlur={(e) => e.target.style.boxShadow = 'none'}
                    />

                    {/* Show/hide password toggle */}
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                            position: 'absolute', top: '69.8%', left: '71.5%', width: '3.5%', height: '2.5%',
                            background: 'transparent', border: 'none', cursor: 'pointer', zIndex: 11,
                            color: 'rgba(255,255,255,0.5)', fontSize: '14px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                        tabIndex={-1}
                        title={showPassword ? 'Hide Password' : 'Show Password'}
                    >
                        {showPassword ? '👁' : '👁‍🗨'}
                    </button>

                    {mode === 'login' && (
                        <>
                            {/* Remember Me checkbox (invisible, over baked-in checkbox) */}
                            <input
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                style={{
                                    position: 'absolute', top: '73.3%', left: '25%', width: '2%', height: '1.8%',
                                    opacity: 0, cursor: 'pointer', zIndex: 10
                                }}
                                title="Remember Me"
                            />
                            {/* Forgot Password link (invisible, over baked-in text) */}
                            <button
                                type="button"
                                onClick={() => router.push('/auth/forgot-password')}
                                style={{
                                    position: 'absolute', top: '73.3%', left: '60%', width: '14%', height: '2%',
                                    background: 'transparent', border: 'none', cursor: 'pointer', zIndex: 10
                                }}
                                title="Forgot Password"
                            />
                        </>
                    )}

                    {/* Sign In button */}
                    <button
                        type="submit"
                        disabled={isLoading}
                        title={mode === 'login' ? 'Sign In' : 'Create Account'}
                        style={{
                            position: 'absolute', top: '77%', left: '25%', width: '50%', height: '4.4%',
                            background: 'transparent', border: 'none', cursor: isLoading ? 'wait' : 'pointer', zIndex: 10, outline: 'none',
                        }}
                        onFocus={(e) => e.target.style.boxShadow = '0 0 10px 3px rgba(0,212,255,0.5)'}
                        onBlur={(e) => e.target.style.boxShadow = 'none'}
                    />

                    {/* Send Magic Link button */}
                    {mode === 'login' && (
                        <button
                            type="button"
                            onClick={handleMagicLink}
                            disabled={isLoading}
                            title="Send Magic Link"
                            style={{
                                position: 'absolute', top: '82%', left: '25%', width: '50%', height: '4.4%',
                                background: 'transparent', border: 'none', cursor: isLoading ? 'wait' : 'pointer', zIndex: 10, outline: 'none',
                            }}
                            onFocus={(e) => e.target.style.boxShadow = '0 0 10px 2px rgba(255,215,0,0.5)'}
                            onBlur={(e) => e.target.style.boxShadow = 'none'}
                        />
                    )}
                </form>

                {/* Sign Up toggle (invisible overlay on "Don't Have An Account? Sign Up") */}
                <button
                    onClick={() => {
                        setMode(mode === 'login' ? 'signup' : 'login');
                        setError(null);
                        setMessage(null);
                    }}
                    style={{
                        position: 'absolute', top: '88.5%', left: '35%', width: '30%', height: '2%',
                        background: 'transparent', border: 'none', cursor: 'pointer', zIndex: 10
                    }}
                    title={mode === 'login' ? 'Sign Up' : 'Sign In'}
                >
                    {/* The text is drawn in the image, so we leave the button empty or with transparent text if needed */}
                </button>
            </div>


        </div>
    );
}
