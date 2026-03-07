/**
 * PROFILE PAGE - SmarterPoker-Style Redirect
 * 
 * When users click "Profile", they see their own SmarterPoker-style public profile
 * (same view others see when visiting /hub/user/[username])
 * 
 * Edit functionality is at /hub/profile-edit
 * 
 * PERFORMANCE:
 * - Reads cached username from localStorage for instant redirect
 * - Falls back to Supabase query only if cache is cold
 * - Caches username on successful fetch for future visits
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';

const CACHE_KEY = 'sp-profile-username';

export default function ProfileRedirect() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const redirectToProfile = async () => {
            try {
                // ── STEP 1: Get auth user from localStorage (instant, no network) ──
                let authUser = null;

                // Try unified storage key first
                const unifiedToken = localStorage.getItem('smarter-poker-auth');
                if (unifiedToken) {
                    try {
                        const tokenData = JSON.parse(unifiedToken);
                        authUser = tokenData?.user || null;
                    } catch (e) { /* ignore */ }
                }

                // Fallback: legacy Supabase keys
                if (!authUser) {
                    const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
                    if (sbKeys.length > 0) {
                        try {
                            const tokenData = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}');
                            authUser = tokenData?.user || null;
                        } catch (e) { /* ignore */ }
                    }
                }

                if (!authUser) {
                    // Not logged in, redirect to login
                    router.replace('/auth/login?redirect=/hub/profile');
                    return;
                }

                // ── STEP 2: Check cached username (instant redirect) ──
                try {
                    const cached = localStorage.getItem(CACHE_KEY);
                    if (cached) {
                        const { userId, username, ts } = JSON.parse(cached);
                        // Use cache if same user and less than 1 hour old
                        if (userId === authUser.id && username && (Date.now() - ts) < 3600000) {
                            router.replace(`/hub/user/${username}`);
                            return;
                        }
                    }
                } catch (e) { /* ignore stale cache */ }

                // ── STEP 3: Fetch username from Supabase (network call) ──
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('username')
                    .eq('id', authUser.id)
                    .maybeSingle();

                if (profile?.username) {
                    // Cache for next time
                    try {
                        localStorage.setItem(CACHE_KEY, JSON.stringify({
                            userId: authUser.id,
                            username: profile.username,
                            ts: Date.now()
                        }));
                    } catch (e) { /* ignore quota errors */ }

                    // Redirect to their SmarterPoker-style public profile
                    router.replace(`/hub/user/${profile.username}`);
                } else {
                    // No username set, go to edit page to set one
                    router.replace('/hub/profile-edit');
                }
            } catch (e) {
                console.error('[Profile] Redirect error:', e);
                router.replace('/hub/profile-edit');
            }
        };

        redirectToProfile();
    }, [router]);

    // Show Smarter.Poker logo while redirecting
    return (
        <div style={{
            minHeight: '100vh',
            background: '#0a0e1a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white'
        }}>
            <div style={{ textAlign: 'center' }}>
                {/* Smarter.Poker logo with pulse animation */}
                <img
                    src="/smarter-poker-logo-transparent.png"
                    alt="Smarter.Poker"
                    width={72}
                    height={72}
                    style={{
                        marginBottom: 16,
                        animation: 'profilePulse 1.5s ease-in-out infinite',
                    }}
                />
                <div style={{ opacity: 0.7, fontSize: 14 }}>Loading Your Profile...</div>
                <style jsx>{`
                    @keyframes profilePulse {
                        0%, 100% { opacity: 1; transform: scale(1); }
                        50% { opacity: 0.6; transform: scale(0.95); }
                    }
                `}</style>
            </div>
        </div>
    );
}
