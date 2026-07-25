/* ═══════════════════════════════════════════════════════════════════════════
   MFA CHALLENGE PAGE — Phase 6.1.23
   URL: /auth/mfa
   ═══════════════════════════════════════════════════════════════════════════

   Step-2 UX for post-login MFA challenge. Users land here in two ways:

   1. Post-signin redirect — login.js sees profiles.mfa_required === true
      (or user_mfa_factors.enabled === true) and routes here after a
      successful password sign-in.

   2. Fallback redirect — any fetch to an admin / sensitive API route that
      returns `{ requiresMfa: true, status: 403 }` triggers the global
      fetch wrapper (see src/lib/api.js) to push the user here, preserving
      their intended destination via ?next=<path>.

   On submit we POST to /api/auth/mfa/challenge with either the 6-digit
   TOTP code or a backup code (10-char alphanumeric). The server issues
   an HttpOnly `mfa_session` cookie on success — we just need to navigate
   away; the cookie is set by the server.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../../src/lib/supabase';

export default function MfaChallengePage() {
    const router = useRouter();
    const inputRef = useRef(null);

    const [code, setCode] = useState('');
    const [useBackup, setUseBackup] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [session, setSession] = useState(null);
    const [checkingSession, setCheckingSession] = useState(true);

    // [Phase 6.1.26] step-up flag. When true, the user is re-challenging
    // for a high-risk action (change email, withdraw, disable MFA, etc.)
    // even though they already have a valid 12h session cookie.
    const isStepUp = router.query.stepUp === '1' || router.query.stepUp === 'true';

    // Where to send the user after successful challenge. Only internal
    // paths are allowed to prevent open-redirect abuse.
    const getNextUrl = () => {
        const n = router.query.next;
        if (n && typeof n === 'string' && n.startsWith('/') && !n.startsWith('//')) {
            return n;
        }
        return '/hub';
    };

    // Gate the page — user must already have a Supabase session (i.e. they've
    // completed step-1 password auth). If not, bounce them back to /auth/login.
    useEffect(() => {
        async function checkSession() {
            const { data: { session: s } } = await supabase.auth.getSession();
            if (!s) {
                router.replace(`/auth/login?redirect=${encodeURIComponent('/auth/mfa')}`);
                return;
            }
            setSession(s);
            setCheckingSession(false);
            // Focus the code field once we're past the gate
            setTimeout(() => inputRef.current?.focus(), 50);
        }
        checkSession();
    }, [router]);

    const handleSubmit = async (e) => {
        e?.preventDefault?.();
        setError(null);

        // Backup codes are 8 hex chars (see /api/auth/mfa/verify.js —
        // crypto.randomBytes(4).toString('hex')). Strip EVERYTHING that
        // isn't alphanumeric so users who type dash-grouped formats
        // (A1B2-C3D4) still verify.
        const cleaned = useBackup
            ? String(code).replace(/[^A-Za-z0-9]/g, '').toUpperCase()
            : String(code).replace(/\s+/g, '');

        if (useBackup) {
            if (cleaned.length !== 8) {
                setError('Backup codes are 8 characters (letters and numbers).');
                return;
            }
        } else {
            if (!/^\d{6}$/.test(cleaned)) {
                setError('Enter the 6-digit code from your authenticator app.');
                return;
            }
        }

        setIsLoading(true);
        try {
            const res = await fetch('/api/auth/mfa/challenge', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    code: cleaned,
                    isBackupCode: useBackup,
                }),
            });

            const json = await res.json().catch(() => ({}));

            if (!res.ok || !json.success) {
                // Keep server wording out of UI — neutral, non-enumerating.
                if (res.status === 429) {
                    setError('Too many attempts. Please wait a minute and try again.');
                } else {
                    setError(json.error || 'That code didn\'t work. Please try again.');
                }
                setCode('');
                return;
            }

            // Cookie is set by the server. Flag for the hub animation and go.
            sessionStorage.setItem('mfa_verified', 'true');
            router.replace(getNextUrl());
        } catch (err) {
            console.warn('[mfa] challenge error:', err);
            setError('Unable to verify right now. Please try again in a moment.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignOut = async () => {
        setIsLoading(true);
        await supabase.auth.signOut();
        router.replace('/auth/login');
    };

    if (checkingSession) {
        return (
            <div style={bgStyle}>
                <div style={cardStyle}>
                    <p style={{ color: '#cbd5e1', textAlign: 'center' }}>
                        Loading…
                    </p>
                </div>
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>Two-Factor Authentication · Smarter.Poker</title>
                <meta name="robots" content="noindex,nofollow" />
            </Head>
            <div style={bgStyle}>
                <div style={cardStyle}>
                    <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                        <div style={lockBadgeStyle}>🔒</div>
                        <h1 style={titleStyle}>
                            {isStepUp ? 'Confirm it\'s you' : 'Two-Factor Authentication'}
                        </h1>
                        <p style={subtitleStyle}>
                            {isStepUp
                                ? 'This action requires a fresh second-factor check.'
                                : useBackup
                                    ? 'Enter one of your backup codes.'
                                    : 'Enter the 6-digit code from your authenticator app.'}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <label style={labelStyle}>
                            {useBackup ? 'Backup code' : 'Verification code'}
                        </label>
                        <input
                            ref={inputRef}
                            type="text"
                            inputMode={useBackup ? 'text' : 'numeric'}
                            autoComplete="one-time-code"
                            maxLength={useBackup ? 12 : 6}
                            placeholder={useBackup ? 'A1B2C3D4' : '123456'}
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            disabled={isLoading}
                            style={inputStyle}
                            aria-label={useBackup ? 'Backup code' : 'Six digit verification code'}
                        />

                        {error && (
                            <div style={errorStyle} role="alert">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading || !code}
                            style={{
                                ...primaryBtnStyle,
                                opacity: isLoading || !code ? 0.55 : 1,
                                cursor: isLoading || !code ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {isLoading ? 'Verifying…' : 'Verify & Continue'}
                        </button>
                    </form>

                    <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                        <button
                            type="button"
                            onClick={() => {
                                setError(null);
                                setCode('');
                                setUseBackup((v) => !v);
                                setTimeout(() => inputRef.current?.focus(), 50);
                            }}
                            style={linkBtnStyle}
                            disabled={isLoading}
                        >
                            {useBackup
                                ? 'Use your authenticator app instead'
                                : 'Use a backup code'}
                        </button>
                    </div>

                    <div style={dividerStyle} />

                    <div style={{ textAlign: 'center' }}>
                        <button
                            type="button"
                            onClick={handleSignOut}
                            style={mutedLinkBtnStyle}
                            disabled={isLoading}
                        >
                            Sign out and start over
                        </button>
                    </div>

                    <p style={helpTextStyle}>
                        Lost your authenticator and backup codes?{' '}
                        <a href="mailto:support@smarter.poker" style={{ color: '#60a5fa' }}>
                            Contact support
                        </a>
                        {' '}— account recovery requires identity verification.
                    </p>
                </div>
            </div>
        </>
    );
}

/* ── styles (inline so this page has zero external deps) ─────────────────── */

