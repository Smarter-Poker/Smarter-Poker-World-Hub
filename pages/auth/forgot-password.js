/* ═══════════════════════════════════════════════════════════════════════════
   FORGOT PASSWORD — /auth/forgot-password
   ─────────────────────────────────────────────────────────────────────────
   Restored 2026-05-02 alongside the auth-flow hardening. The "Forgot password?"
   button on /auth/login routes here. This page sends a Supabase password-reset
   email; the link in that email points back at /auth/callback?type=recovery,
   which then forwards the authenticated user to /auth/reset-password.

   This file is in the auth-critical set:
     - PROTECTED_FILES in pages/api/deploy-autofix.js
     - SENSITIVE_PATHS in pages/api/deploy-autofix.js
     - __tests__/auth-routes-exist.test.mjs (existence asserted at build time)
     - next.config.js boot-time guard
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { supabase } from '../../src/lib/supabase';

export default function ForgotPasswordPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [sent, setSent] = useState(false);

    const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        const safeEmail = email.trim().toLowerCase();
        if (!isValidEmail(safeEmail)) {
            setError('Please enter a valid email address.');
            return;
        }

        setLoading(true);

        try {
            const { error: resetErr } = await supabase.auth.resetPasswordForEmail(safeEmail, {
                // The email link points here. /auth/callback handles the OTP /
                // PKCE exchange and forwards to /auth/reset-password.
                // [2026-07-25] ?next= added: without it, the routing to
                // /auth/reset-password depends ENTIRELY on the email template
                // using {{ .TokenHash }}&type=recovery. If the template
                // uses/reverts to the default {{ .ConfirmationURL }}, the
                // callback receives only ?code=, the recovery branch never
                // runs, and the user lands logged-in on /hub without ever
                // seeing the new-password form. callback.js honours
                // same-origin ?next= for both link formats.
                redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/auth/reset-password')}`,
            });

            // ── Account-enumeration defense ─────────────────────────────────
            // Show the confirmation screen regardless of whether the email
            // exists in our system. An attacker probing for valid accounts
            // sees the same UX either way. This mirrors the same pattern
            // signup.js uses for "User already registered" responses.
            if (resetErr) {
                console.warn('[forgot-password] resetPasswordForEmail error (showing generic confirmation):', resetErr);
            }
            setSent(true);
        } catch (err) {
            console.warn('[forgot-password] unexpected error:', err);
            // Same enumeration-defense rationale: never tell the user whether
            // the address was valid. Just show the confirmation.
            setSent(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <SEOHead
                title="Reset Password — Smarter.Poker"
                description="Reset your Smarter.Poker password."
                canonical="/auth/forgot-password"
                noindex={true}
            />

            <div style={styles.container}>
                <div style={styles.card}>
                    <div style={styles.brandLogo}>
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2">
                            <path d="M12 2a4 4 0 014 4c0 1.5-.8 2.8-2 3.5V12h2a4 4 0 110 8h-8a4 4 0 110-8h2V9.5A4 4 0 018 6a4 4 0 014-4z" />
                        </svg>
                    </div>

                    <h1 style={styles.title}>Reset Password</h1>

                    {!sent ? (
                        <>
                            <p style={styles.subtitle}>
                                Enter your email and we&apos;ll send you a secure link to reset your password.
                            </p>

                            <form onSubmit={handleSubmit} style={styles.form}>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    required
                                    autoComplete="email"
                                    autoFocus
                                    style={styles.input}
                                    disabled={loading}
                                />

                                {error && <div style={styles.error}>{error}</div>}

                                <button type="submit" disabled={loading} style={styles.button}>
                                    {loading ? 'Sending…' : 'Send Reset Link'}
                                </button>
                            </form>
                        </>
                    ) : (
                        <>
                            <p style={styles.subtitle}>
                                If an account exists for that email, a reset link is on its way.
                                Check your inbox (and the spam folder, just in case).
                            </p>
                            <p style={{ ...styles.subtitle, fontSize: 14, opacity: 0.7 }}>
                                The link expires in 1 hour.
                            </p>
                        </>
                    )}

                    <button
                        type="button"
                        onClick={() => router.push('/auth/login')}
                        style={styles.linkButton}
                    >
                        ← Back to sign in
                    </button>
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
    error: {
        color: '#ff6b6b',
        fontSize: 14,
        padding: '8px 12px',
        background: 'rgba(255, 107, 107, 0.1)',
        borderRadius: 6,
        textAlign: 'left',
    },
};
