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
import { getSafeUser } from '../../src/lib/authUtils';

export default function ProfileRedirect() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('Finding your profile...');

    useEffect(() => {
        let didRedirect = false;

        const redirectToProfile = async () => {
            try {
                // BULLETPROOF: Use getSafeUser for 3-level fallback
                setStatus('Authenticating...');
                const authUser = await getSafeUser(supabase);

                if (!authUser) {
                    // Not logged in — redirect to login
                    if (!didRedirect) {
                        didRedirect = true;
                        window.location.href = '/auth/login?redirect=/hub/profile';
                    }
                    return;
                }

                // Fetch username from profile
                setStatus('Loading your profile...');
                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('username')
                    .eq('id', authUser.id)
                    .single();

                if (error) {
                    console.error('[Profile] Profile query error:', error);
                }

                if (profile?.username && !didRedirect) {
                    // Redirect to their Facebook-style public profile
                    didRedirect = true;
                    // Use window.location.href for guaranteed navigation (router.replace can fail silently)
                    window.location.href = `/hub/user/${profile.username}`;
                } else if (!didRedirect) {
                    // No username set, go to edit page to set one
                    didRedirect = true;
                    window.location.href = '/hub/profile-edit';
                }
            } catch (e) {
                console.error('[Profile] Redirect error:', e);
                if (!didRedirect) {
                    didRedirect = true;
                    window.location.href = '/hub/profile-edit';
                }
            }
        };

        redirectToProfile();

        // SAFETY NET: If anything gets stuck, force redirect after 5s
        const safetyTimeout = setTimeout(() => {
            if (!didRedirect) {
                console.warn('[Profile] Safety timeout triggered — forcing redirect');
                didRedirect = true;
                window.location.href = '/hub/profile-edit';
            }
        }, 5000);

        return () => clearTimeout(safetyTimeout);
    }, []); // Empty deps — run once on mount only

    // Show loading spinner while redirecting
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
                {/* Animated spinner */}
                <div style={{
                    width: 48,
                    height: 48,
                    border: '3px solid rgba(255,255,255,0.1)',
                    borderTop: '3px solid #0084FF',
                    borderRadius: '50%',
                    animation: 'profileSpin 0.8s linear infinite',
                    margin: '0 auto 16px',
                }} />
                <div style={{ opacity: 0.7, fontSize: 14 }}>{status}</div>
                <style jsx>{`
                    @keyframes profileSpin {
                        to { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        </div>
    );
}
