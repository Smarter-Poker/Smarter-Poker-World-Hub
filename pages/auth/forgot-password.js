/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — FORGOT PASSWORD NODE
   Password Reset via Supabase Email
   Cyan/Electric Blue Aesthetic | Deep Navy Background
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../../src/lib/supabase';

export default function ForgotPasswordPage() {
    const router = useRouter();

    // Form state
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [glowPulse, setGlowPulse] = useState(0);

    // Animated glow effect
    useEffect(() => {
        let frame;
        const start = Date.now();
        const animate = () => {
            const elapsed = (Date.now() - start) / 1000;
            setGlowPulse((Math.sin(elapsed * 2) + 1) / 2);
            frame = requestAnimationFrame(animate);
        };
        animate();
        return () => cancelAnimationFrame(frame);
    }, []);

    // Validate email format
    const isValidEmail = (email) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    // Handle password reset request
    const handleResetRequest = async (e) => {
        e.preventDefault();
        setError('');

        if (!isValidEmail(email)) {
            setError('Please enter a valid email address');
            return;
        }

        setLoading(true);

        try {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/reset-password`,
            });

            if (resetError) throw resetError;

            setSuccess(true);
        } catch (err) {
            console.error('Password reset error:', err);
            setError(err.message || 'Failed to send reset email');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Head>
                <title>Reset Password — Smarter.Poker</title>
                <meta name="description" content="Reset your Smarter.Poker password" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            </Head>

            <div style={styles.container}>
                {/* Background */}
                <div style={styles.bgGrid} />
                <div style={{
                    ...styles.bgGlow,
                    opacity: 0.2 + glowPulse * 0.15,
                }} />

                {/* Back to Sign In */}
                <button onClick={() => router.push('/auth/signin')} style={styles.backButton}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    <span>Back to Sign In</span>
                </button>

                {/* Card */}
                <div style={{
                    ...styles.authCard,
                    boxShadow: `0 0 60px rgba(0, 212, 255, ${0.1 + glowPulse * 0.1})`,
                }}>
                    <div style={styles.logoSection}>
                        <div style={styles.lockIcon}>🔐</div>
                        <h1 style={styles.title}>
                            {success ? 'Check Your Email' : 'Reset Password'}
                        </h1>
                        <p style={styles.subtitle}>
                            {success
                                ? 'We sent you a password reset link'
                                : 'Enter your email to receive a reset link'
                            }
                        </p>
                    </div>

                    {error && (
                        <div style={styles.errorBox}>
                            {error}
                        </div>
                    )}

                    {success ? (
                        <div style={styles.successContainer}>
                            <div style={styles.successIcon}>📧</div>
                            <p style={styles.successText}>
                                We've sent a password reset link to:
                            </p>
                            <p style={styles.emailHighlight}>{email}</p>
                            <p style={styles.successHint}>
                                Check your inbox and spam folder. The link will expire in 1 hour.
                            </p>
                            <button
                                onClick={() => router.push('/auth/signin')}
                                style={styles.submitButton}
                            >
                                Return to Sign In
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleResetRequest} style={styles.form}>
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Email Address</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    style={styles.inputSingle}
                                    required
                                    autoFocus
                                />
                            </div>

                            <button
                                type="submit"
                                style={{
                                    ...styles.submitButton,
                                    opacity: loading ? 0.7 : 1,
                                }}
                                disabled={loading}
                            >
                                {loading ? 'Sending...' : 'Send Reset Link'}
                            </button>

                            <button
                                type="button"
                                onClick={() => router.push('/auth/signin')}
                                style={styles.cancelLink}
                            >
                                Cancel and return to Sign In
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎨 STYLES — CYAN/ELECTRIC BLUE THEME
// ─────────────────────────────────────────────────────────────────────────────
const styles = {
    container: {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a1628',
        fontFamily: 'Inter, -apple-system, sans-serif',
        position: 'relative',
        padding: '40px 20px',
    },
    bgGrid: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `
            linear-gradient(rgba(0, 212, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 212, 255, 0.03) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
    },
    bgGlow: {
        position: 'fixed',
        top: '50%',
        left: '50%',
        width: '100%',
        height: '100%',
        background: 'radial-gradient(ellipse at center, rgba(0, 212, 255, 0.2), transparent 60%)',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
    },
    backButton: {
        position: 'fixed',
        top: '24px',
        left: '24px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 16px',
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: '8px',
        color: '#ffffff',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        zIndex: 10,
    },
    authCard: {
        width: '100%',
        maxWidth: '440px',
        padding: '40px',
        background: 'linear-gradient(180deg, rgba(10, 22, 40, 0.95), rgba(5, 15, 30, 0.98))',
        borderRadius: '24px',
        border: '1px solid rgba(0, 212, 255, 0.2)',
        backdropFilter: 'blur(20px)',
        position: 'relative',
        zIndex: 5,
    },
    logoSection: {
        textAlign: 'center',
        marginBottom: '32px',
    },
    lockIcon: {
        fontSize: '48px',
        marginBottom: '16px',
    },
    title: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '24px',
        fontWeight: 700,
        color: '#ffffff',
        marginBottom: '8px',
    },
    subtitle: {
        fontFamily: 'Inter, sans-serif',
        fontSize: '14px',
        color: 'rgba(255, 255, 255, 0.6)',
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
    },
    inputGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
    },
    label: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '11px',
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'uppercase',
        letterSpacing: '1px',
    },
    inputSingle: {
        padding: '14px 16px',
        background: 'rgba(0, 0, 0, 0.3)',
        border: '2px solid rgba(0, 212, 255, 0.3)',
        borderRadius: '12px',
        fontFamily: 'Inter, sans-serif',
        fontSize: '15px',
        color: '#ffffff',
        outline: 'none',
        transition: 'border-color 0.3s ease',
    },
    errorBox: {
        padding: '14px 18px',
        background: 'rgba(255, 60, 60, 0.1)',
        border: '1px solid rgba(255, 60, 60, 0.3)',
        borderRadius: '12px',
        color: '#ff6b6b',
        fontSize: '14px',
        fontFamily: 'Inter, sans-serif',
        marginBottom: '20px',
        textAlign: 'center',
    },
    submitButton: {
        padding: '16px',
        background: 'linear-gradient(135deg, #00D4FF, #0066FF)',
        border: 'none',
        borderRadius: '12px',
        color: '#000000',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 0.3s ease',
    },
    cancelLink: {
        background: 'none',
        border: 'none',
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: '13px',
        fontFamily: 'Inter, sans-serif',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'color 0.2s ease',
    },
    successContainer: {
        textAlign: 'center',
    },
    successIcon: {
        fontSize: '48px',
        marginBottom: '16px',
    },
    successText: {
        fontFamily: 'Inter, sans-serif',
        fontSize: '14px',
        color: 'rgba(255, 255, 255, 0.7)',
        marginBottom: '8px',
    },
    emailHighlight: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '16px',
        fontWeight: 600,
        color: '#00D4FF',
        marginBottom: '16px',
    },
    successHint: {
        fontFamily: 'Inter, sans-serif',
        fontSize: '13px',
        color: 'rgba(255, 255, 255, 0.5)',
        marginBottom: '24px',
    },
};
