/* ═══════════════════════════════════════════════════════════════════════════
   AUTH CALLBACK — Handles Supabase OAuth callback
   Pages Router compatible version
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function AuthCallback() {
    const router = useRouter();

    useEffect(() => {
        // The hash fragment contains the access token from Supabase
        // This page just redirects to the hub after the auth flow completes
        const handleCallback = async () => {
            // Give Supabase time to process the auth
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Redirect to hub
            router.replace('/hub');
        };

        handleCallback();
    }, [router]);

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0a0f',
            color: '#00d4ff',
            fontFamily: 'Orbitron, sans-serif',
        }}>
            Authenticating...
        </div>
    );
}
