/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTH RESET PAGE — Force Clean Authentication
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This page completely clears ALL authentication state and forces a fresh login.
 * Use when users get stuck with 0/0/LV1 header due to corrupted sessions.
 * 
 * URL: https://smarter.poker/hub/reset-auth
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';

export default function ResetAuthPage() {
    const router = useRouter();
    const [status, setStatus] = useState('Clearing all auth data...');
    const [done, setDone] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function resetAuth() {
            try {
                // Step 1: Sign out from Supabase (server-side)
                setStatus('Signing out from server...');
                await supabase.auth.signOut();

                // Step 2: Clear ALL localStorage keys related to auth
                setStatus('Clearing local storage...');
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && (
                        key.includes('auth') ||
                        key.includes('sb-') ||
                        key.includes('supabase') ||
                        key.includes('smarter-poker-auth') ||
                        key.includes('migration')
                    )) {
                        keysToRemove.push(key);
                    }
                }

                console.log('[Reset Auth] Removing keys:', keysToRemove);
                keysToRemove.forEach(key => localStorage.removeItem(key));

                // Step 3: Clear sessionStorage
                setStatus('Clearing session storage...');
                sessionStorage.clear();

                // Step 4: Clear all cookies for this domain
                setStatus('Clearing cookies...');
                document.cookie.split(';').forEach(cookie => {
                    const name = cookie.split('=')[0].trim();
                    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
                });

                // Step 5: Clear service worker caches
                setStatus('Clearing service worker caches...');
                if ('caches' in window) {
                    const cacheNames = await caches.keys();
                    await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
                }

                setStatus('Auth reset complete! Ready for fresh login.');
                setDone(true);

            } catch (err) {
                console.error('[Reset Auth] Error:', err);
                setError(err.message);
            }
        }

        resetAuth();
    }, []);

    const handleLogin = () => {
        router.push('/hub/profile');
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0a0e1a 0%, #1a1f35 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'system-ui, sans-serif',
            color: 'white',
            padding: 20,
            textAlign: 'center'
        }}>
            <h1 style={{
                fontSize: 32,
                marginBottom: 20,
                background: 'linear-gradient(135deg, #00f5ff, #0088ff)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
            }}>
                🔄 Auth Reset
            </h1>

            <div style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(0,136,255,0.3)',
                borderRadius: 16,
                padding: 30,
                maxWidth: 400,
                width: '100%'
            }}>
                {error ? (
                    <>
                        <p style={{ color: '#ff6b6b', marginBottom: 20 }}>
                            ❌ Error: {error}
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                padding: '12px 24px',
                                borderRadius: 8,
                                border: 'none',
                                background: 'linear-gradient(135deg, #0088ff, #00d4ff)',
                                color: 'white',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            Try Again
                        </button>
                    </>
                ) : done ? (
                    <>
                        <p style={{
                            color: '#4ade80',
                            fontSize: 20,
                            marginBottom: 10
                        }}>
                            ✅ Auth Reset Complete
                        </p>
                        <p style={{
                            color: 'rgba(255,255,255,0.7)',
                            marginBottom: 20,
                            lineHeight: 1.6
                        }}>
                            All authentication data has been cleared. Click below to sign in with a fresh session.
                        </p>
                        <button
                            onClick={handleLogin}
                            style={{
                                padding: '14px 28px',
                                borderRadius: 8,
                                border: 'none',
                                background: 'linear-gradient(135deg, #0088ff, #00d4ff)',
                                color: 'white',
                                fontWeight: 600,
                                fontSize: 16,
                                cursor: 'pointer',
                                boxShadow: '0 4px 20px rgba(0,136,255,0.4)'
                            }}
                        >
                            Sign In Now
                        </button>
                    </>
                ) : (
                    <>
                        <div style={{
                            width: 50,
                            height: 50,
                            border: '3px solid rgba(0,136,255,0.3)',
                            borderTopColor: '#0088ff',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            margin: '0 auto 20px'
                        }} />
                        <p style={{ color: 'rgba(255,255,255,0.8)' }}>
                            {status}
                        </p>
                    </>
                )}
            </div>

            <style jsx>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
