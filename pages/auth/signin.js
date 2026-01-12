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

            // Redirect to hub on success
            router.push('/hub');
        } catch (err) {
            console.error('Sign in error:', err);
            setError(err.message || 'Invalid email or password');
        } finally {
            setLoading(false);
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
                        <span>or</span>
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
        justifyContent: 'center',
        margin: '24px 0',
        color: 'rgba(255, 255, 255, 0.3)',
        fontSize: '12px',
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
