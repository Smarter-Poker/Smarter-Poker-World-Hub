/* ═══════════════════════════════════════════════════════════════════════════
   MFA CHALLENGE PAGE — SMS FACTOR  ·  /auth/mfa
   ═══════════════════════════════════════════════════════════════════════════

   Step-2 UX for the post-login MFA challenge. Users land here in two ways:

   1. Post-signin redirect — login.js POSTs /api/auth/mfa/check-trusted first.
      If this device is already trusted the user never sees this page at all;
      that is the intended normal path (one code every 30 days).

   2. Fallback redirect — any fetch to a gated API that answers
      `{ requiresMfa: true }` pushes the user here with ?next=<path>.

   THE FACTOR IS A TEXT MESSAGE. There is no authenticator app, no QR, no
   TOTP. On mount we ask /api/auth/mfa/send-code to text a code
   (`{ action: 'send' }`), then submit that code back to the same route.
   The server sets the HttpOnly cookies — we only navigate.

   "Remember this device for 30 days" DEFAULTS TO CHECKED. Daniel's rule is
   one code every 30 days covering every gate, so being remembered is the
   normal path, not an opt-in. The server also defaults `rememberDevice` to
   true, but we send it explicitly so the UI and the cookie never disagree.

   DEFENSIVE BY DESIGN: the API shapes are being changed alongside this page.
   Every field read off a response is optional, every JSON parse is guarded,
   and nothing here throws if the server answers with something unexpected.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../../src/lib/supabase';

/* Seconds the "Resend code" button stays locked after a successful send. */
const RESEND_COOLDOWN_SEC = 30;
/* Longer lock when the server tells us we are rate limited. */
const RATE_LIMITED_COOLDOWN_SEC = 60;
/* Backup codes are 8 hex chars — crypto.randomBytes(4).toString('hex'). */
const BACKUP_CODE_LEN = 8;

/** Never let a malformed body throw. Always hand back a plain object. */
async function readJson(res) {
    try {
        const parsed = await res.json();
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_e) {
        return {};
    }
}

