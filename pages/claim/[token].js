/**
 * Claim Token Page — /claim/[token]
 * Employee visits this URL to link their Smarter.Poker account to a venue
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../../src/lib/supabase';
import { Shield, CheckCircle, XCircle, Loader2, Building2, User, Briefcase } from 'lucide-react';

export default function ClaimPage() {
    const router = useRouter();
    const { token } = router.query;

    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [claiming, setClaiming] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [tokenInfo, setTokenInfo] = useState(null);

    // Check auth
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                    setUser(session.user);
                } else {
                    // Redirect to login with return URL
                    const returnUrl = encodeURIComponent(`/claim/${token}`);
                    router.push(`/login?redirect=${returnUrl}`);
                    return;
                }
            } catch { }
            setLoading(false);
        };
        if (token) checkAuth();
    }, [token]);

    const handleClaim = async () => {
        setClaiming(true);
        setError(null);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/employee/claim', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({ code: token }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setError(data.error || 'Failed to claim code');
            } else {
                setResult(data.data);
            }
        } catch (e) {
            setError('Network error — try again');
        } finally {
            setClaiming(false);
        }
    };

    if (loading) {
        return (
            <>
                <Head><title>Linking Account | Smarter.Poker</title></Head>
                <div style={styles.page}>
                    <Loader2 size={40} style={{ animation: 'spin 1s linear infinite' }} color="#1877F2" />
                    <p style={styles.loadingText}>Verifying your session...</p>
                </div>
            </>
        );
    }

    return (
        <>
            <Head><title>Link Your Account | Smarter.Poker</title></Head>
            <style jsx global>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        body { margin: 0; background: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      `}</style>

            <div style={styles.page}>
                <div style={styles.card}>
                    {result ? (
                        /* SUCCESS STATE */
                        <>
                            <CheckCircle size={56} color="#22C55E" />
                            <h1 style={styles.title}>Account Linked!</h1>
                            <p style={styles.subtitle}>{result.message}</p>
                            <div style={styles.infoRow}>
                                <Building2 size={18} color="#888" />
                                <span style={styles.infoText}>{result.venue_name}</span>
                            </div>
                            <div style={styles.infoRow}>
                                <User size={18} color="#888" />
                                <span style={styles.infoText}>{result.staff_name}</span>
                            </div>
                            <div style={styles.infoRow}>
                                <Briefcase size={18} color="#888" />
                                <span style={{ ...styles.infoText, textTransform: 'capitalize' }}>{result.role}</span>
                            </div>
                            <button style={styles.primaryBtn} onClick={() => router.push('/hub/my-venues')}>
                                Go to My Venues →
                            </button>
                        </>
                    ) : (
                        /* CLAIM STATE */
                        <>
                            <Shield size={56} color="#1877F2" />
                            <h1 style={styles.title}>Link Your Account</h1>
                            <p style={styles.subtitle}>
                                Your manager has invited you to connect your Smarter.Poker account to their venue.
                            </p>
                            <div style={styles.codeDisplay}>
                                <span style={styles.codeLabel}>Claim Code</span>
                                <span style={styles.codeValue}>{token}</span>
                            </div>
                            {error && (
                                <div style={styles.errorBox}>
                                    <XCircle size={18} color="#EF4444" />
                                    <span>{error}</span>
                                </div>
                            )}
                            <button
                                style={{ ...styles.primaryBtn, opacity: claiming ? 0.6 : 1 }}
                                onClick={handleClaim}
                                disabled={claiming}
                            >
                                {claiming ? 'Linking...' : 'Confirm & Link Account'}
                            </button>
                            <button style={styles.secondaryBtn} onClick={() => router.push('/hub')}>
                                Cancel
                            </button>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

const styles = {
    page: {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'linear-gradient(180deg, #0a0a0a 0%, #111827 100%)',
        color: '#fff',
    },
    loadingText: { color: '#888', marginTop: 12, fontSize: 14 },
    card: {
        background: '#1a1a2e',
        border: '1px solid #333',
        borderRadius: 16,
        padding: '40px 32px',
        maxWidth: 440,
        width: '100%',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: 700,
        margin: 0,
        color: '#fff',
    },
    subtitle: {
        fontSize: 14,
        color: '#999',
        margin: 0,
        lineHeight: 1.5,
    },
    codeDisplay: {
        background: '#111',
        border: '1px solid #333',
        borderRadius: 12,
        padding: '16px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        width: '100%',
    },
    codeLabel: { fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 1 },
    codeValue: { fontSize: 28, fontWeight: 700, color: '#1877F2', letterSpacing: 4, fontFamily: 'monospace' },
    infoRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 16px',
        background: '#111',
        borderRadius: 8,
        width: '100%',
    },
    infoText: { fontSize: 14, color: '#ccc' },
    errorBox: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: '#1a0000',
        border: '1px solid #EF4444',
        borderRadius: 8,
        padding: '10px 16px',
        width: '100%',
        color: '#EF4444',
        fontSize: 13,
    },
    primaryBtn: {
        width: '100%',
        padding: '14px 0',
        background: '#1877F2',
        color: '#fff',
        border: 'none',
        borderRadius: 10,
        fontSize: 15,
        fontWeight: 600,
        cursor: 'pointer',
        marginTop: 8,
    },
    secondaryBtn: {
        width: '100%',
        padding: '12px 0',
        background: 'transparent',
        color: '#888',
        border: '1px solid #333',
        borderRadius: 10,
        fontSize: 14,
        cursor: 'pointer',
    },
};
