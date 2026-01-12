/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — SIGN IN ACCESS NODE
   Phone OTP Verification via Supabase + Twilio
   Orange Ball Accent | Deep Black Background
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
    const [step, setStep] = useState('phone'); // 'phone' | 'otp'
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
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

    // Format phone number
    const formatPhone = (value) => {
        const cleaned = value.replace(/\D/g, '');
        if (cleaned.length <= 3) return cleaned;
        if (cleaned.length <= 6) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
        return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
    };

    // Handle phone submission
    const handlePhoneSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const cleanPhone = '+1' + phone.replace(/\D/g, '');

        try {
            const { error } = await supabase.auth.signInWithOtp({
                phone: cleanPhone,
            });

            if (error) throw error;

            setStep('otp');
        } catch (err) {
            setError(err.message || 'Failed to send verification code');
        } finally {
            setLoading(false);
        }
    };

    // Handle OTP verification
    const handleOtpSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const cleanPhone = '+1' + phone.replace(/\D/g, '');

        try {
            const { data, error } = await supabase.auth.verifyOtp({
                phone: cleanPhone,
                token: otp,
                type: 'sms',
            });

            if (error) throw error;

            // Redirect to hub on success
            router.push('/hub');
        } catch (err) {
            setError(err.message || 'Invalid verification code');
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
                    boxShadow: `0 0 60px rgba(255, 140, 0, ${0.1 + glowPulse * 0.1})`,
                }}>
                    <div style={styles.logoSection}>
                        <OrangeBall size={48} />
                        <h1 style={styles.title}>Welcome Back</h1>
                        <p style={styles.subtitle}>
                            {step === 'phone'
                                ? 'Enter your phone number to sign in'
                                : 'Enter the verification code we sent you'
                            }
                        </p>
                    </div>

                    {error && (
                        <div style={styles.errorBox}>
                            {error}
                        </div>
                    )}

                    {step === 'phone' ? (
                        <form onSubmit={handlePhoneSubmit} style={styles.form}>
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Phone Number</label>
                                <div style={styles.phoneInput}>
                                    <span style={styles.phonePrefix}>+1</span>
                                    <input
                                        type="tel"
                                        value={formatPhone(phone)}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="(555) 123-4567"
                                        style={styles.input}
                                        maxLength={14}
                                        required
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                style={{
                                    ...styles.submitButton,
                                    opacity: loading ? 0.7 : 1,
                                }}
                                disabled={loading}
                            >
                                {loading ? 'Sending...' : 'Send Verification Code'}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleOtpSubmit} style={styles.form}>
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Verification Code</label>
                                <input
                                    type="text"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="123456"
                                    style={{ ...styles.input, textAlign: 'center', letterSpacing: '8px', fontSize: '24px' }}
                                    maxLength={6}
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
                                {loading ? 'Verifying...' : 'Verify & Sign In'}
                            </button>

                            <button
                                type="button"
                                onClick={() => setStep('phone')}
                                style={styles.secondaryButton}
                            >
                                Use Different Number
                            </button>
                        </form>
                    )}

                    <div style={styles.divider}>
                        <span>or</span>
                    </div>

                    <button
                        onClick={() => router.push('/auth/signup')}
                        style={styles.signupLink}
                    >
                        Don't have an account? <span style={styles.orangeText}>Sign Up</span>
                    </button>
                </div>
            </div>
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🟠 ORANGE BALL
// ─────────────────────────────────────────────────────────────────────────────
function OrangeBall({ size = 24 }) {
    return (
        <div style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 30% 30%, #ffa500, #ff6600)',
            boxShadow: `0 0 ${size / 2}px rgba(255, 140, 0, 0.6)`,
            flexShrink: 0,
        }} />
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎨 STYLES
// ─────────────────────────────────────────────────────────────────────────────
const styles = {
    container: {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0f',
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
            linear-gradient(rgba(255, 140, 0, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 140, 0, 0.03) 1px, transparent 1px)
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
        background: 'radial-gradient(ellipse at center, rgba(255, 140, 0, 0.2), transparent 60%)',
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
        background: 'rgba(255, 140, 0, 0.1)',
        border: '1px solid rgba(255, 140, 0, 0.3)',
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
        background: 'linear-gradient(180deg, rgba(20, 20, 30, 0.95), rgba(10, 10, 20, 0.98))',
        borderRadius: '24px',
        border: '1px solid rgba(255, 140, 0, 0.2)',
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
    phoneInput: {
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(0, 0, 0, 0.3)',
        border: '2px solid rgba(255, 140, 0, 0.3)',
        borderRadius: '12px',
        overflow: 'hidden',
    },
    phonePrefix: {
        padding: '16px',
        background: 'rgba(255, 140, 0, 0.1)',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        fontWeight: 600,
        color: '#ff8c00',
    },
    input: {
        flex: 1,
        padding: '16px',
        background: 'transparent',
        border: 'none',
        outline: 'none',
        fontFamily: 'Inter, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
    },
    submitButton: {
        padding: '16px',
        background: 'linear-gradient(135deg, #ff8c00, #ff6600)',
        border: 'none',
        borderRadius: '12px',
        color: '#000000',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 0.3s ease',
    },
    secondaryButton: {
        padding: '12px',
        background: 'transparent',
        border: 'none',
        color: 'rgba(255, 255, 255, 0.5)',
        fontFamily: 'Inter, sans-serif',
        fontSize: '13px',
        cursor: 'pointer',
        transition: 'color 0.3s ease',
    },
    divider: {
        display: 'flex',
        alignItems: 'center',
        margin: '24px 0',
        color: 'rgba(255, 255, 255, 0.3)',
        fontSize: '12px',
    },
    signupLink: {
        width: '100%',
        padding: '12px',
        background: 'transparent',
        border: '1px solid rgba(255, 140, 0, 0.2)',
        borderRadius: '12px',
        color: 'rgba(255, 255, 255, 0.6)',
        fontFamily: 'Inter, sans-serif',
        fontSize: '14px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
    },
    orangeText: {
        color: '#ff8c00',
        fontWeight: 600,
    },
};
