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
import { getAuthUser } from '../../src/lib/authUtils';

export default function ProfileRedirect() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const redirectToProfile = async () => {
            try {
                // Get authenticated user from Supabase session
                let authUser = null;
                try {
                    const { data: { user: gu } } = await supabase.auth.getUser();
                    authUser = gu;
                } catch (_) { /* AbortError on Safari */ }

                // Fallback 1: recover from session if getUser threw
                if (!authUser) {
                    try {
                        const { data: { session } } = await supabase.auth.getSession();
                        authUser = session?.user || null;
                    } catch (_) { /* ignore */ }
                }

                // Fallback 2: read directly from localStorage (bypasses navigator.locks AbortError)
                if (!authUser) {
                    try {
                        authUser = getAuthUser();
                    } catch (_) { /* ignore */ }
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
                <div style={{ fontSize: 32, marginBottom: 16 }}>s</div>
                <div style={{ opacity: 0.7 }}>Loading Your Profile...</div>
            </div>
        </div>
    );
}
