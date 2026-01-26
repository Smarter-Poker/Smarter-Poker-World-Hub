/**
 * PROFILE PAGE - Facebook-Style Redirect
 * 
 * When users click "Profile", they see their own Facebook-style public profile
 * (same view others see when visiting /hub/user/[username])
 * 
 * Edit functionality is at /hub/profile-edit
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';

export default function ProfileRedirect() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const redirectToProfile = async () => {
            try {
                // Check for auth token in localStorage
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

                // Fetch username from profile
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('username')
                    .eq('id', authUser.id)
                    .single();

                if (profile?.username) {
                    // Redirect to their Facebook-style public profile
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

    // Show loading while redirecting
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
                <div style={{ fontSize: 32, marginBottom: 16 }}>♠️</div>
                <div style={{ opacity: 0.7 }}>Loading your profile...</div>
            </div>
        </div>
    );
}