const bgStyle = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem',
    background:
        'radial-gradient(ellipse at top, #1e293b 0%, #0f172a 50%, #020617 100%)',
};

const cardStyle = {
    width: '100%',
    maxWidth: '26rem',
    background: 'rgba(15, 23, 42, 0.85)',
    border: '1px solid rgba(148, 163, 184, 0.25)',
    borderRadius: '1rem',
    padding: '2rem',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.55)',
    backdropFilter: 'blur(12px)',
};

const lockBadgeStyle = {
    fontSize: '2.25rem',
    width: '4rem',
    height: '4rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '9999px',
    background: 'rgba(59, 130, 246, 0.15)',
    border: '1px solid rgba(59, 130, 246, 0.4)',
    marginBottom: '0.75rem',
};

const titleStyle = {
    color: '#f8fafc',
    fontSize: '1.5rem',
    fontWeight: 700,
    margin: 0,
    letterSpacing: '-0.01em',
};

const subtitleStyle = {
    color: '#94a3b8',
    fontSize: '0.9rem',
    margin: '0.5rem 0 0',
};

const labelStyle = {
    display: 'block',
    fontSize: '0.8rem',
    color: '#cbd5e1',
    marginBottom: '0.4rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: 600,
};

const inputStyle = {
    width: '100%',
    padding: '0.9rem 1rem',
    fontSize: '1.25rem',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    letterSpacing: '0.3em',
    textAlign: 'center',
    background: 'rgba(2, 6, 23, 0.6)',
    border: '1px solid rgba(148, 163, 184, 0.3)',
    borderRadius: '0.5rem',
    color: '#f8fafc',
    outline: 'none',
    boxSizing: 'border-box',
};

const errorStyle = {
    marginTop: '0.75rem',
    padding: '0.65rem 0.85rem',
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.35)',
    borderRadius: '0.5rem',
    color: '#fca5a5',
    fontSize: '0.85rem',
};

const primaryBtnStyle = {
    marginTop: '1.25rem',
    width: '100%',
    padding: '0.85rem 1rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#f8fafc',
    background:
        'linear-gradient(135deg, rgba(59, 130, 246, 0.95), rgba(37, 99, 235, 0.95))',
    border: '1px solid rgba(59, 130, 246, 0.5)',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
};

const linkBtnStyle = {
    background: 'transparent',
    border: 'none',
    color: '#60a5fa',
    fontSize: '0.85rem',
    cursor: 'pointer',
    padding: '0.25rem 0.5rem',
    textDecoration: 'underline',
};

const mutedLinkBtnStyle = {
    background: 'transparent',
    border: 'none',
    color: '#64748b',
    fontSize: '0.8rem',
    cursor: 'pointer',
    padding: '0.25rem 0.5rem',
};

const dividerStyle = {
    height: '1px',
    background: 'rgba(148, 163, 184, 0.15)',
    margin: '1.25rem 0 1rem',
};

const helpTextStyle = {
    marginTop: '1rem',
    color: '#64748b',
    fontSize: '0.75rem',
    textAlign: 'center',
    lineHeight: 1.5,
};
