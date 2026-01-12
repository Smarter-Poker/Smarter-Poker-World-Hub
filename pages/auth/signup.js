/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — SIGN UP REGISTRATION NODE
   Phone OTP Verification + Profile Initialization (XP=0, Multiplier=1x)
   Orange Ball Accent | Deep Black Background
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../../src/lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// 📝 SIGN UP PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function SignUpPage() {
    const router = useRouter();
    const [step, setStep] = useState('info'); // 'info' | 'otp'
    const [formData, setFormData] = useState({
        username: '',
        phone: '',
    });
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

    // Handle info submission
    const handleInfoSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const cleanPhone = '+1' + formData.phone.replace(/\D/g, '');

        try {
            // Send OTP
            const { error } = await supabase.auth.signInWithOtp({
                phone: cleanPhone,
                options: {
                    data: {
                        username: formData.username,
                    },
                },
            });

            if (error) throw error;

            setStep('otp');
        } catch (err) {
            setError(err.message || 'Failed to send verification code');
        } finally {
            setLoading(false);
        }
    };

    // Handle OTP verification + profile creation
    const handleOtpSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const cleanPhone = '+1' + formData.phone.replace(/\D/g, '');

        try {
            // Verify OTP
            const { data, error: verifyError } = await supabase.auth.verifyOtp({
                phone: cleanPhone,
                token: otp,
                type: 'sms',
            });

            if (verifyError) throw verifyError;

            // Initialize user profile in 'profiles' table
            if (data.user) {
                const { error: profileError } = await supabase
                    .from('profiles')
                    .upsert({
                        id: data.user.id,
                        username: formData.username,
                        phone: cleanPhone,
                        xp_total: 0,
                        diamonds: 0,
                        diamond_multiplier: 1.0,
                        streak_days: 0,
                        skill_tier: 'Newcomer',
                        created_at: new Date().toISOString(),
                        last_login: new Date().toISOString(),
                    }, {
                        onConflict: 'id',
                    });

                if (profileError) {
                    console.error('Profile creation error:', profileError);
                    // Don't block login on profile error
                }
            }

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
                <title>Sign Up — Smarter.Poker</title>
                <meta name="description" content="Create your Smarter.Poker account and start your GTO training journey" />
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
                        <h1 style={styles.title}>Create Account</h1>
                        <p style={styles.subtitle}>
                            {step === 'info'
                                ? 'Start your GTO training journey'
                                : 'Enter the verification code we sent you'
                            }
                        </p>
                    </div>

                    {/* Bonus Preview */}
                    {step === 'info' && (
                        <div style={styles.bonusBox}>
                            <span style={styles.bonusIcon}>🎁</span>
                            <div>
                                <span style={styles.bonusTitle}>Welcome Bonus</span>
                                <span style={styles.bonusDesc}>500 XP + 100 💎 Diamonds on signup</span>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div style={styles.errorBox}>
                            {error}
                        </div>
                    )}

                    {step === 'info' ? (
                        <form onSubmit={handleInfoSubmit} style={styles.form}>
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Username</label>
                                <input
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    placeholder="Your poker alias"
                                    style={styles.inputSingle}
                                    minLength={3}
                                    maxLength={20}
                                    required
                                />
                            </div>

                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Phone Number</label>
                                <div style={styles.phoneInput}>
                                    <span style={styles.phonePrefix}>+1</span>
                                    <input
                                        type="tel"
                                        value={formatPhone(formData.phone)}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
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
                                {loading ? 'Sending...' : 'Create Account'}
                            </button>

                            <p style={styles.terms}>
                                By signing up, you agree to our Terms of Service and Privacy Policy
                            </p>
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
                                    style={{ ...styles.inputSingle, textAlign: 'center', letterSpacing: '8px', fontSize: '24px' }}
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
                                {loading ? 'Creating Account...' : 'Verify & Continue'}
                            </button>

                            <button
                                type="button"
                                onClick={() => setStep('info')}
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
                        onClick={() => router.push('/auth/signin')}
                        style={styles.signupLink}
                    >
                        Already have an account? <span style={styles.orangeText}>Sign In</span>
                    </button>
                </div>

                {/* Initial Stats Preview */}
                {step === 'info' && (
                    <div style={styles.statsPreview}>
                        <StatBox icon="⚡" value="0 XP" label="Starting XP" />
                        <StatBox icon="💎" value="1x" label="Multiplier" />
                        <StatBox icon="🔥" value="0" label="Streak" />
                    </div>
                )}
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
// 📊 STAT BOX
// ─────────────────────────────────────────────────────────────────────────────
function StatBox({ icon, value, label }) {
    return (
        <div style={styles.statBox}>
            <span style={styles.statIcon}>{icon}</span>
            <span style={styles.statValue}>{value}</span>
            <span style={styles.statLabel}>{label}</span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎨 STYLES
// ─────────────────────────────────────────────────────────────────────────────
const styles = {
    container: {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
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
        marginBottom: '24px',
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
    bonusBox: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 16px',
        background: 'rgba(255, 140, 0, 0.1)',
        border: '1px solid rgba(255, 140, 0, 0.3)',
        borderRadius: '12px',
        marginBottom: '20px',
    },
    bonusIcon: {
        fontSize: '28px',
    },
    bonusTitle: {
        display: 'block',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '12px',
        fontWeight: 600,
        color: '#ff8c00',
    },
    bonusDesc: {
        display: 'block',
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.7)',
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
        gap: '16px',
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
        border: '2px solid rgba(255, 140, 0, 0.3)',
        borderRadius: '12px',
        fontFamily: 'Inter, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        outline: 'none',
        transition: 'border-color 0.3s ease',
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
        marginTop: '8px',
    },
    terms: {
        fontSize: '11px',
        color: 'rgba(255, 255, 255, 0.4)',
        textAlign: 'center',
        marginTop: '8px',
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
        justifyContent: 'center',
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
    statsPreview: {
        display: 'flex',
        gap: '16px',
        marginTop: '32px',
        position: 'relative',
        zIndex: 5,
    },
    statBox: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        padding: '16px 24px',
        background: 'rgba(20, 20, 30, 0.6)',
        border: '1px solid rgba(255, 140, 0, 0.2)',
        borderRadius: '12px',
        backdropFilter: 'blur(10px)',
    },
    statIcon: {
        fontSize: '20px',
    },
    statValue: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '18px',
        fontWeight: 700,
        color: '#ff8c00',
    },
    statLabel: {
        fontSize: '10px',
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'uppercase',
        letterSpacing: '1px',
    },
};
