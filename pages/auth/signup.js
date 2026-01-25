/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — SIGN UP REGISTRATION NODE
   Email/Password Registration with Supabase OTP Email Verification
   Cyan/Electric Blue Aesthetic | Deep Navy Background
   Last Deploy: 2026-01-12 01:18:00 - OTP Code Input Active
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
// 🚫 RESTRICTED STATES — Diamond Arena Prize Redemptions BLOCKED
// Per 2026 AB 831 Standard & State-Specific Regulations
// ─────────────────────────────────────────────────────────────────────────────
const RESTRICTED_STATES = ['WA', 'ID', 'MI', 'NV', 'CA'];

// ─────────────────────────────────────────────────────────────────────────────
// 📝 SIGN UP PAGE — SIMPLIFIED EMAIL/PASSWORD FLOW
// ─────────────────────────────────────────────────────────────────────────────
export default function SignUpPage() {
    const router = useRouter();

    // Step: 'info' → 'email_pending' → 'success' → redirect
    const [step, setStep] = useState('info');

    // Form data
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        password: '',
        confirmPassword: '',
        birthMonth: '',
        birthDay: '',
        birthYear: '',
        city: '',
        state: '',
        pokerAlias: '',
        phone: '',
    });

    // UI state
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [aliasError, setAliasError] = useState('');
    const [aliasChecking, setAliasChecking] = useState(false);
    const [aliasAvailable, setAliasAvailable] = useState(null);
    const [glowPulse, setGlowPulse] = useState(0);

    // Password visibility toggles
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // 18+ Age Verification (2026 AB 831 Compliance)
    const [ageConfirmed, setAgeConfirmed] = useState(false);

    // Check if selected state is restricted
    const isRestrictedState = RESTRICTED_STATES.includes(formData.state);

    // Player number assigned after successful registration
    const [assignedPlayerNumber, setAssignedPlayerNumber] = useState(null);

    // Email verification code state
    const [verificationCode, setVerificationCode] = useState('');
    const [verifying, setVerifying] = useState(false);

    // SMS Phone Verification State
    const [phoneVerified, setPhoneVerified] = useState(false);
    const [phoneSendingOtp, setPhoneSendingOtp] = useState(false);
    const [phoneOtpSent, setPhoneOtpSent] = useState(false);
    const [phoneOtp, setPhoneOtp] = useState('');
    const [phoneVerifying, setPhoneVerifying] = useState(false);
    const [phoneError, setPhoneError] = useState('');
    const [phoneOtpCooldown, setPhoneOtpCooldown] = useState(0);

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

    // Check alias availability with debounce (3-20 characters allowed)
    useEffect(() => {
        // Must be 3-20 characters
        if (formData.pokerAlias.length < 3) {
            setAliasAvailable(null);
            setAliasError('');
            return;
        }

        if (formData.pokerAlias.length > 20) {
            setAliasAvailable(false);
            setAliasError('Alias must be 20 characters or less');
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

    // ─────────────────────────────────────────────────────────────────────────
    // SMS PHONE VERIFICATION FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────────
    const sendPhoneOtp = async () => {
        const cleanPhone = formData.phone.replace(/\D/g, '');
        if (cleanPhone.length !== 10) {
            setPhoneError('Please enter a valid 10-digit phone number');
            return;
        }

        setPhoneSendingOtp(true);
        setPhoneError('');

        try {
            const res = await fetch('/api/sms/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: cleanPhone }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to send code');
            }

            setPhoneOtpSent(true);
            // Start 60-second cooldown
            setPhoneOtpCooldown(60);
            const interval = setInterval(() => {
                setPhoneOtpCooldown(prev => {
                    if (prev <= 1) {
                        clearInterval(interval);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } catch (err) {
            setPhoneError(err.message);
        } finally {
            setPhoneSendingOtp(false);
        }
    };

    const verifyPhoneOtp = async () => {
        if (phoneOtp.length !== 6) {
            setPhoneError('Please enter the 6-digit code');
            return;
        }

        setPhoneVerifying(true);
        setPhoneError('');

        try {
            const cleanPhone = formData.phone.replace(/\D/g, '');
            const res = await fetch('/api/sms/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: cleanPhone, code: phoneOtp }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Verification failed');
            }

            setPhoneVerified(true);
            setPhoneError('');
        } catch (err) {
            setPhoneError(err.message);
        } finally {
            setPhoneVerifying(false);
        }
    };

    // Reset phone verification if phone number changes
    useEffect(() => {
        if (phoneVerified || phoneOtpSent) {
            setPhoneVerified(false);
            setPhoneOtpSent(false);
            setPhoneOtp('');
            setPhoneError('');
        }
    }, [formData.phone]);

    // Validate email format
    const isValidEmail = (email) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // SUBMIT: Create account with email/password
    // ─────────────────────────────────────────────────────────────────────────
    const handleSignUp = async (e) => {
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

        if (formData.pokerAlias.length > 20) {
            setError('Poker alias must be 20 characters or less');
            return;
        }

        if (!isValidEmail(formData.email)) {
            setError('Please enter a valid email address');
            return;
        }

        if (formData.password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        // Birthdate validation - must be 18+ (using dropdown values)
        if (!formData.birthMonth || !formData.birthDay || !formData.birthYear) {
            setError('Please select your complete birth date');
            return;
        }
        const birthDate = new Date(`${formData.birthYear}-${formData.birthMonth}-${formData.birthDay}`);
        const today = new Date();
        const age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (age < 18 || (age === 18 && monthDiff < 0) || (age === 18 && monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            setError('You must be 18 years or older to create an account');
            return;
        }

        // 18+ Age Verification Check
        if (!ageConfirmed) {
            setError('You must confirm you are 18+ years of age');
            return;
        }

        const cleanPhone = formData.phone.replace(/\D/g, '');
        if (cleanPhone.length !== 10) {
            setError('Please enter a valid 10-digit phone number');
            return;
        }

        setLoading(true);

        try {
            // Step 1: Create auth user with email/password
            const { data: authData, error: signUpError } = await supabase.auth.signUp({
                email: formData.email,
                password: formData.password,
                options: {
                    data: {
                        full_name: formData.fullName,
                        poker_alias: formData.pokerAlias,
                        city: formData.city,
                        state: formData.state,
                    },
                    // Enable email confirmation - redirect to /auth/callback after verification
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                },
            });

            if (signUpError) throw signUpError;

            console.log('Auth user created:', authData);

            // Step 2: Create profile directly
            if (authData.user) {
                const cleanPhoneFormatted = '+1' + cleanPhone;

                // Try RPC first
                try {
                    const { data: profileData, error: rpcError } = await supabase
                        .rpc('initialize_player_profile', {
                            p_user_id: authData.user.id,
                            p_full_name: formData.fullName,
                            p_email: formData.email,
                            p_phone: cleanPhoneFormatted,
                            p_city: formData.city,
                            p_state: formData.state,
                            p_username: formData.pokerAlias,
                        });

                    if (rpcError) {
                        console.log('RPC failed, trying direct insert:', rpcError);
                        throw rpcError;
                    }

                    if (profileData && profileData.length > 0) {
                        setAssignedPlayerNumber(profileData[0].player_number);
                    }

                    // CRITICAL: Also create user_diamond_balance record (header reads from this table)
                    await supabase
                        .from('user_diamond_balance')
                        .upsert({
                            user_id: authData.user.id,
                            balance: 300, // Starting diamonds bonus
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                        }, {
                            onConflict: 'user_id',
                        });
                } catch (rpcErr) {
                    // Fallback to direct insert
                    console.log('Fallback: Direct profile insert');

                    // Get the next player number (max + 1)
                    const { data: maxData } = await supabase
                        .from('profiles')
                        .select('player_number')
                        .order('player_number', { ascending: false })
                        .limit(1)
                        .single();

                    const nextPlayerNumber = (maxData?.player_number || 1254) + 1;
                    console.log('Updating profile for user:', authData.user.id);

                    // UPDATE the profile created by the database trigger
                    // The trigger creates the profile with correct id = auth.user.id
                    // We just need to add/update the additional fields
                    const { error: updateError } = await supabase
                        .from('profiles')
                        .update({
                            full_name: formData.fullName,
                            phone: cleanPhoneFormatted,
                            city: formData.city,
                            state: formData.state,
                            username: formData.pokerAlias,
                            player_number: nextPlayerNumber,
                            xp_total: 100, // Starting XP bonus
                            diamonds: 300, // Starting diamonds bonus
                            diamond_multiplier: 1.0,
                            streak_count: 0,
                            skill_tier: 'Newcomer',
                            access_tier: isRestrictedState ? 'Restricted_Tier' : 'Full_Access',
                            last_login: new Date().toISOString(),
                        })
                        .eq('id', authData.user.id);

                    if (updateError) {
                        console.error('Profile update error:', updateError);
                        // If update fails (profile doesn't exist yet), try insert as fallback
                        const { error: insertError } = await supabase
                            .from('profiles')
                            .insert({
                                id: authData.user.id,
                                full_name: formData.fullName,
                                email: formData.email,
                                phone: cleanPhoneFormatted,
                                city: formData.city,
                                state: formData.state,
                                username: formData.pokerAlias,
                                player_number: nextPlayerNumber,
                                xp_total: 100,
                                diamonds: 300,
                                diamond_multiplier: 1.0,
                                streak_count: 0,
                                skill_tier: 'Newcomer',
                                access_tier: isRestrictedState ? 'Restricted_Tier' : 'Full_Access',
                                created_at: new Date().toISOString(),
                                last_login: new Date().toISOString(),
                            });

                        if (insertError) {
                            console.error('Profile insert fallback error:', insertError);
                        }
                    }

                    // Set the assigned player number
                    setAssignedPlayerNumber(nextPlayerNumber);
                }
            }

            // Check if email confirmation is required
            if (authData.user && !authData.session) {
                // Email confirmation required - show pending screen
                setStep('email_pending');
            } else {
                // Email already confirmed or auto-confirmed - show success
                setStep('success');
            }

        } catch (err) {
            console.error('Signup error:', err);
            setError(err.message || 'Failed to create account');
        } finally {
            setLoading(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // VERIFY: Submit email OTP verification code
    // ─────────────────────────────────────────────────────────────────────────
    const handleVerifyCode = async (e) => {
        e.preventDefault();
        setError('');

        if (verificationCode.length < 6) {
            setError('Please enter the complete verification code');
            return;
        }

        setVerifying(true);

        try {
            // Verify the OTP code with Supabase
            const { data, error: verifyError } = await supabase.auth.verifyOtp({
                email: formData.email,
                token: verificationCode,
                type: 'signup',
            });

            if (verifyError) throw verifyError;

            console.log('Email verified:', data);

            // Try to get player number if available
            if (data.user) {
                try {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('player_number')
                        .eq('id', data.user.id)
                        .single();

                    if (profile?.player_number) {
                        setAssignedPlayerNumber(profile.player_number);
                    }
                } catch (err) {
                    console.log('Could not fetch player number:', err);
                }
            }

            // Email verified successfully - show success
            setStep('success');

        } catch (err) {
            console.error('Verification error:', err);
            setError(err.message || 'Invalid verification code. Please try again.');
        } finally {
            setVerifying(false);
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

                {/* Auth Card */}
                <div style={{
                    ...styles.authCard,
                    boxShadow: `0 0 60px rgba(0, 212, 255, ${0.1 + glowPulse * 0.1})`,
                }}>
                    <div style={styles.logoSection}>
                        <BrainIcon size={48} />
                        <h1 style={styles.title}>
                            {step === 'info' && 'Create Account'}
                            {step === 'email_pending' && 'Verify Your Email'}
                            {step === 'success' && 'Welcome!'}
                        </h1>
                        <p style={styles.subtitle}>
                            {step === 'info' && 'Start your GTO training journey'}
                            {step === 'email_pending' && 'Enter the code from your email'}
                            {step === 'success' && 'Your account has been created'}
                        </p>
                    </div>

                    {error && (
                        <div style={styles.errorBox}>
                            {error}
                        </div>
                    )}

                    {/* ═══════════════════════════════════════════════════════════════
                        STEP 1: USER INFORMATION + PASSWORD
                        ═══════════════════════════════════════════════════════════════ */}
                    {step === 'info' && (
                        <form onSubmit={handleSignUp} style={styles.form}>
                            {/* Full Name */}
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Full Name</label>
                                <input
                                    type="text"
                                    value={formData.fullName}
                                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                    placeholder=""
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
                                    placeholder=""
                                    style={styles.inputSingle}
                                    required
                                />
                            </div>

                            {/* Password */}
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Password</label>
                                <div style={styles.passwordWrapper}>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        placeholder=""
                                        style={styles.inputSingle}
                                        minLength={6}
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        style={styles.eyeButton}
                                        tabIndex={-1}
                                    >
                                        {showPassword ? (
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                                                <line x1="1" y1="1" x2="23" y2="23" />
                                            </svg>
                                        ) : (
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                <circle cx="12" cy="12" r="3" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Confirm Password */}
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Confirm Password</label>
                                <div style={styles.passwordWrapper}>
                                    <input
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        value={formData.confirmPassword}
                                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                        placeholder=""
                                        style={styles.inputSingle}
                                        minLength={6}
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        style={styles.eyeButton}
                                        tabIndex={-1}
                                    >
                                        {showConfirmPassword ? (
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                                                <line x1="1" y1="1" x2="23" y2="23" />
                                            </svg>
                                        ) : (
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                <circle cx="12" cy="12" r="3" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                                {/* Forgot Password Link */}
                                <button
                                    type="button"
                                    onClick={() => router.push('/auth/forgot-password')}
                                    style={styles.forgotPasswordLink}
                                >
                                    Forgot your password?
                                </button>
                            </div>

                            {/* Birthdate - 18+ Verification - Dropdown Selectors */}
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Date of Birth <span style={styles.labelHint}>(must be 18+)</span></label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    {/* Month Dropdown */}
                                    <select
                                        value={formData.birthMonth || ''}
                                        onChange={(e) => setFormData({ ...formData, birthMonth: e.target.value })}
                                        style={{ ...styles.selectInput, flex: 1.5 }}
                                        required
                                    >
                                        <option value="">Month</option>
                                        <option value="01">January</option>
                                        <option value="02">February</option>
                                        <option value="03">March</option>
                                        <option value="04">April</option>
                                        <option value="05">May</option>
                                        <option value="06">June</option>
                                        <option value="07">July</option>
                                        <option value="08">August</option>
                                        <option value="09">September</option>
                                        <option value="10">October</option>
                                        <option value="11">November</option>
                                        <option value="12">December</option>
                                    </select>
                                    {/* Day Dropdown */}
                                    <select
                                        value={formData.birthDay || ''}
                                        onChange={(e) => setFormData({ ...formData, birthDay: e.target.value })}
                                        style={{ ...styles.selectInput, flex: 1 }}
                                        required
                                    >
                                        <option value="">Day</option>
                                        {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                                            <option key={day} value={String(day).padStart(2, '0')}>{day}</option>
                                        ))}
                                    </select>
                                    {/* Year Dropdown */}
                                    <select
                                        value={formData.birthYear || ''}
                                        onChange={(e) => setFormData({ ...formData, birthYear: e.target.value })}
                                        style={{ ...styles.selectInput, flex: 1.2 }}
                                        required
                                    >
                                        <option value="">Year</option>
                                        {Array.from({ length: 82 }, (_, i) => new Date().getFullYear() - 18 - i).map(year => (
                                            <option key={year} value={year}>{year}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* City & State */}
                            <div style={styles.rowGroup}>
                                <div style={{ ...styles.inputGroup, flex: 2 }}>
                                    <label style={styles.label}>City</label>
                                    <input
                                        type="text"
                                        value={formData.city}
                                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                        placeholder=""
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
                                                    'rgba(0, 212, 255, 0.3)',
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

                            {/* Phone Number with SMS Verification */}
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>
                                    Phone Number
                                    {phoneVerified && <span style={{ color: '#00ff66', marginLeft: '8px' }}>✓ Verified</span>}
                                </label>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <div style={{ ...styles.phoneInput, flex: 1 }}>
                                        <span style={styles.phonePrefix}>+1</span>
                                        <input
                                            type="tel"
                                            value={formatPhone(formData.phone)}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                            placeholder=""
                                            style={{
                                                ...styles.input,
                                                borderColor: phoneVerified ? '#00ff66' : 'rgba(0, 212, 255, 0.3)',
                                            }}
                                            maxLength={14}
                                            required
                                            disabled={phoneVerified}
                                        />
                                    </div>
                                    {!phoneVerified && (
                                        <button
                                            type="button"
                                            onClick={sendPhoneOtp}
                                            disabled={phoneSendingOtp || phoneOtpCooldown > 0 || formData.phone.replace(/\D/g, '').length !== 10}
                                            style={{
                                                padding: '12px 16px',
                                                background: phoneOtpCooldown > 0 ? 'rgba(100, 100, 100, 0.5)' : 'linear-gradient(135deg, #00d4ff, #0099cc)',
                                                border: 'none',
                                                borderRadius: '8px',
                                                color: '#fff',
                                                fontWeight: '600',
                                                fontSize: '13px',
                                                cursor: phoneSendingOtp || phoneOtpCooldown > 0 ? 'not-allowed' : 'pointer',
                                                whiteSpace: 'nowrap',
                                                opacity: formData.phone.replace(/\D/g, '').length !== 10 ? 0.5 : 1,
                                            }}
                                        >
                                            {phoneSendingOtp ? 'Sending...' : phoneOtpCooldown > 0 ? `Resend (${phoneOtpCooldown}s)` : phoneOtpSent ? 'Resend Code' : 'Send Code'}
                                        </button>
                                    )}
                                </div>

                                {/* OTP Input - appears after sending code */}
                                {phoneOtpSent && !phoneVerified && (
                                    <div style={{ marginTop: '12px' }}>
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                            <input
                                                type="text"
                                                value={phoneOtp}
                                                onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                placeholder="Enter 6-digit code"
                                                style={{
                                                    ...styles.inputSingle,
                                                    flex: 1,
                                                    letterSpacing: '4px',
                                                    textAlign: 'center',
                                                    fontSize: '18px',
                                                }}
                                                maxLength={6}
                                            />
                                            <button
                                                type="button"
                                                onClick={verifyPhoneOtp}
                                                disabled={phoneVerifying || phoneOtp.length !== 6}
                                                style={{
                                                    padding: '12px 20px',
                                                    background: phoneOtp.length === 6 ? 'linear-gradient(135deg, #00ff66, #00cc52)' : 'rgba(100, 100, 100, 0.5)',
                                                    border: 'none',
                                                    borderRadius: '8px',
                                                    color: '#fff',
                                                    fontWeight: '600',
                                                    fontSize: '13px',
                                                    cursor: phoneOtp.length === 6 ? 'pointer' : 'not-allowed',
                                                }}
                                            >
                                                {phoneVerifying ? 'Verifying...' : 'Verify'}
                                            </button>
                                        </div>
                                        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '8px' }}>
                                            Check your phone for the verification code from Smarter.Poker
                                        </p>
                                    </div>
                                )}

                                {/* Phone Error Message */}
                                {phoneError && (
                                    <span style={{ color: '#ff4d4d', fontSize: '12px', marginTop: '6px', display: 'block' }}>{phoneError}</span>
                                )}
                            </div>

                            {/* RESTRICTED STATE NOTICE */}
                            {isRestrictedState && (
                                <div style={styles.restrictedNotice}>
                                    <span style={styles.restrictedIcon}>⚠️</span>
                                    <div>
                                        <strong style={styles.restrictedTitle}>Restricted State Notice</strong>
                                        <p style={styles.restrictedText}>
                                            Residents of {formData.state} have full access to Training, Social, and Hub features.
                                            Diamond Arena prize redemptions are not available in your state.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* 18+ AGE VERIFICATION CHECKBOX */}
                            <div style={styles.ageCheckbox}>
                                <label style={styles.ageLabel}>
                                    <input
                                        type="checkbox"
                                        checked={ageConfirmed}
                                        onChange={(e) => setAgeConfirmed(e.target.checked)}
                                        style={styles.checkbox}
                                        required
                                    />
                                    <span style={styles.ageLabelText}>
                                        I confirm that I am <strong>18 years of age or older</strong> and agree
                                        to the platform's terms.
                                    </span>
                                </label>
                            </div>

                            <button
                                type="submit"
                                style={{
                                    ...styles.submitButton,
                                    opacity: loading || aliasAvailable === false || !ageConfirmed || !phoneVerified ? 0.7 : 1,
                                }}
                                disabled={loading || aliasAvailable === false || !ageConfirmed || !phoneVerified}
                            >
                                {loading ? 'Creating Account...' : 'Create Account'}
                            </button>

                            <p style={styles.terms}>
                                By signing up, you agree to our{' '}
                                <a href="/terms" target="_blank" style={styles.termsLink}>Terms of Service</a>
                                {' '}and{' '}
                                <a href="/terms" target="_blank" style={styles.termsLink}>Privacy Policy</a>
                            </p>
                        </form>
                    )}

                    {/* ═══════════════════════════════════════════════════════════════
                        EMAIL PENDING — ENTER VERIFICATION CODE
                        ═══════════════════════════════════════════════════════════════ */}
                    {step === 'email_pending' && (
                        <div style={styles.successContainer}>
                            <div style={styles.successIcon}>📧</div>

                            <h2 style={styles.successTitle}>Verify Your Email</h2>

                            <p style={styles.emailPendingText}>
                                We've sent a verification code to:
                            </p>
                            <p style={styles.emailHighlight}>{formData.email}</p>

                            <form onSubmit={handleVerifyCode} style={styles.otpForm}>
                                <div style={styles.inputGroup}>
                                    <label style={styles.label}>Enter Verification Code</label>
                                    <input
                                        type="text"
                                        value={verificationCode}
                                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                                        placeholder="Enter 6-8 digit code"
                                        style={{
                                            ...styles.inputSingle,
                                            textAlign: 'center',
                                            fontSize: '24px',
                                            fontFamily: 'Orbitron, monospace',
                                            letterSpacing: '8px',
                                        }}
                                        maxLength={8}
                                        autoComplete="one-time-code"
                                        autoFocus
                                    />
                                </div>

                                <button
                                    type="submit"
                                    style={{
                                        ...styles.submitButton,
                                        opacity: verifying || verificationCode.length < 6 ? 0.7 : 1,
                                    }}
                                    disabled={verifying || verificationCode.length < 6}
                                >
                                    {verifying ? 'Verifying...' : 'Verify Email'}
                                </button>
                            </form>

                            <div style={styles.profileSummary}>
                                <div style={styles.profileRow}>
                                    <span style={styles.profileLabel}>Alias Reserved</span>
                                    <span style={styles.profileValue}>{formData.pokerAlias}</span>
                                </div>
                                <div style={styles.profileRow}>
                                    <span style={styles.profileLabel}>Location</span>
                                    <span style={styles.profileValue}>{formData.city}, {formData.state}</span>
                                </div>
                            </div>

                            <p style={styles.emailHint}>
                                Didn't receive it? Check your spam folder or{' '}
                                <button
                                    onClick={() => setStep('info')}
                                    style={styles.resendLink}
                                >
                                    try again
                                </button>
                            </p>
                        </div>
                    )}

                    {/* ═══════════════════════════════════════════════════════════════
                        SUCCESS — ACCOUNT CREATED
                        ═══════════════════════════════════════════════════════════════ */}
                    {step === 'success' && (
                        <div style={styles.successContainer}>
                            <div style={styles.successIcon}>🎉</div>

                            <h2 style={styles.successTitle}>Welcome to Smarter.Poker!</h2>

                            <div style={styles.playerNumberCard}>
                                <span style={styles.playerNumberLabel}>Your Player Number</span>
                                <span style={styles.playerNumber}>
                                    #{assignedPlayerNumber || '—'}
                                </span>
                                <span style={styles.playerNumberInfo}>
                                    Your universal ID across PokerIQ, Diamond Arena & Club Arena
                                </span>
                            </div>

                            <div style={styles.profileSummary}>
                                <div style={styles.profileRow}>
                                    <span style={styles.profileLabel}>Alias</span>
                                    <span style={styles.profileValue}>{formData.pokerAlias}</span>
                                </div>
                                <div style={styles.profileRow}>
                                    <span style={styles.profileLabel}>Location</span>
                                    <span style={styles.profileValue}>{formData.city}, {formData.state}</span>
                                </div>
                                <div style={styles.profileRow}>
                                    <span style={styles.profileLabel}>Starting Diamonds</span>
                                    <span style={styles.profileValue}>💎 300</span>
                                </div>
                                <div style={styles.profileRow}>
                                    <span style={styles.profileLabel}>Starting XP</span>
                                    <span style={styles.profileValue}>⬆️ 50 XP • LV 1</span>
                                </div>
                                <div style={styles.profileRow}>
                                    <span style={styles.profileLabel}>Skill Tier</span>
                                    <span style={styles.profileValue}>Newcomer</span>
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    // Set flag so hub plays intro animation
                                    sessionStorage.setItem('just_authenticated', 'true');
                                    router.push('/hub');
                                }}
                                style={styles.submitButton}
                            >
                                Enter the Hub →
                            </button>
                        </div>
                    )}

                    {step !== 'success' && step !== 'email_pending' && (
                        <>
                            <div style={styles.divider}>
                                <span>or</span>
                            </div>

                            <button
                                onClick={() => router.push('/auth/signin')}
                                style={styles.signupLink}
                            >
                                Already have an account? <span style={styles.cyanText}>Sign In</span>
                            </button>
                        </>
                    )}
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
        maxWidth: '480px',
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
    otpForm: {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '100%',
        marginTop: '12px',
        marginBottom: '20px',
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
        color: 'rgba(0, 212, 255, 0.6)',
        textTransform: 'none',
        letterSpacing: 0,
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
    selectInput: {
        padding: '14px 16px',
        background: 'rgba(0, 0, 0, 0.3)',
        border: '2px solid rgba(0, 212, 255, 0.3)',
        borderRadius: '12px',
        fontFamily: 'Inter, sans-serif',
        fontSize: '15px',
        color: '#ffffff',
        outline: 'none',
        cursor: 'pointer',
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2300D4FF' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10l-5 5z'/%3E%3C/svg%3E")`,
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
    passwordWrapper: {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
    },
    eyeButton: {
        position: 'absolute',
        right: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'rgba(0, 212, 255, 0.6)',
        padding: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'color 0.2s ease',
    },
    forgotPasswordLink: {
        background: 'none',
        border: 'none',
        color: 'rgba(0, 212, 255, 0.7)',
        fontSize: '12px',
        fontFamily: 'Inter, sans-serif',
        cursor: 'pointer',
        marginTop: '8px',
        textAlign: 'right',
        alignSelf: 'flex-end',
        transition: 'color 0.2s ease',
    },
    phoneInput: {
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(0, 0, 0, 0.3)',
        border: '2px solid rgba(0, 212, 255, 0.3)',
        borderRadius: '12px',
        overflow: 'hidden',
    },
    phonePrefix: {
        padding: '14px 16px',
        background: 'rgba(0, 212, 255, 0.1)',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        fontWeight: 600,
        color: '#00D4FF',
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
        background: 'linear-gradient(135deg, #00D4FF, #0066FF)',
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
    termsLink: {
        color: '#00D4FF',
        textDecoration: 'underline',
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
    // ─────────────────────────────────────────────────────────────────────────
    // SUCCESS SCREEN STYLES
    // ─────────────────────────────────────────────────────────────────────────
    successContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px',
        padding: '20px 0',
    },
    successIcon: {
        fontSize: '64px',
        animation: 'bounce 1s ease-in-out',
    },
    successTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '24px',
        fontWeight: 700,
        color: '#ffffff',
        textAlign: 'center',
        marginBottom: '8px',
    },
    playerNumberCard: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        padding: '24px 40px',
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 102, 255, 0.1))',
        border: '2px solid #00D4FF',
        borderRadius: '16px',
        boxShadow: '0 0 30px rgba(0, 212, 255, 0.3)',
    },
    playerNumberLabel: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '11px',
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.6)',
        textTransform: 'uppercase',
        letterSpacing: '2px',
    },
    playerNumber: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '48px',
        fontWeight: 900,
        color: '#00D4FF',
        textShadow: '0 0 20px rgba(0, 212, 255, 0.5)',
    },
    playerNumberInfo: {
        fontFamily: 'Inter, sans-serif',
        fontSize: '11px',
        color: 'rgba(255, 255, 255, 0.5)',
        textAlign: 'center',
        maxWidth: '200px',
    },
    profileSummary: {
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '16px',
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
    },
    profileRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    profileLabel: {
        fontFamily: 'Inter, sans-serif',
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.5)',
    },
    profileValue: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '13px',
        fontWeight: 600,
        color: '#ffffff',
    },
    // ─────────────────────────────────────────────────────────────────────────
    // RESTRICTED STATE NOTICE STYLES
    // ─────────────────────────────────────────────────────────────────────────
    restrictedNotice: {
        display: 'flex',
        gap: '12px',
        padding: '16px',
        background: 'rgba(255, 200, 0, 0.1)',
        border: '1px solid rgba(255, 200, 0, 0.3)',
        borderRadius: '12px',
        marginTop: '8px',
    },
    restrictedIcon: {
        fontSize: '20px',
    },
    restrictedTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '12px',
        fontWeight: 600,
        color: '#ffc800',
        marginBottom: '4px',
    },
    restrictedText: {
        fontSize: '12px',
        lineHeight: 1.5,
        color: 'rgba(255, 255, 255, 0.7)',
        margin: 0,
    },
    // ─────────────────────────────────────────────────────────────────────────
    // 18+ AGE VERIFICATION STYLES
    // ─────────────────────────────────────────────────────────────────────────
    ageCheckbox: {
        marginTop: '8px',
    },
    ageLabel: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        cursor: 'pointer',
    },
    checkbox: {
        width: '18px',
        height: '18px',
        marginTop: '2px',
        accentColor: '#00D4FF',
    },
    ageLabelText: {
        fontSize: '12px',
        lineHeight: 1.5,
        color: 'rgba(255, 255, 255, 0.7)',
    },
    // ─────────────────────────────────────────────────────────────────────────
    // EMAIL PENDING STYLES
    // ─────────────────────────────────────────────────────────────────────────
    emailPendingText: {
        fontFamily: 'Inter, sans-serif',
        fontSize: '14px',
        color: 'rgba(255, 255, 255, 0.6)',
        textAlign: 'center',
        marginBottom: '8px',
    },
    emailHighlight: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '16px',
        fontWeight: 600,
        color: '#00D4FF',
        textAlign: 'center',
        marginBottom: '20px',
    },
    emailInstructions: {
        padding: '16px',
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: '12px',
        marginBottom: '20px',
        textAlign: 'center',
        fontSize: '13px',
        color: 'rgba(255, 255, 255, 0.8)',
    },
    emailHint: {
        marginTop: '16px',
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.5)',
        textAlign: 'center',
    },
    resendLink: {
        background: 'none',
        border: 'none',
        color: '#00D4FF',
        fontSize: '12px',
        cursor: 'pointer',
        textDecoration: 'underline',
        padding: 0,
    },
};
