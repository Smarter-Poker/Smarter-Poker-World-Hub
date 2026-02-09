/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — SIGN IN ACCESS NODE
   Email/Password Authentication (Simplified for testing)
   Cyan/Electric Blue Aesthetic | Deep Navy Background
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../../src/lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// 🔐 SIGN IN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function SignInPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [glowPulse, setGlowPulse] = useState(0);
    const [oauthLoading, setOauthLoading] = useState('');

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

    // Handle sign in
    const handleSignIn = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) throw error;

            // Redirect to hub on success - set flag so intro plays
            sessionStorage.setItem('just_authenticated', 'true');
            router.push('/hub');
        } catch (err) {
            console.error('Sign in error:', err);
            setError(err.message || 'Invalid email or password');
        } finally {
            setLoading(false);
        }
    };

    // Handle OAuth sign in (Google, Apple, Facebook)
    const handleOAuthSignIn = async (provider) => {
        setError('');
        setOauthLoading(provider);
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                },
            });
            if (error) throw error;
        } catch (err) {
            console.error(`${provider} sign in error:`, err);
            setError(err.message || `Failed to sign in with ${provider}`);
            setOauthLoading('');
        }
    };

    return (
        <>
            <Head>
                <title>Sign In — Smarter.Poker</title>
                <meta name="description" content="Sign in to your Smarter.Poker account" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            </Head>

            <div style={styles.container}>
                {/* Background */}
                <div style={styles.bgGrid} />
                <div style={{
                    ...styles.bgGlow,
                    opacity: 0.2 + glowPulse * 0.15,
                }} />

                {/* Back to Home */}
                <button onClick={() => router.push('/')} style={styles.backButton}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    <span>Back</span>
                </button>

                {/* Auth Card */}
                <div style={{
                    ...styles.authCard,
                    boxShadow: `0 0 60px rgba(0, 212, 255, ${0.1 + glowPulse * 0.1})`,
                }}>
                    <div style={styles.logoSection}>
                        <BrainIcon size={48} />
                        <h1 style={styles.title}>Welcome Back</h1>
                        <p style={styles.subtitle}>Sign in to continue your training</p>
                    </div>

                    {error && (
                        <div style={styles.errorBox}>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSignIn} style={styles.form}>
                        <div style={styles.inputGroup}>
                            <label style={styles.label}>Email Address</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                style={styles.inputSingle}
                                required
                            />
                        </div>

                        <div style={styles.inputGroup}>
                            <label style={styles.label}>Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                style={styles.inputSingle}
                                required
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
                            {loading ? 'Signing In...' : 'Sign In'}
                        </button>
                    </form>

                    <div style={styles.divider}>
                        <div style={styles.dividerLine} />
                        <span style={styles.dividerText}>or continue with</span>
                        <div style={styles.dividerLine} />
                    </div>

                    {/* Social Sign-In Buttons */}
                    <div style={styles.socialButtons}>
                        <button
                            onClick={() => handleOAuthSignIn('google')}
                            disabled={!!oauthLoading}
                            style={{
                                ...styles.socialButton,
                                ...styles.googleButton,
                                opacity: oauthLoading && oauthLoading !== 'google' ? 0.5 : 1,
                            }}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            <span>{oauthLoading === 'google' ? 'Connecting...' : 'Continue with Google'}</span>
                        </button>

                        <button
                            onClick={() => handleOAuthSignIn('apple')}
                            disabled={!!oauthLoading}
                            style={{
                                ...styles.socialButton,
                                ...styles.appleButton,
                                opacity: oauthLoading && oauthLoading !== 'apple' ? 0.5 : 1,
                            }}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff">
                                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                            </svg>
                            <span>{oauthLoading === 'apple' ? 'Connecting...' : 'Continue with Apple'}</span>
                        </button>

                        <button
                            onClick={() => handleOAuthSignIn('facebook')}
                            disabled={!!oauthLoading}
                            style={{
                                ...styles.socialButton,
                                ...styles.facebookButton,
                                opacity: oauthLoading && oauthLoading !== 'facebook' ? 0.5 : 1,
                            }}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff">
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                            </svg>
                            <span>{oauthLoading === 'facebook' ? 'Connecting...' : 'Continue with Facebook'}</span>
                        </button>
                    </div>

                    <button
                        onClick={() => router.push('/auth/signup')}
                        style={styles.signupLink}
                    >
                        Don't have an account? <span style={styles.cyanText}>Sign Up</span>
                    </button>
                </div>
            </div>
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧠 BRAIN ICON
// ─────────────────────────────────────────────────────────────────────────────
function BrainIcon({ size = 24 }) {
    return (
        <div style={{
            width: size,
            height: size,
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #0a1628, #1a2a4a)',
            border: '2px solid #00D4FF',
            boxShadow: `0 0 ${size / 2}px rgba(0, 212, 255, 0.6)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
        }}>
            <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2">
                <path d="M12 2a4 4 0 014 4c0 1.5-.8 2.8-2 3.5V12h2a4 4 0 110 8h-8a4 4 0 110-8h2V9.5A4 4 0 018 6a4 4 0 014-4z" />
            </svg>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎨 STYLES — CYAN/ELECTRIC BLUE THEME
// ─────────────────────────────────────────────────────────────────────────────
const styles = {
    container: {
        minHeight: '100vh',
        display: 'flex',
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
        maxWidth: '420px',
        padding: '40px',
        background: 'linear-gradient(180deg, rgba(10, 22, 40, 0.95), rgba(5, 15, 30, 0.98))',
        borderRadius: '24px',
        border: '1px solid rgba(0, 212, 255, 0.2)',
        backdropFilter: 'blur(20px)',
        position: 'relative',
        zIndex: 5,
    },
    logoSection: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginBottom: '32px',
    },
    title: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '28px',
        fontWeight: 700,
        marginTop: '16px',
        marginBottom: '8px',
        color: '#ffffff',
    },
    subtitle: {
        fontSize: '14px',
        color: 'rgba(255, 255, 255, 0.6)',
        textAlign: 'center',
    },
    errorBox: {
        padding: '12px 16px',
        background: 'rgba(255, 77, 77, 0.1)',
        border: '1px solid rgba(255, 77, 77, 0.3)',
        borderRadius: '8px',
        color: '#ff4d4d',
        fontSize: '13px',
        marginBottom: '20px',
        textAlign: 'center',
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
        padding: '16px',
        background: 'rgba(0, 0, 0, 0.3)',
        border: '2px solid rgba(0, 212, 255, 0.3)',
        borderRadius: '12px',
        fontFamily: 'Inter, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        outline: 'none',
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
    divider: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        margin: '24px 0',
    },
    dividerLine: {
        flex: 1,
        height: '1px',
        background: 'rgba(255, 255, 255, 0.1)',
    },
    dividerText: {
        color: 'rgba(255, 255, 255, 0.35)',
        fontSize: '12px',
        fontFamily: 'Inter, sans-serif',
        whiteSpace: 'nowrap',
    },
    socialButtons: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        marginBottom: '20px',
    },
    socialButton: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        width: '100%',
        padding: '14px',
        borderRadius: '12px',
        fontSize: '14px',
        fontFamily: 'Inter, sans-serif',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        border: 'none',
    },
    googleButton: {
        background: '#ffffff',
        color: '#333333',
    },
    appleButton: {
        background: '#000000',
        color: '#ffffff',
        border: '1px solid rgba(255, 255, 255, 0.15)',
    },
    facebookButton: {
        background: '#1877F2',
        color: '#ffffff',
    },
    signupLink: {
        width: '100%',
        padding: '12px',
        background: 'transparent',
        border: '1px solid rgba(0, 212, 255, 0.2)',
        borderRadius: '12px',
        color: 'rgba(255, 255, 255, 0.6)',
        fontFamily: 'Inter, sans-serif',
        fontSize: '14px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
    },
    cyanText: {
        color: '#00D4FF',
        fontWeight: 600,
    },
};
