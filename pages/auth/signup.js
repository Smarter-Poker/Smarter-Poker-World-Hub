/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — SIGN UP REGISTRATION NODE
   Multi-Step Registration: Info → Email OTP → Phone OTP → Profile Creation
   Dual Verification (Email + Phone) Required
   Orange Ball Accent | Deep Black Background
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../../src/lib/supabase';

// US States for dropdown
const US_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

// ─────────────────────────────────────────────────────────────────────────────
// 📝 SIGN UP PAGE — MULTI-STEP FLOW
// ─────────────────────────────────────────────────────────────────────────────
export default function SignUpPage() {
    const router = useRouter();

    // Step: 'info' → 'email-verify' → 'phone-verify' → 'complete'
    const [step, setStep] = useState('info');

    // Form data
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        city: '',
        state: '',
        pokerAlias: '',
        phone: '',
    });

    // Verification codes
    const [emailOtp, setEmailOtp] = useState('');
    const [phoneOtp, setPhoneOtp] = useState('');

    // UI state
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [aliasError, setAliasError] = useState('');
    const [aliasChecking, setAliasChecking] = useState(false);
    const [aliasAvailable, setAliasAvailable] = useState(null);
    const [glowPulse, setGlowPulse] = useState(0);
    const [emailVerified, setEmailVerified] = useState(false);

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

    // Check alias availability with debounce
    useEffect(() => {
        if (formData.pokerAlias.length < 3) {
            setAliasAvailable(null);
            setAliasError('');
            return;
        }

        const timeout = setTimeout(async () => {
            setAliasChecking(true);
            setAliasError('');

            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('username')
                    .ilike('username', formData.pokerAlias)
                    .limit(1);

                if (error) throw error;

                if (data && data.length > 0) {
                    setAliasAvailable(false);
                    setAliasError('This alias is already taken');
                } else {
                    setAliasAvailable(true);
                    setAliasError('');
                }
            } catch (err) {
                console.error('Alias check error:', err);
                setAliasAvailable(null);
            } finally {
                setAliasChecking(false);
            }
        }, 500);

        return () => clearTimeout(timeout);
    }, [formData.pokerAlias]);

    // Format phone number
    const formatPhone = (value) => {
        const cleaned = value.replace(/\D/g, '');
        if (cleaned.length <= 3) return cleaned;
        if (cleaned.length <= 6) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
        return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
    };

    // Validate email format
    const isValidEmail = (email) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Submit user info and send email verification
    // ─────────────────────────────────────────────────────────────────────────
    const handleInfoSubmit = async (e) => {
        e.preventDefault();
        setError('');

        // Validate alias availability
        if (aliasAvailable === false) {
            setError('Please choose a different poker alias');
            return;
        }

        if (formData.pokerAlias.length < 3) {
            setError('Poker alias must be at least 3 characters');
            return;
        }

        if (!isValidEmail(formData.email)) {
            setError('Please enter a valid email address');
            return;
        }

        const cleanPhone = formData.phone.replace(/\D/g, '');
        if (cleanPhone.length !== 10) {
            setError('Please enter a valid 10-digit phone number');
            return;
        }

        setLoading(true);

        try {
            // Send email OTP first
            const { error } = await supabase.auth.signInWithOtp({
                email: formData.email,
                options: {
                    data: {
                        full_name: formData.fullName,
                        poker_alias: formData.pokerAlias,
                        city: formData.city,
                        state: formData.state,
                    },
                },
            });

            if (error) throw error;

            setStep('email-verify');
        } catch (err) {
            setError(err.message || 'Failed to send email verification code');
        } finally {
            setLoading(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Verify email OTP, then send phone verification
    // ─────────────────────────────────────────────────────────────────────────
    const handleEmailVerify = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Verify email OTP
            const { data, error: verifyError } = await supabase.auth.verifyOtp({
                email: formData.email,
                token: emailOtp,
                type: 'email',
            });

            if (verifyError) throw verifyError;

            setEmailVerified(true);

            // Now send phone OTP
            const cleanPhone = '+1' + formData.phone.replace(/\D/g, '');

            const { error: phoneError } = await supabase.auth.signInWithOtp({
                phone: cleanPhone,
            });

            if (phoneError) throw phoneError;

            setStep('phone-verify');
        } catch (err) {
            setError(err.message || 'Invalid email verification code');
        } finally {
            setLoading(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Verify phone OTP and create profile
    // ─────────────────────────────────────────────────────────────────────────
    const handlePhoneVerify = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const cleanPhone = '+1' + formData.phone.replace(/\D/g, '');

        try {
            // Verify phone OTP
            const { data, error: verifyError } = await supabase.auth.verifyOtp({
                phone: cleanPhone,
                token: phoneOtp,
                type: 'sms',
            });

            if (verifyError) throw verifyError;

            // Create/update user profile
            if (data.user) {
                const { error: profileError } = await supabase
                    .from('profiles')
                    .upsert({
                        id: data.user.id,
                        full_name: formData.fullName,
                        email: formData.email,
                        phone: cleanPhone,
                        city: formData.city,
                        state: formData.state,
                        username: formData.pokerAlias,
                        xp_total: 0,
                        diamonds: 0,
                        diamond_multiplier: 1.0,
                        streak_days: 0,
                        skill_tier: 'Newcomer',
                        email_verified: true,
                        phone_verified: true,
                        created_at: new Date().toISOString(),
                        last_login: new Date().toISOString(),
                    }, {
                        onConflict: 'id',
                    });

                if (profileError) {
                    console.error('Profile creation error:', profileError);
                }
            }

            // Redirect to hub
            router.push('/hub');
        } catch (err) {
            setError(err.message || 'Invalid phone verification code');
        } finally {
            setLoading(false);
        }
    };

    // Resend email code
    const resendEmailCode = async () => {
        setLoading(true);
        setError('');
        try {
            const { error } = await supabase.auth.signInWithOtp({
                email: formData.email,
            });
            if (error) throw error;
            setError(''); // Clear any previous error
            alert('Verification code sent to your email!');
        } catch (err) {
            setError(err.message || 'Failed to resend code');
        } finally {
            setLoading(false);
        }
    };

    // Resend phone code
    const resendPhoneCode = async () => {
        setLoading(true);
        setError('');
        try {
            const cleanPhone = '+1' + formData.phone.replace(/\D/g, '');
            const { error } = await supabase.auth.signInWithOtp({
                phone: cleanPhone,
            });
            if (error) throw error;
            alert('Verification code sent to your phone!');
        } catch (err) {
            setError(err.message || 'Failed to resend code');
        } finally {
            setLoading(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────
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

                {/* Progress Indicator */}
                <div style={styles.progressBar}>
                    <ProgressStep number={1} label="Info" active={step === 'info'} completed={step !== 'info'} />
                    <div style={styles.progressLine} />
                    <ProgressStep number={2} label="Email" active={step === 'email-verify'} completed={step === 'phone-verify'} />
                    <div style={styles.progressLine} />
                    <ProgressStep number={3} label="Phone" active={step === 'phone-verify'} completed={false} />
                </div>

                {/* Auth Card */}
                <div style={{
                    ...styles.authCard,
                    boxShadow: `0 0 60px rgba(255, 140, 0, ${0.1 + glowPulse * 0.1})`,
                }}>
                    <div style={styles.logoSection}>
                        <OrangeBall size={48} />
                        <h1 style={styles.title}>
                            {step === 'info' && 'Create Account'}
                            {step === 'email-verify' && 'Verify Email'}
                            {step === 'phone-verify' && 'Verify Phone'}
                        </h1>
                        <p style={styles.subtitle}>
                            {step === 'info' && 'Start your GTO training journey'}
                            {step === 'email-verify' && `Enter the code sent to ${formData.email}`}
                            {step === 'phone-verify' && `Enter the code sent to +1 ${formatPhone(formData.phone)}`}
                        </p>
                    </div>

                    {error && (
                        <div style={styles.errorBox}>
                            {error}
                        </div>
                    )}

                    {/* ═══════════════════════════════════════════════════════════════
                        STEP 1: USER INFORMATION
                        ═══════════════════════════════════════════════════════════════ */}
                    {step === 'info' && (
                        <form onSubmit={handleInfoSubmit} style={styles.form}>
                            {/* Full Name */}
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Full Name</label>
                                <input
                                    type="text"
                                    value={formData.fullName}
                                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                    placeholder="John Smith"
                                    style={styles.inputSingle}
                                    required
                                />
                            </div>

                            {/* Email */}
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Email Address</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    placeholder="you@example.com"
                                    style={styles.inputSingle}
                                    required
                                />
                            </div>

                            {/* City & State */}
                            <div style={styles.rowGroup}>
                                <div style={{ ...styles.inputGroup, flex: 2 }}>
                                    <label style={styles.label}>City</label>
                                    <input
                                        type="text"
                                        value={formData.city}
                                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                        placeholder="Las Vegas"
                                        style={styles.inputSingle}
                                        required
                                    />
                                </div>
                                <div style={{ ...styles.inputGroup, flex: 1 }}>
                                    <label style={styles.label}>State</label>
                                    <select
                                        value={formData.state}
                                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                                        style={styles.selectInput}
                                        required
                                    >
                                        <option value="">Select</option>
                                        {US_STATES.map(st => (
                                            <option key={st} value={st}>{st}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Poker Alias */}
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>
                                    Poker Alias
                                    <span style={styles.labelHint}>(you can change this later)</span>
                                </label>
                                <div style={styles.aliasInputWrapper}>
                                    <input
                                        type="text"
                                        value={formData.pokerAlias}
                                        onChange={(e) => setFormData({ ...formData, pokerAlias: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                                        placeholder="YourPokerName"
                                        style={{
                                            ...styles.inputSingle,
                                            borderColor: aliasAvailable === false ? '#ff4d4d' :
                                                aliasAvailable === true ? '#00ff66' :
                                                    'rgba(255, 140, 0, 0.3)',
                                        }}
                                        minLength={3}
                                        maxLength={20}
                                        required
                                    />
                                    {aliasChecking && (
                                        <span style={styles.aliasStatus}>Checking...</span>
                                    )}
                                    {!aliasChecking && aliasAvailable === true && (
                                        <span style={{ ...styles.aliasStatus, color: '#00ff66' }}>✓ Available</span>
                                    )}
                                    {!aliasChecking && aliasAvailable === false && (
                                        <span style={{ ...styles.aliasStatus, color: '#ff4d4d' }}>✗ Taken</span>
                                    )}
                                </div>
                                {aliasError && (
                                    <span style={styles.fieldError}>{aliasError}</span>
                                )}
                            </div>

                            {/* Phone Number */}
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
                                    opacity: loading || aliasAvailable === false ? 0.7 : 1,
                                }}
                                disabled={loading || aliasAvailable === false}
                            >
                                {loading ? 'Sending Verification...' : 'Continue'}
                            </button>

                            <p style={styles.terms}>
                                By signing up, you agree to our Terms of Service and Privacy Policy
                            </p>
                        </form>
                    )}

                    {/* ═══════════════════════════════════════════════════════════════
                        STEP 2: EMAIL VERIFICATION
                        ═══════════════════════════════════════════════════════════════ */}
                    {step === 'email-verify' && (
                        <form onSubmit={handleEmailVerify} style={styles.form}>
                            <div style={styles.verifyIcon}>📧</div>

                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Email Verification Code</label>
                                <input
                                    type="text"
                                    value={emailOtp}
                                    onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
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
                                {loading ? 'Verifying...' : 'Verify Email'}
                            </button>

                            <button
                                type="button"
                                onClick={resendEmailCode}
                                style={styles.secondaryButton}
                                disabled={loading}
                            >
                                Resend Code
                            </button>

                            <button
                                type="button"
                                onClick={() => setStep('info')}
                                style={styles.backLink}
                            >
                                ← Back to Information
                            </button>
                        </form>
                    )}

                    {/* ═══════════════════════════════════════════════════════════════
                        STEP 3: PHONE VERIFICATION
                        ═══════════════════════════════════════════════════════════════ */}
                    {step === 'phone-verify' && (
                        <form onSubmit={handlePhoneVerify} style={styles.form}>
                            <div style={styles.verifyIcon}>📱</div>

                            <div style={styles.verifiedBadge}>
                                <span style={styles.verifiedCheck}>✓</span>
                                <span>Email Verified</span>
                            </div>

                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Phone Verification Code</label>
                                <input
                                    type="text"
                                    value={phoneOtp}
                                    onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
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
                                {loading ? 'Creating Account...' : 'Verify & Complete'}
                            </button>

                            <button
                                type="button"
                                onClick={resendPhoneCode}
                                style={styles.secondaryButton}
                                disabled={loading}
                            >
                                Resend Code
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
// 📊 PROGRESS STEP
// ─────────────────────────────────────────────────────────────────────────────
function ProgressStep({ number, label, active, completed }) {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
        }}>
            <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: completed ? 'linear-gradient(135deg, #00ff66, #00cc52)' :
                    active ? 'linear-gradient(135deg, #ff8c00, #ff6600)' :
                        'rgba(255, 255, 255, 0.1)',
                border: `2px solid ${completed ? '#00ff66' : active ? '#ff8c00' : 'rgba(255, 255, 255, 0.2)'}`,
                fontFamily: 'Orbitron, sans-serif',
                fontSize: '14px',
                fontWeight: 700,
                color: completed || active ? '#000' : 'rgba(255, 255, 255, 0.5)',
            }}>
                {completed ? '✓' : number}
            </div>
            <span style={{
                fontSize: '10px',
                fontFamily: 'Orbitron, sans-serif',
                color: active ? '#ff8c00' : 'rgba(255, 255, 255, 0.5)',
                textTransform: 'uppercase',
                letterSpacing: '1px',
            }}>
                {label}
            </span>
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
    progressBar: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '32px',
        position: 'relative',
        zIndex: 5,
    },
    progressLine: {
        width: '40px',
        height: '2px',
        background: 'rgba(255, 255, 255, 0.2)',
    },
    authCard: {
        width: '100%',
        maxWidth: '480px',
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
    rowGroup: {
        display: 'flex',
        gap: '12px',
    },
    label: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '11px',
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    labelHint: {
        fontFamily: 'Inter, sans-serif',
        fontSize: '10px',
        fontWeight: 400,
        color: 'rgba(255, 140, 0, 0.6)',
        textTransform: 'none',
        letterSpacing: 0,
    },
    inputSingle: {
        padding: '14px 16px',
        background: 'rgba(0, 0, 0, 0.3)',
        border: '2px solid rgba(255, 140, 0, 0.3)',
        borderRadius: '12px',
        fontFamily: 'Inter, sans-serif',
        fontSize: '15px',
        color: '#ffffff',
        outline: 'none',
        transition: 'border-color 0.3s ease',
    },
    selectInput: {
        padding: '14px 16px',
        background: 'rgba(0, 0, 0, 0.3)',
        border: '2px solid rgba(255, 140, 0, 0.3)',
        borderRadius: '12px',
        fontFamily: 'Inter, sans-serif',
        fontSize: '15px',
        color: '#ffffff',
        outline: 'none',
        cursor: 'pointer',
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23ff8c00' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10l-5 5z'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
    },
    aliasInputWrapper: {
        position: 'relative',
    },
    aliasStatus: {
        position: 'absolute',
        right: '16px',
        top: '50%',
        transform: 'translateY(-50%)',
        fontSize: '12px',
        fontFamily: 'Orbitron, sans-serif',
        color: 'rgba(255, 255, 255, 0.5)',
    },
    fieldError: {
        fontSize: '11px',
        color: '#ff4d4d',
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
        padding: '14px 16px',
        background: 'rgba(255, 140, 0, 0.1)',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        fontWeight: 600,
        color: '#ff8c00',
    },
    input: {
        flex: 1,
        padding: '14px 16px',
        background: 'transparent',
        border: 'none',
        outline: 'none',
        fontFamily: 'Inter, sans-serif',
        fontSize: '15px',
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
        border: '1px solid rgba(255, 140, 0, 0.3)',
        borderRadius: '8px',
        color: 'rgba(255, 255, 255, 0.6)',
        fontFamily: 'Inter, sans-serif',
        fontSize: '13px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
    },
    backLink: {
        padding: '8px',
        background: 'transparent',
        border: 'none',
        color: 'rgba(255, 255, 255, 0.4)',
        fontFamily: 'Inter, sans-serif',
        fontSize: '12px',
        cursor: 'pointer',
    },
    verifyIcon: {
        fontSize: '48px',
        textAlign: 'center',
        marginBottom: '8px',
    },
    verifiedBadge: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '10px 16px',
        background: 'rgba(0, 255, 102, 0.1)',
        border: '1px solid rgba(0, 255, 102, 0.3)',
        borderRadius: '8px',
        color: '#00ff66',
        fontSize: '13px',
        fontFamily: 'Orbitron, sans-serif',
        marginBottom: '8px',
    },
    verifiedCheck: {
        fontSize: '16px',
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
};
