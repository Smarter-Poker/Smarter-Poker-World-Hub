/**
 * Claim Token Page — /claim/[token]
 * Employee visits this URL to link their Smarter.Poker account to a venue
 * Uses Pages Router standards — same patterns as hub pages
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { getAccessToken, getAuthUser } from '../../src/lib/authUtils';

export default function ClaimPage() {
    const router = useRouter();
    const { token } = router.query;

    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [claiming, setClaiming] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    // Check auth on mount
    useEffect(() => {    const _c = new AbortController();

        const checkAuth = async () => {
            try {
                const authUser = getAuthUser();
                if (authUser?.id) {
                    setUser(authUser);
                } else {
                    const returnUrl = encodeURIComponent('/claim/' + (token || ''));
                    router.push('/auth/login?redirect=' + returnUrl);
                    return;
                }
            } catch (e) {
                console.warn('Auth check error:', e);
            }
            setLoading(false);
        };
        if (token) {
            checkAuth();
        }

    if (!router.isReady) return null;

    return () => _c.abort();
  }, [token]);

    const handleClaim = async () => {
        setClaiming(true);
        setError(null);
        try {
            const accessToken = getAccessToken();
            const res = await fetch('/api/employee/claim', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + (accessToken || ''),
                },
                body: JSON.stringify({ code: token }),
            });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const data = await res.json();
            if (!res.ok || !data.success) {
                setError(data.error || 'Failed to claim code');
            } else {
                setResult(data.data);
            }
        } catch (e) {
            setError('Network error - try again');
        }
        setClaiming(false);
    };

    // Colors
    const C = {
        bg: '#18191a', surface: '#242526', text: '#e4e6eb',
        textSec: '#b0b3b8', textMuted: '#65676b', blue: '#2374e1',
        border: '#3E4042', green: '#31a24c', red: '#f02849',
    };

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: C.bg, color: C.text,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}>
                <SEOHead title="Linking Account | Smarter.Poker" noindex={true} />
                <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    border: '3px solid #3a3b3c', borderTopColor: C.blue,
                    animation: 'spin 0.8s linear infinite',
                }} />
                <p style={{ color: C.textMuted, marginTop: 12, fontSize: 14 }}>Verifying Your Session...</p>
                <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', padding: 20,
            background: C.bg, color: C.text,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}>
            <SEOHead title="Link Your Account | Smarter.Poker" noindex={true} />

            <div style={{
                background: C.surface, border: '1px solid ' + C.border,
                borderRadius: 16, padding: '40px 32px', maxWidth: 440, width: '100%',
                textAlign: 'center', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 16,
            }}>
                {result ? (
                    <>
                        {/* SUCCESS STATE */}
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(49,162,76,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>✅</div>
                        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: C.text }}>Account Linked!</h1>
                        <p style={{ fontSize: 14, color: C.textSec, margin: 0, lineHeight: 1.5 }}>{result.message}</p>

                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: '#111', borderRadius: 8 }}>
                                <span style={{ fontSize: 16 }}>🏢</span>
                                <span style={{ fontSize: 14, color: '#ccc' }}>{result.venue_name}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: '#111', borderRadius: 8 }}>
                                <span style={{ fontSize: 16 }}>👤</span>
                                <span style={{ fontSize: 14, color: '#ccc' }}>{result.staff_name}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: '#111', borderRadius: 8 }}>
                                <span style={{ fontSize: 16 }}>💼</span>
                                <span style={{ fontSize: 14, color: '#ccc', textTransform: 'capitalize' }}>{result.role}</span>
                            </div>
                        </div>

                        <button
                            onClick={() => router.push('/hub/my-venues')}
                            style={{
                                width: '100%', padding: '14px 0', marginTop: 8,
                                background: C.blue, color: '#fff', border: 'none',
                                borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            Go To My Venues →
                        </button>
                    </>
                ) : (
                    <>
                        {/* CLAIM STATE */}
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(35,116,225,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🛡️</div>
                        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: C.text }}>Link Your Account</h1>
                        <p style={{ fontSize: 14, color: C.textSec, margin: 0, lineHeight: 1.5 }}>
                            Your Manager Has Invited You To Connect Your Smarter.Poker Account To Their Venue.
                        </p>

                        <div style={{
                            background: '#111', border: '1px solid ' + C.border,
                            borderRadius: 12, padding: '16px 24px', width: '100%',
                            display: 'flex', flexDirection: 'column', gap: 4,
                        }}>
                            <span style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>Claim Code</span>
                            <span style={{ fontSize: 28, fontWeight: 700, color: C.blue, letterSpacing: 4, fontFamily: 'monospace' }}>{token}</span>
                        </div>

                        {error && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                background: 'rgba(240,40,73,0.08)', border: '1px solid ' + C.red,
                                borderRadius: 8, padding: '10px 16px', width: '100%',
                                color: C.red, fontSize: 13,
                            }}>
                                <span>⚠️</span>
                                <span>{error}</span>
                            </div>
                        )}

                        <button
                            onClick={handleClaim}
                            disabled={claiming}
                            style={{
                                width: '100%', padding: '14px 0', marginTop: 8,
                                background: C.blue, color: '#fff', border: 'none',
                                borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer',
                                opacity: claiming ? 0.6 : 1,
                            }}
                        >
                            {claiming ? 'Linking...' : 'Confirm & Link Account'}
                        </button>

                        <button
                            onClick={() => router.push('/hub')}
                            style={{
                                width: '100%', padding: '12px 0',
                                background: 'transparent', color: C.textMuted,
                                border: '1px solid ' + C.border, borderRadius: 10,
                                fontSize: 14, cursor: 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
