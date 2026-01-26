/* ═══════════════════════════════════════════════════════════════════════════
   ACCESS NODE — Authentication Entry Point
   Vanguard Silver | Next.js Unified
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [mode, setMode] = useState('login'); // 'login' or 'signup'
    const [message, setMessage] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(true); // Default to checked

    // Load remembered email on mount
    useEffect(() => {
        const savedEmail = localStorage.getItem('smarter-poker-remembered-email');
        const wasRemembered = localStorage.getItem('smarter-poker-remember-me') === 'true';
        if (savedEmail && wasRemembered) {
            setEmail(savedEmail);
            setRememberMe(true);
        }
    }, []);

    useEffect(() => {
        // Check for existing Supabase session
        async function checkSession() {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                // Set flag so hub plays intro animation
                sessionStorage.setItem('just_authenticated', 'true');
                router.push('/hub');
            }
        }
        checkSession();
    }, [router]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const { data, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) throw authError;

            console.log('✅ Login successful:', data.user?.email);

            // Remember device if checkbox is checked
            if (rememberMe) {
                localStorage.setItem('smarter-poker-remembered-email', email);
                localStorage.setItem('smarter-poker-remember-me', 'true');
            } else {
                localStorage.removeItem('smarter-poker-remembered-email');
                localStorage.removeItem('smarter-poker-remember-me');
            }

            // Set flag so hub plays intro animation
            sessionStorage.setItem('just_authenticated', 'true');
            router.push('/hub');
        } catch (err) {
            console.error('Login error:', err);
            setError(err.message || 'Login failed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignup = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setMessage(null);

        try {
            const { data, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                }
            });

            if (authError) throw authError;

            if (data.user && !data.session) {
                // Email confirmation required
                setMessage('Check your email for a confirmation link!');
            } else if (data.session) {
                // Auto-confirmed (for development)
                console.log('✅ Signup successful:', data.user?.email);
                // Set flag so hub plays intro animation
                sessionStorage.setItem('just_authenticated', 'true');
                router.push('/hub');
            }
        } catch (err) {
            console.error('Signup error:', err);
            setError(err.message || 'Signup failed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleMagicLink = async () => {
        if (!email) {
            setError('Please enter your email');
            return;
        }
        setIsLoading(true);
        setError(null);

        try {
            const { error: authError } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                }
            });

            if (authError) throw authError;

            setMessage('Magic link sent! Check your email.');
        } catch (err) {
            console.error('Magic link error:', err);
            setError(err.message || 'Failed to send magic link');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(180deg, #0a1628 0%, #0d1f35 50%, #0a1628 100%)',
            fontFamily: 'Inter, system-ui, sans-serif',
            padding: 20,
        }}>
            {/* Logo - Clean Text Brand */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 40,
            }}>
                {/* Brain Icon */}
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" stroke="url(#gradient1)" strokeWidth="1.5" fill="none" />
                    <path d="M12 6C10.5 6 9.5 7 9.5 8.5C9.5 9.5 10 10 10 11C9 11 8 11.5 8 13C8 14.5 9 15 10 15C10 16.5 11 18 12 18C13 18 14 16.5 14 15C15 15 16 14.5 16 13C16 11.5 15 11 14 11C14 10 14.5 9.5 14.5 8.5C14.5 7 13.5 6 12 6Z" fill="url(#gradient1)" />
                    <defs>
                        <linearGradient id="gradient1" x1="0" y1="0" x2="24" y2="24">
                            <stop offset="0%" stopColor="#00d4ff" />
                            <stop offset="100%" stopColor="#0088ff" />
                        </linearGradient>
                    </defs>
                </svg>
                {/* Brand Text */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    <span style={{
                        fontSize: 28,
                        fontWeight: 700,
                        color: '#ffffff',
                        letterSpacing: '-0.02em',
                        lineHeight: 1.1,
                    }}>SMARTER.POKER</span>
                    <span style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: 'rgba(0, 212, 255, 0.8)',
                        letterSpacing: '0.15em',
                        textTransform: 'uppercase',
                    }}>Train Smarter, Win More</span>
                </div>
            </div>

            {/* Title */}
            <h1 style={{
                fontSize: 24,
                fontWeight: 600,
                color: '#ffffff',
                marginBottom: 8,
                letterSpacing: '-0.01em',
            }}>
                {mode === 'login' ? 'Welcome Back' : 'Create Account'}
            </h1>

            <p style={{
                fontSize: 14,
                color: 'rgba(255, 255, 255, 0.5)',
                marginBottom: 32,
            }}>
                {mode === 'login' ? 'Sign in to continue' : 'Join the Smarter.Poker community'}
            </p>

            {/* Auth Form */}
            <form onSubmit={mode === 'login' ? handleLogin : handleSignup} autoComplete="off" style={{
                width: '100%',
                maxWidth: 360,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
            }}>
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="off"
                    style={{
                        padding: '14px 16px',
                        fontSize: 16,
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: 8,
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: '#fff',
                        outline: 'none',
                    }}
                />

                <div style={{ position: 'relative' }}>
                    <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        style={{
                            width: '100%',
                            padding: '14px 48px 14px 16px',
                            fontSize: 16,
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: 8,
                            background: 'rgba(255, 255, 255, 0.1)',
                            color: '#fff',
                            outline: 'none',
                            boxSizing: 'border-box',
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                            position: 'absolute',
                            right: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'rgba(255, 255, 255, 0.6)',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
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

                {mode === 'login' && (
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: -4,
                    }}>
                        {/* Remember Me Checkbox */}
                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                            color: 'rgba(255, 255, 255, 0.7)',
                            fontSize: 13,
                        }}>
                            <input
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                style={{
                                    width: 16,
                                    height: 16,
                                    accentColor: '#1877F2',
                                    cursor: 'pointer',
                                }}
                            />
                            Remember me
                        </label>
                        <button
                            type="button"
                            onClick={() => router.push('/auth/forgot-password')}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'rgba(255, 255, 255, 0.6)',
                                fontSize: 13,
                                cursor: 'pointer',
                            }}
                        >
                            Forgot password?
                        </button>
                    </div>
                )}

                {error && (
                    <div style={{
                        padding: '12px',
                        background: 'rgba(220, 38, 38, 0.2)',
                        border: '1px solid rgba(220, 38, 38, 0.5)',
                        borderRadius: 8,
                        color: '#f87171',
                        fontSize: 14,
                        textAlign: 'center',
                    }}>
                        {error}
                    </div>
                )}

                {message && (
                    <div style={{
                        padding: '12px',
                        background: 'rgba(34, 197, 94, 0.2)',
                        border: '1px solid rgba(34, 197, 94, 0.5)',
                        borderRadius: 8,
                        color: '#4ade80',
                        fontSize: 14,
                        textAlign: 'center',
                    }}>
                        {message}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={isLoading}
                    style={{
                        padding: '14px 24px',
                        fontSize: 16,
                        fontWeight: 600,
                        color: '#ffffff',
                        background: isLoading
                            ? 'rgba(100, 100, 100, 0.5)'
                            : 'linear-gradient(135deg, #1877F2, #0a5dc2)',
                        border: 'none',
                        borderRadius: 8,
                        cursor: isLoading ? 'wait' : 'pointer',
                        transition: 'all 0.3s ease',
                    }}
                >
                    {isLoading
                        ? 'Please wait...'
                        : mode === 'login'
                            ? 'Sign In'
                            : 'Create Account'}
                </button>

                {mode === 'login' && (
                    <button
                        type="button"
                        onClick={handleMagicLink}
                        disabled={isLoading}
                        style={{
                            padding: '14px 24px',
                            fontSize: 14,
                            fontWeight: 500,
                            color: 'rgba(255, 255, 255, 0.7)',
                            background: 'transparent',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: 8,
                            cursor: 'pointer',
                        }}
                    >
                        ✨ Send Magic Link
                    </button>
                )}
            </form>

            {/* Toggle Mode */}
            <p style={{
                marginTop: 24,
                fontSize: 14,
                color: 'rgba(255, 255, 255, 0.6)',
            }}>
                {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
                <button
                    onClick={() => {
                        setMode(mode === 'login' ? 'signup' : 'login');
                        setError(null);
                        setMessage(null);
                    }}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#1877F2',
                        cursor: 'pointer',
                        fontWeight: 600,
                        textDecoration: 'underline',
                    }}
                >
                    {mode === 'login' ? 'Sign Up' : 'Sign In'}
                </button>
            </p>

            {/* Footer */}
            <p style={{
                position: 'absolute',
                bottom: 24,
                fontSize: 12,
                color: 'rgba(255, 255, 255, 0.3)',
            }}>
                © 2026 Smarter.Poker — All Rights Reserved
            </p>
        </div>
    );
}
