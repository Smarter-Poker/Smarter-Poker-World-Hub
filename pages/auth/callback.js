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
                let { data: { session }, error: sessionError } = await supabase.auth.getSession();

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
                    // Use the retry session going forward
                    session = retrySession;
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
                    .maybeSingle();

                if (existingProfile?.player_number) {
                    // Profile already exists, check if redirecting to commander
                    const isCommanderOrigin = localStorage.getItem('commander_login_origin') === 'true';

                    if (isCommanderOrigin) {
                        setStatus('Welcome back to Club Commander! Allocating session...');
                        localStorage.removeItem('commander_login_origin');

                        try {
                            // Fetch subscription to populate commander_staff session
                            // CRITICAL FIX: Send JWT Bearer token — check-subscription requires auth (BUG #260)
                            const accessToken = session?.access_token;
                            const subRes = await fetch('/api/commander/check-subscription', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
                                },
                                body: JSON.stringify({ userId: user.id }),
                            });
                            const subData = await subRes.json();

                            if (subRes.ok && subData.subscription) {
                                const subscription = subData.subscription;
                                localStorage.setItem('commander_venue', JSON.stringify(subscription.venue));
                                localStorage.setItem('commander_subscription', JSON.stringify(subscription));

                                const staffSession = {
                                    user_id: user.id,
                                    email: user.email,
                                    display_name: subscription.billing_name || (user.user_metadata?.name) || (user.user_metadata?.full_name) || user.email,
                                    role: 'owner',
                                    venue_id: subscription.venue_id,
                                    venue_name: subscription.venue?.name || 'My Venue',
                                    permissions: {
                                        manage_games: true, manage_waitlist: true, manage_staff: true,
                                        manage_tables: true, manage_tournaments: true, manage_settings: true,
                                        view_analytics: true, view_reports: true, send_announcements: true,
                                    }
                                };
                                localStorage.setItem('commander_staff', JSON.stringify(staffSession));
                                localStorage.setItem('commander_remember', 'true');

                                setTimeout(() => router.replace('/commander/dashboard'), 1000);
                                return;
                            } else {
                                // If no subscription, redirect to commander lobby anyway
                                // (They might just be a staff member with a row in commander_staff instead of an owner)
                                setTimeout(() => router.replace('/commander/dashboard'), 1000);
                                return;
                            }
                        } catch (err) {
                            console.error('Failed to init commander session:', err);
                            setTimeout(() => router.replace('/commander/dashboard'), 1000);
                            return;
                        }
                    }

                    // Otherwise go to hub
                    setStatus('Welcome back! Redirecting...');
                    sessionStorage.setItem('just_authenticated', 'true');
                    setTimeout(() => router.replace('/hub'), 1000);
                    return;
                }

                // Extract user metadata
                // Google OAuth provides: name, given_name, family_name, picture, email
                // Email/password provides: full_name, poker_alias, city, state
                const metadata = user.user_metadata || {};
                const fullName = metadata.full_name
                    || metadata.name
                    || [metadata.given_name, metadata.family_name].filter(Boolean).join(' ')
                    || '';
                const avatarUrl = metadata.avatar_url || metadata.picture || '';
                const state = metadata.state || '';
                // For Google users, generate a username from their name if no poker_alias
                const username = metadata.poker_alias
                    || (fullName ? fullName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 15) : '')
                    || '';

                // Try to initialize profile via RPC
                try {
                    // ═══════════════════════════════════════════════════════════════════
                    // 🔗 DUPLICATE PREVENTION: Check if a profile with same email exists
                    // ═══════════════════════════════════════════════════════════════════
                    if (user.email) {
                        const { data: emailMatch, error: emailCheckError } = await supabase
                            .from('profiles')
                            .select('id, player_number')
                            .ilike('email', user.email.trim())
                            .maybeSingle();

                        if (emailMatch && !emailCheckError) {
                            console.log(`🔐 [AUTH CALLBACK] DUPLICATE PREVENTED: Linking auth.id=${user.id} to existing profile id=${emailMatch.id}`);

                            // Update existing profile's last login
                            await supabase
                                .from('profiles')
                                .update({
                                    last_login: new Date().toISOString(),
                                    is_online: true
                                })
                                .eq('id', emailMatch.id);

                            // Emulate existing profile logic to redirect to Commander or Hub
                            const isCommanderOrigin = localStorage.getItem('commander_login_origin') === 'true';
                            if (isCommanderOrigin) {
                                localStorage.removeItem('commander_login_origin');
                                // Initialize commander_staff logic for the existing user
                                const accessToken = session?.access_token;
                                try {
                                    const subRes = await fetch('/api/commander/check-subscription', {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
                                        },
                                        body: JSON.stringify({ userId: emailMatch.id }), // check sub against existing profile ID
                                    });
                                    const subData = await subRes.json();
                                    if (subRes.ok && subData.subscription) {
                                        const subscription = subData.subscription;
                                        localStorage.setItem('commander_venue', JSON.stringify(subscription.venue));
                                        localStorage.setItem('commander_subscription', JSON.stringify(subscription));

                                        const staffSession = {
                                            user_id: emailMatch.id, // linked ID
                                            email: user.email,
                                            display_name: subscription.billing_name || fullName || user.email,
                                            role: 'owner',
                                            venue_id: subscription.venue_id,
                                            venue_name: subscription.venue?.name || 'My Venue',
                                            permissions: {
                                                manage_games: true, manage_waitlist: true, manage_staff: true,
                                                manage_tables: true, manage_tournaments: true, manage_settings: true,
                                                view_analytics: true, view_reports: true, send_announcements: true,
                                            }
                                        };
                                        localStorage.setItem('commander_staff', JSON.stringify(staffSession));
                                        localStorage.setItem('commander_remember', 'true');
                                        setStatus('Account linked! Redirecting to Club Commander...');
                                        setTimeout(() => router.replace('/commander/dashboard'), 1000);
                                        return;
                                    }
                                } catch (e) { console.error('Commander sub check failed after merge', e); }

                                setStatus('Account linked! Redirecting to Club Commander...');
                                setTimeout(() => router.replace('/commander/dashboard'), 1000);
                                return;
                            } else {
                                setStatus('Account linked! Redirecting...');
                                sessionStorage.setItem('just_authenticated', 'true');
                                setTimeout(() => router.replace('/hub'), 1000);
                                return;
                            }
                        }
                    }

                    const { data: profileData, error: rpcError } = await supabase
                        .rpc('initialize_player_profile', {
                            p_user_id: user.id,
                            p_full_name: fullName,
                            p_email: user.email || '',
                            p_phone: metadata.phone || '', // Google doesn't share phone
                            p_city: metadata.city || '',
                            p_state: state,
                            p_username: username,
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
                            full_name: fullName,
                            email: user.email || '',
                            city: metadata.city || '',
                            state: state,
                            username: username,
                            avatar_url: avatarUrl,
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

                // ═══════════════════════════════════════════════════════════════
                // 🎁 NEW USER WELCOME: 30-day VIP trial + 300 diamonds
                // Runs after profile creation (both RPC and fallback paths)
                // ═══════════════════════════════════════════════════════════════
                try {
                    const now = new Date();
                    const vipExpires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

                    // Set VIP status on profile
                    await supabase
                        .from('profiles')
                        .update({
                            is_vip: true,
                            vip_expires_at: vipExpires.toISOString(),
                            diamonds: 300,
                        })
                        .eq('id', user.id);

                    // Initialize diamond balance
                    await supabase
                        .from('user_diamond_balance')
                        .upsert({
                            user_id: user.id,
                            balance: 300,
                            updated_at: now.toISOString(),
                        }, { onConflict: 'user_id' });

                    // Log welcome diamond grant
                    await supabase
                        .from('diamond_transactions')
                        .insert({
                            user_id: user.id,
                            amount: 300,
                            transaction_type: 'bonus',
                            description: 'Welcome Bonus — 300 Diamonds for Joining Smarter.Poker!',
                            metadata: { source: 'welcome_bonus', type: 'new_user' },
                            balance_after: 300,
                        });

                    // Log VIP trial activation
                    await supabase
                        .from('diamond_transactions')
                        .insert({
                            user_id: user.id,
                            amount: 0,
                            transaction_type: 'bonus',
                            description: `VIP Trial Activated — Free 30-day VIP membership!`,
                            metadata: {
                                source: 'vip_trial',
                                type: 'new_user',
                                vip_expires_at: vipExpires.toISOString(),
                            },
                            balance_after: 300,
                        });

                    console.log(`[Auth Callback] 🎁 Welcome package granted: 300💎 + 30-day VIP for ${user.email}`);
                } catch (welcomeErr) {
                    // Don't block account creation if welcome package fails
                    console.error('[Auth Callback] Welcome package error (non-blocking):', welcomeErr);
                }

                // Check origin for redirect
                const isCommanderOrigin = localStorage.getItem('commander_login_origin') === 'true';
                if (isCommanderOrigin) {
                    localStorage.removeItem('commander_login_origin');
                    sessionStorage.setItem('needs_phone_verify', user.id);
                    setTimeout(() => router.replace('/commander/dashboard'), 1500);
                } else {
                    // Redirect to hub with intro + phone verification prompt
                    sessionStorage.setItem('just_authenticated', 'true');
                    sessionStorage.setItem('needs_phone_verify', user.id);
                    setTimeout(() => router.replace('/hub'), 1500);
                }

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
