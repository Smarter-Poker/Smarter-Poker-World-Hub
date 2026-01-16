/* ═══════════════════════════════════════════════════════════════════════════
   AUTH CALLBACK — Handles Supabase email verification callback
   Creates user profile after email verification and redirects to hub
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';

export default function AuthCallback() {
    const router = useRouter();
    const [status, setStatus] = useState('Verifying email...');
    const [error, setError] = useState('');

    useEffect(() => {
        const handleCallback = async () => {
            try {
                // Get the current session from the URL hash (after email verification)
                const { data: { session }, error: sessionError } = await supabase.auth.getSession();

                if (sessionError) {
                    console.error('Session error:', sessionError);
                    setError('Failed to verify email. Please try again.');
                    return;
                }

                if (!session) {
                    setStatus('Waiting for verification...');
                    // No session yet, might need to wait
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    // Try again
                    const { data: { session: retrySession } } = await supabase.auth.getSession();
                    if (!retrySession) {
                        setError('No session found. Please try signing in.');
                        setTimeout(() => router.push('/auth/signin'), 3000);
                        return;
                    }
                }

                const user = session?.user;
                if (!user) {
                    setError('User not found. Please sign up again.');
                    setTimeout(() => router.push('/auth/signup'), 3000);
                    return;
                }

                setStatus('Creating your profile...');

                // Check if profile already exists
                const { data: existingProfile } = await supabase
                    .from('profiles')
                    .select('player_number')
                    .eq('id', user.id)
                    .single();

                if (existingProfile?.player_number) {
                    // Profile already exists, go to hub
                    setStatus('Welcome back! Redirecting...');
                    sessionStorage.setItem('just_authenticated', 'true');
                    setTimeout(() => router.replace('/hub'), 1000);
                    return;
                }

                // Extract user metadata
                const metadata = user.user_metadata || {};
                const state = metadata.state || '';

                // Try to initialize profile via RPC
                try {
                    const { data: profileData, error: rpcError } = await supabase
                        .rpc('initialize_player_profile', {
                            p_user_id: user.id,
                            p_full_name: metadata.full_name || '',
                            p_email: user.email || '',
                            p_phone: '', // Will be set later
                            p_city: metadata.city || '',
                            p_state: state,
                            p_username: metadata.poker_alias || '',
                        });

                    if (rpcError) {
                        console.log('RPC fallback needed:', rpcError);
                        throw rpcError;
                    }

                    if (profileData && profileData.length > 0) {
                        setStatus(`Welcome, Player #${profileData[0].player_number}! Redirecting...`);
                    } else {
                        setStatus('Account created! Redirecting...');
                    }
                } catch (rpcErr) {
                    // Fallback to direct insert
                    console.log('Using direct insert fallback');
                    const RESTRICTED_STATES = ['WA', 'ID', 'MI', 'NV', 'CA'];
                    const isRestricted = RESTRICTED_STATES.includes(state);

                    await supabase
                        .from('profiles')
                        .upsert({
                            id: user.id,
                            full_name: metadata.full_name || '',
                            email: user.email || '',
                            city: metadata.city || '',
                            state: state,
                            username: metadata.poker_alias || '',
                            xp_total: 50,
                            diamonds: 300,
                            diamond_multiplier: 1.0,
                            streak_days: 0,
                            skill_tier: 'Newcomer',
                            access_tier: isRestricted ? 'Restricted_Tier' : 'Full_Access',
                            email_verified: true,
                            created_at: new Date().toISOString(),
                            last_login: new Date().toISOString(),
                        }, {
                            onConflict: 'id',
                        });

                    setStatus('Account created! Redirecting...');
                }

                // Redirect to hub with intro
                sessionStorage.setItem('just_authenticated', 'true');
                setTimeout(() => router.replace('/hub'), 1500);

            } catch (err) {
                console.error('Callback error:', err);
                setError('Something went wrong. Please try signing in.');
                setTimeout(() => router.push('/auth/signin'), 3000);
            }
        };

        handleCallback();
    }, [router]);

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(180deg, #0a1628 0%, #0d1f35 100%)',
            color: '#ffffff',
            fontFamily: 'Inter, -apple-system, sans-serif',
        }}>
            {/* Brain Logo */}
            <div style={{
                width: 64,
                height: 64,
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0a1628, #1a2a4a)',
                border: '2px solid #00D4FF',
                boxShadow: '0 0 40px rgba(0, 212, 255, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '24px',
            }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2">
                    <path d="M12 2a4 4 0 014 4c0 1.5-.8 2.8-2 3.5V12h2a4 4 0 110 8h-8a4 4 0 110-8h2V9.5A4 4 0 018 6a4 4 0 014-4z" />
                </svg>
            </div>

            {/* Status */}
            <h1 style={{
                fontFamily: 'Orbitron, sans-serif',
                fontSize: '24px',
                fontWeight: 600,
                color: error ? '#ff4d4d' : '#00D4FF',
                marginBottom: '12px',
            }}>
                {error || status}
            </h1>

            {/* Loading Animation */}
            {!error && (
                <div style={{
                    display: 'flex',
                    gap: '8px',
                    marginTop: '16px',
                }}>
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            style={{
                                width: '12px',
                                height: '12px',
                                borderRadius: '50%',
                                background: '#00D4FF',
                                animation: `pulse 1.5s ease-in-out ${i * 0.2}s infinite`,
                            }}
                        />
                    ))}
                </div>
            )}

            <style jsx>{`
                @keyframes pulse {
                    0%, 100% { opacity: 0.3; transform: scale(0.8); }
                    50% { opacity: 1; transform: scale(1.2); }
                }
            `}</style>
        </div>
    );
}
