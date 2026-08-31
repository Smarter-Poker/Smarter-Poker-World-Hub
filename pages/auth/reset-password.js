/* ═══════════════════════════════════════════════════════════════════════════
   RESET PASSWORD — /auth/reset-password
   ─────────────────────────────────────────────────────────────────────────
   Restored 2026-05-02. Lands here after the password-recovery email link is
   verified by /auth/callback (type=recovery → exchangeCodeForSession or
   verifyOtp). At this point the user has an active session whose only valid
   action is auth.updateUser({ password }).

   Flow:
     1. /auth/forgot-password (user enters email)
     2. Supabase sends email → link points to /auth/callback
     3. /auth/callback verifies the recovery code/token and forwards here
     4. We confirm the session is active and let the user pick a new password
     5. updateUser → redirect to /hub

   Hardening:
     - Reuses validatePassword from src/lib/passwordStrength (HIBP + entropy).
     - If no session exists, we send the user back to /auth/forgot-password
       (the recovery link is single-use and expired or never landed correctly).
     - File is in PROTECTED_FILES + SENSITIVE_PATHS in deploy-autofix.js, and
       in the auth-routes-exist.test.mjs guard.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { supabase } from '../../src/lib/supabase';
import { getAuthUser } from '../../src/lib/authUtils';
import { validatePassword } from '../../src/lib/passwordStrength';

export default function ResetPasswordPage() {
    const router = useRouter();
    const [phase, setPhase] = useState('checking'); // checking | ready | success | invalid
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const ranRef = useRef(false);

    useEffect(() => {
        if (ranRef.current) return;
        ranRef.current = true;

        (async () => {
            try {
                if (!getAuthUser()?.id) {
                    setPhase('invalid');
                    return;
                }
                setPhase('ready');
            } catch (e) {
                console.warn('[reset-password] session check failed:', e);
                setPhase('invalid');
            }
        })();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        const pwCheck = await validatePassword(password);
        if (!pwCheck.ok) {
            setError(pwCheck.reason || 'Password does not meet our security requirements.');
            return;
        }

        setLoading(true);

        try {
            const { error: updErr } = await supabase.auth.updateUser({ password });
            if (updErr) throw updErr;
            setPhase('success');
            setTimeout(() => router.replace('/hub'), 1500);
        } catch (err) {
            console.warn('[reset-password] updateUser error:', err);
            setError(err?.message || 'Failed to update password. Please try the reset link again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <SEOHead
                title="Set New Password - Smarter.Poker"
                description="Set a new password for your Smarter.Poker account."
                canonical="/auth/reset-password"
                noindex={true}
            />

            <div style={styles.container}>
                <div style={styles.card}>
                    <div style={styles.brandLogo}>
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2">
                            <path d="M12 2a4 4 0 014 4c0 1.5-.8 2.8-2 3.5V12h2a4 4 0 110 8h-8a4 4 0 110-8h2V9.5A4 4 0 018 6a4 4 0 014-4z" />
                        </svg>
                    </div>

                    {phase === 'checking' && (
                        <>
                            <h1 style={styles.title}>Verifying…</h1>
                            <p style={styles.subtitle}>Checking your reset link.</p>
                        </>
                    )}

                    {phase === 'invalid' && (
                        <>
                            <h1 style={{ ...styles.title, color: '#ff6b6b' }}>Link Expired</h1>
                            <p style={styles.subtitle}>
                                Your password-reset link has expired or was already used.
                                Request a new one to continue.
                            </p>
                            <button
                                type="button"
                                onClick={() => router.replace('/auth/forgot-password')}
                                style={styles.button}
                            >
                                Request a new reset link
                            </button>
                            <button
                                type="button"
                                onClick={() => router.push('/auth/login')}
                                style={styles.linkButton}
                            >
                                ← Back to sign in
                            </button>
                        </>
                    )}

                    {phase === 'ready' && (
                        <>
                            <h1 style={styles.title}>Set New Password</h1>
                            <p style={styles.subtitle}>
                                Pick a strong password you don&apos;t use anywhere else.
                            </p>

                            <form onSubmit={handleSubmit} style={styles.form}>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="New password"
                                    required
                                    autoComplete="new-password"
                                    autoFocus
                                    minLength={8}
                                    style={styles.input}
                                    disabled={loading}
                                />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm new password"
                                    required
                                    autoComplete="new-password"
                                    minLength={8}
                                    style={styles.input}
                                    disabled={loading}
                                />

                                <label style={styles.showToggle}>
                                    <input
                                        type="checkbox"
                                        checked={showPassword}
                                        onChange={(e) => setShowPassword(e.target.checked)}
                                    />
                                    <span style={{ marginLeft: 8 }}>Show passwords</span>
                                </label>

                                {error && <div style={styles.error}>{error}</div>}

                                <button type="submit" disabled={loading} style={styles.button}>
                                    {loading ? 'Updating…' : 'Update Password'}
                                </button>
                            </form>
                        </>
                    )}

                    {phase === 'success' && (
                        <>
                            <h1 style={{ ...styles.title, color: '#10d97e' }}>Password Updated</h1>
                            <p style={styles.subtitle}>Redirecting you to the hub…</p>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

const styles = {
    container: {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #0a1628 0%, #0d1f35 100%)',
        padding: '24px',
        fontFamily: 'Inter, -apple-system, sans-serif',
    },
    card: {
        width: '100%',
        maxWidth: 420,
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(0, 212, 255, 0.2)',
        borderRadius: 16,
        padding: '40px 32px',
        textAlign: 'center',
        boxShadow: '0 0 60px rgba(0, 212, 255, 0.1)',
    },
    brandLogo: {
        width: 64,
        height: 64,
        margin: '0 auto 24px',
        borderRadius: 12,
        background: 'linear-gradient(135deg, #0a1628, #1a2a4a)',
        border: '2px solid #00D4FF',
        boxShadow: '0 0 40px rgba(0, 212, 255, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 24,
        fontWeight: 600,
        color: '#00D4FF',
        margin: '0 0 12px',
    },
    subtitle: {
        color: '#cbd5e1',
        fontSize: 15,
        lineHeight: 1.5,
        margin: '0 0 24px',
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        marginBottom: 16,
    },
    input: {
        width: '100%',
        padding: '12px 16px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 8,
        color: '#ffffff',
        fontSize: 16,
        outline: 'none',
        boxSizing: 'border-box',
    },
    button: {
        width: '100%',
        padding: '14px',
        background: 'linear-gradient(135deg, #00D4FF, #0099cc)',
        color: '#0a1628',
        border: 'none',
        borderRadius: 8,
        fontSize: 16,
        fontWeight: 700,
        cursor: 'pointer',
        marginTop: 8,
    },
    linkButton: {
        marginTop: 16,
        background: 'none',
        border: 'none',
        color: '#00D4FF',
        fontSize: 14,
        cursor: 'pointer',
        textDecoration: 'underline',
    },
    showToggle: {
        color: '#94a3b8',
        fontSize: 13,
        textAlign: 'left',
        cursor: 'pointer',
        userSelect: 'none',
    },
    error: {
        color: '#ff6b6b',
        fontSize: 14,
        padding: '8px 12px',
        background: 'rgba(255, 107, 107, 0.1)',
        borderRadius: 6,
        textAlign: 'left',
    },
};