export default function MfaChallengePage() {
    const router = useRouter();
    const inputRef = useRef(null);
    const didSendRef = useRef(false);

    const [code, setCode] = useState('');
    const [useBackup, setUseBackup] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [session, setSession] = useState(null);
    const [checkingSession, setCheckingSession] = useState(true);

    /* Remembering the device is the default, not the exception. */
    const [rememberDevice, setRememberDevice] = useState(true);

    /* Everything below is filled in by the send response and is optional. */
    const [phoneHint, setPhoneHint] = useState(null);   // "••• ••• 1234"
    const [challengeId, setChallengeId] = useState(null);
    const [codeLength, setCodeLength] = useState(null); // null = server didn't say
    const [cooldown, setCooldown] = useState(0);
    const [needsPhone, setNeedsPhone] = useState(false);
    const [sendFailed, setSendFailed] = useState(false);
    const [notEnrolled, setNotEnrolled] = useState(false);

    // [Phase 6.1.26] step-up flag — a high-risk action re-confirming the user.
    const isStepUp = router.query.stepUp === '1' || router.query.stepUp === 'true';

    /* Only internal paths, to prevent open-redirect abuse. */
    const getNextUrl = () => {
        const n = router.query.next;
        if (n && typeof n === 'string' && n.startsWith('/') && !n.startsWith('//')) {
            return n;
        }
        return '/hub';
    };

    /* How many digits we expect. The server reports `codeLength` (currently 4,
       matching the shared sms_otp_codes pipeline). If it stops reporting it we
       accept any 4-8 digit code rather than blocking the user on our guess. */
    const expectedLen =
        Number.isInteger(codeLength) && codeLength >= 4 && codeLength <= 8 ? codeLength : null;

    /* ── Countdown ticker for the resend cooldown ────────────────────────── */
    useEffect(() => {
        if (cooldown <= 0) return undefined;
        const t = setTimeout(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
        return () => clearTimeout(t);
    }, [cooldown]);

    /* ── Ask the server to text a code ───────────────────────────────────── */
    const sendCode = useCallback(async (accessToken, { isResend = false } = {}) => {
        if (!accessToken) return;
        setIsSending(true);
        setError(null);
        try {
            // Sending and verifying are DIFFERENT routes. /challenge only
            // verifies and hard-400s without a `code`; /send-code is the one
            // that texts. Pointing both at /challenge meant the code was
            // never sent and the user sat on an empty input forever.
            const res = await fetch('/api/auth/mfa/send-code', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            const json = await readJson(res);

            if (!res.ok) {
                setSendFailed(true);
                if (res.status === 401) {
                    router.replace(`/auth/login?redirect=${encodeURIComponent('/auth/mfa')}`);
                    return;
                }
                /* The server tells us when texting is not an option at all
                   (dead handset, Twilio down). Put the user straight on the
                   backup-code input instead of leaving them waiting for an
                   SMS that is never coming. */
                if (json.useBackupCode === true) {
                    setUseBackup(true);
                    setCode('');
                }
                /* Not enrolled — no code will ever arrive. Offer a way out
                   rather than trapping the user on a dead form. */
                if (json.code === 'MFA_NOT_ENABLED') {
                    setNotEnrolled(true);
                    setError(
                        typeof json.error === 'string' && json.error
                            ? json.error
                            : 'Two-factor authentication is not enabled on this account.',
                    );
                    return;
                }
                if (json.requiresPhoneVerification || json.code === 'PHONE_NOT_VERIFIED') {
                    setNeedsPhone(true);
                    setError(
                        typeof json.error === 'string'
                            ? json.error
                            : 'We have no verified mobile number to text. Add and verify a phone number in Settings, or use a backup code.',
                    );
                    return;
                }
                if (res.status === 429) {
                    setCooldown(RATE_LIMITED_COOLDOWN_SEC);
                    setError('Too many code requests. Please wait a minute before trying again.');
                    return;
                }
                setError(
                    typeof json.error === 'string' && json.error
                        ? json.error
                        : 'We could not send your code right now. Try again, or use a backup code.',
                );
                return;
            }

            setSendFailed(false);
            setNeedsPhone(false);
            if (typeof json.phoneHint === 'string' && json.phoneHint) setPhoneHint(json.phoneHint);
            if (json.challengeId) setChallengeId(json.challengeId);
            if (Number.isFinite(Number(json.codeLength))) setCodeLength(Number(json.codeLength));
            setCooldown(RESEND_COOLDOWN_SEC);
            setNotice(isResend ? 'New code sent.' : null);
            setTimeout(() => inputRef.current?.focus(), 50);
        } catch (err) {
            console.warn('[mfa] send error:', err);
            setSendFailed(true);
            setError('We could not reach the server to send your code. Please try again.');
        } finally {
            setIsSending(false);
        }
    }, [router]);

    /* ── Gate the page, then text the code ───────────────────────────────── */
    useEffect(() => {
        let cancelled = false;
        async function boot() {
            let s = null;
            try {
                const { data } = await supabase.auth.getSession();
                s = data?.session || null;
            } catch (err) {
                console.warn('[mfa] session lookup failed:', err);
            }
            if (cancelled) return;
            if (!s) {
                router.replace(`/auth/login?redirect=${encodeURIComponent('/auth/mfa')}`);
                return;
            }
            setSession(s);
            setCheckingSession(false);
            /* React 18 StrictMode mounts effects twice in dev — send once. */
            if (!didSendRef.current) {
                didSendRef.current = true;
                sendCode(s.access_token);
            }
        }
        boot();
        return () => { cancelled = true; };
    }, [router, sendCode]);

    const handleResend = () => {
        if (cooldown > 0 || isSending || isLoading) return;
        setCode('');
        setNotice(null);
        sendCode(session?.access_token, { isResend: true });
    };

    const handleSubmit = async (e) => {
        e?.preventDefault?.();
        setError(null);
        setNotice(null);

        /* Strip formatting so dash-grouped backup codes still verify. */
        const cleaned = useBackup
            ? String(code).replace(/[^A-Za-z0-9]/g, '').toUpperCase()
            : String(code).replace(/\D/g, '');

        if (useBackup) {
            if (cleaned.length !== BACKUP_CODE_LEN) {
                setError('Backup codes are 8 characters (letters and numbers).');
                return;
            }
        } else if (expectedLen) {
            if (cleaned.length !== expectedLen) {
                setError(`Enter the ${expectedLen}-digit code we texted you.`);
                return;
            }
        } else if (!/^\d{4,8}$/.test(cleaned)) {
            setError('Enter the code we texted you.');
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch('/api/auth/mfa/challenge', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({
                    code: cleaned,
                    challengeId: challengeId || undefined,
                    isBackupCode: useBackup,
                    rememberDevice,
                }),
            });

            const json = await readJson(res);

            /* Treat "ok and not explicitly failed" as success so a changed
               response shape cannot strand a user who really did verify. */
            if (!res.ok || json.success === false) {
                if (res.status === 401) {
                    router.replace(`/auth/login?redirect=${encodeURIComponent('/auth/mfa')}`);
                    return;
                }
                if (res.status === 429) {
                    setError('Too many attempts. Request a new code and try again.');
                } else if (json.expired || json.tooManyAttempts) {
                    setError(
                        typeof json.error === 'string' && json.error
                            ? json.error
                            : 'That code is no longer valid. Send yourself a new one.',
                    );
                    setCooldown(0);
                } else {
                    setError(
                        typeof json.error === 'string' && json.error
                            ? json.error
                            : "That code didn't work. Please try again.",
                    );
                }
                setCode('');
                setTimeout(() => inputRef.current?.focus(), 50);
                return;
            }

            /* Cookies are set by the server. Flag the hub animation and go. */
            try { sessionStorage.setItem('mfa_verified', 'true'); } catch (_e) { /* private mode */ }
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
        try { await supabase.auth.signOut(); } catch (_e) { /* sign out anyway */ }
        router.replace('/auth/login');
    };

    if (checkingSession) {
        return (
            <div style={bgStyle}>
                <div style={cardStyle}>
                    <p style={{ color: '#cbd5e1', textAlign: 'center' }}>Loading…</p>
                </div>
            </div>
        );
    }

    const destination = phoneHint ? `your phone ending ${String(phoneHint).slice(-4)}` : 'your phone';
    const canSubmit = !isLoading && !isSending && code.trim().length > 0;

    return (
        <>
            <Head>
                <title>Verify with a text code · Smarter.Poker</title>
                <meta name="robots" content="noindex,nofollow" />
            </Head>
            <div style={bgStyle}>
                <div style={cardStyle}>
                    <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                        <div style={lockBadgeStyle}>💬</div>
                        <h1 style={titleStyle}>
                            {isStepUp ? 'Confirm it’s you' : 'Check your text messages'}
                        </h1>
                        <p style={subtitleStyle}>
                            {useBackup
                                ? 'Enter one of your backup codes.'
                                : isSending
                                    ? 'Sending your code…'
                                    : sendFailed
                                        ? 'We could not send your code.'
                                        : (
                                            <>
                                                We texted a {expectedLen ? `${expectedLen}-digit ` : ''}code to{' '}
                                                <strong style={{ color: '#e2e8f0' }}>{destination}</strong>.
                                            </>
                                        )}
                        </p>
                    </div>

                    {notEnrolled && (
                        <div style={warnStyle}>
                            <strong style={{ display: 'block', marginBottom: 4, color: '#fcd34d' }}>
                                Two-factor is not turned on for this account
                            </strong>
                            There is no code to send you. Head back and carry on — you can turn on
                            text-message two-factor any time under Settings → Security.
                            <div style={{ marginTop: 10 }}>
                                <button
                                    type="button"
                                    onClick={() => router.replace(getNextUrl())}
                                    style={{ ...linkBtnStyle, color: '#fcd34d' }}
                                >
                                    Continue
                                </button>
                            </div>
                        </div>
                    )}

                    {needsPhone && (
                        <div style={warnStyle}>
                            <strong style={{ display: 'block', marginBottom: 4, color: '#fcd34d' }}>
                                No verified mobile number on file
                            </strong>
                            Add and verify a phone number in Settings → Account, then sign in again.
                            If you cannot get to Settings, use a backup code below.
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <label style={labelStyle} htmlFor="mfa-code">
                            {useBackup ? 'Backup code' : 'Texted code'}
                        </label>
                        <input
                            id="mfa-code"
                            ref={inputRef}
                            type="text"
                            inputMode={useBackup ? 'text' : 'numeric'}
                            autoComplete="one-time-code"
                            maxLength={useBackup ? 12 : (expectedLen || 8)}
                            placeholder={useBackup ? 'A1B2C3D4' : (expectedLen === 4 ? '1234' : '123456')}
                            value={code}
                            onChange={(e) => {
                                const raw = e.target.value;
                                setCode(useBackup ? raw : raw.replace(/\D/g, ''));
                            }}
                            disabled={isLoading || isSending}
                            style={inputStyle}
                            aria-label={useBackup ? 'Backup code' : 'Verification code sent by text message'}
                        />

                        {error && (
                            <div style={errorStyle} role="alert">
                                {error}
                            </div>
                        )}
                        {!error && notice && (
                            <div style={noticeStyle} role="status">
                                {notice}
                            </div>
                        )}

                        {!useBackup && (
                            <div style={resendRowStyle}>
                                <span style={{ color: '#64748b' }}>Didn&apos;t get it?</span>
                                <button
                                    type="button"
                                    onClick={handleResend}
                                    disabled={cooldown > 0 || isSending || isLoading}
                                    style={{
                                        ...linkBtnStyle,
                                        color: cooldown > 0 || isSending ? '#64748b' : '#60a5fa',
                                        cursor: cooldown > 0 || isSending ? 'not-allowed' : 'pointer',
                                        textDecoration: cooldown > 0 || isSending ? 'none' : 'underline',
                                    }}
                                >
                                    {isSending
                                        ? 'Sending…'
                                        : cooldown > 0
                                            ? `Resend code in ${cooldown}s`
                                            : 'Resend code'}
                                </button>
                            </div>
                        )}

                        <div style={rememberBoxStyle}>
                            <label style={{ display: 'flex', alignItems: 'flex-start', cursor: 'pointer', color: '#cbd5e1', fontSize: '0.85rem' }}>
                                <input
                                    type="checkbox"
                                    checked={rememberDevice}
                                    onChange={(e) => setRememberDevice(e.target.checked)}
                                    disabled={isLoading}
                                    style={{ marginRight: '0.6rem', marginTop: '0.15rem', cursor: 'pointer' }}
                                />
                                <span>
                                    <strong style={{ color: '#e2e8f0' }}>Remember this device for 30 days</strong>
                                    <span style={{ display: 'block', color: '#94a3b8', fontSize: '0.78rem', marginTop: 2 }}>
                                        {rememberDevice
                                            ? 'We will not ask you for another code on this device for 30 days — not at sign-in, and not for admin, cashout or account actions.'
                                            : 'You will be asked for a new code the next time anything needs confirming.'}
                                    </span>
                                </span>
                            </label>
                        </div>

                        <button
                            type="submit"
                            disabled={!canSubmit}
                            style={{
                                ...primaryBtnStyle,
                                opacity: canSubmit ? 1 : 0.55,
                                cursor: canSubmit ? 'pointer' : 'not-allowed',
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
                                setNotice(null);
                                setCode('');
                                setUseBackup((v) => !v);
                                setTimeout(() => inputRef.current?.focus(), 50);
                            }}
                            style={linkBtnStyle}
                            disabled={isLoading}
                        >
                            {useBackup ? 'Use the code we texted you' : 'Use a backup code instead'}
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
                        No longer have that phone number or your backup codes?{' '}
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
    lineHeight: 1.5,
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

const noticeStyle = {
    marginTop: '0.75rem',
    padding: '0.65rem 0.85rem',
    background: 'rgba(34, 197, 94, 0.12)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '0.5rem',
    color: '#86efac',
    fontSize: '0.85rem',
};

const warnStyle = {
    marginBottom: '1rem',
    padding: '0.75rem 0.9rem',
    background: 'rgba(245, 158, 11, 0.12)',
    border: '1px solid rgba(245, 158, 11, 0.35)',
    borderRadius: '0.5rem',
    color: '#fde68a',
    fontSize: '0.82rem',
    lineHeight: 1.5,
};

const resendRowStyle = {
    marginTop: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.35rem',
    fontSize: '0.82rem',
};

const rememberBoxStyle = {
    marginTop: '1rem',
    padding: '0.75rem 0.85rem',
    background: 'rgba(59, 130, 246, 0.08)',
    border: '1px solid rgba(59, 130, 246, 0.25)',
    borderRadius: '0.5rem',
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
