/**
 * ReferralCrewCard — Settings Section for Referral System
 * ═══════════════════════════════════════════════════════════════════════════
 * Shows referral code, copy/share buttons, stats, and recent referrals.
 * Designed to be dropped into the Settings page or Profile page.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';

const T = {
    bg: '#0a0a0a',
    card: '#18191a',
    border: '#3E4042',
    text: '#E4E6EB',
    textSec: '#B0B3B8',
    gold: '#FFD700',
    accent: '#4facfe',
    green: '#2ECC71',
};

function getAccessToken() {
    if (typeof window === 'undefined') return null;
    try {
        return JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}')?.access_token || null;
    } catch { return null; }
}

export default function ReferralCrewCard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');

    const fetchData = useCallback(async () => {
        try {
            const token = getAccessToken();
            const res = await fetch('/api/social/referral', {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (res.ok) {
                const d = await res.json();
                setData(d);
            } else {
                setError('Failed to load referral data');
            }
        } catch {
            setError('Network error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const copyCode = useCallback(async () => {
        if (!data?.referralCode) return;
        try {
            await navigator.clipboard.writeText(data.shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = data.shareUrl;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [data?.shareUrl, data?.referralCode]);

    const shareReferral = useCallback(async () => {
        if (!data?.shareUrl) return;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Join Smarter.Poker',
                    text: `Join me on Smarter.Poker and get ${data.bonusPerReferral} bonus diamonds!`,
                    url: data.shareUrl,
                });
            } catch (e) { console.warn('[App] Handled exception:', e); }
        } else {
            copyCode();
        }
    }, [data, copyCode]);

    if (loading) {
        return (
            <div style={{ padding: 20, textAlign: 'center', color: T.textSec, fontSize: 13 }}>
                Loading referral data...
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ padding: 20, textAlign: 'center', color: '#E74C3C', fontSize: 13 }}>
                {error}
            </div>
        );
    }

    return (
        <div style={{
            background: 'rgba(255,255,255,0.02)', borderRadius: 14,
            border: `1px solid ${T.border}`, padding: 20,
        }}>
            {/* Header */}
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 4 }}>
                    Refer Friends, Earn Diamonds
                </div>
                <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.5 }}>
                    Share your referral link. You earn {data?.bonusPerReferral || 100} diamonds for each friend who joins!
                </div>
            </div>

            {/* Referral Code Display */}
            <div style={{
                background: 'rgba(255,215,0,0.05)', borderRadius: 10,
                border: `1px solid ${T.gold}22`, padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 12,
            }}>
                <div>
                    <div style={{ fontSize: 10, color: T.textSec, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Your Referral Code
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: T.gold, letterSpacing: 2, fontFamily: 'monospace' }}>
                        {data?.referralCode || '---'}
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button
                    onClick={copyCode}
                    style={{
                        flex: 1, padding: '10px 16px', borderRadius: 10,
                        background: copied ? 'rgba(46,204,113,0.15)' : 'rgba(79,172,254,0.1)',
                        border: `1px solid ${copied ? T.green : T.accent + '44'}`,
                        color: copied ? T.green : T.accent, fontWeight: 700, fontSize: 13,
                        cursor: 'pointer',
                    }}
                >
                    {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <button
                    onClick={shareReferral}
                    style={{
                        flex: 1, padding: '10px 16px', borderRadius: 10,
                        background: 'linear-gradient(135deg, #4facfe, #00f2fe)',
                        border: 'none', color: '#000', fontWeight: 800, fontSize: 13,
                        cursor: 'pointer',
                    }}
                >
                    Share
                </button>
            </div>

            {/* Stats */}
            <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                marginBottom: data?.recentReferrals?.length > 0 ? 16 : 0,
            }}>
                <div style={{
                    background: 'rgba(255,255,255,0.03)', borderRadius: 10,
                    border: `1px solid ${T.border}`, padding: '10px 14px', textAlign: 'center',
                }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: T.gold }}>
                        {data?.totalReferrals || 0}
                    </div>
                    <div style={{ fontSize: 11, color: T.textSec }}>Friends Referred</div>
                </div>
                <div style={{
                    background: 'rgba(255,255,255,0.03)', borderRadius: 10,
                    border: `1px solid ${T.border}`, padding: '10px 14px', textAlign: 'center',
                }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: T.accent }}>
                        {data?.totalDiamondsEarned || 0}
                    </div>
                    <div style={{ fontSize: 11, color: T.textSec }}>Diamonds Earned</div>
                </div>
            </div>

            {/* Recent Referrals */}
            {data?.recentReferrals?.length > 0 && (
                <div>
                    <div style={{ fontSize: 12, color: T.textSec, fontWeight: 600, marginBottom: 8 }}>
                        Recent Referrals
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {data.recentReferrals.slice(0, 5).map(ref => (
                            <div key={ref.id} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '6px 10px', borderRadius: 8,
                                background: 'rgba(255,255,255,0.02)',
                                border: `1px solid ${T.border}`,
                            }}>
                                <div style={{
                                    width: 24, height: 24, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #4facfe, #00f2fe)',
                                    overflow: 'hidden', flexShrink: 0,
                                }}>
                                    {ref.referredUser?.avatar_url ? (
                                        <img src={ref.referredUser.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <div style={{
                                            width: '100%', height: '100%', display: 'flex',
                                            alignItems: 'center', justifyContent: 'center',
                                            fontSize: 10, fontWeight: 800, color: '#000',
                                        }}>
                                            {(ref.referredUser?.username || '?').charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                </div>
                                <span style={{ color: T.text, fontSize: 13, fontWeight: 600, flex: 1 }}>
                                    {ref.referredUser?.username || 'Player'}
                                </span>
                                <span style={{
                                    color: T.green, fontSize: 12, fontWeight: 700,
                                    background: 'rgba(46,204,113,0.1)', padding: '2px 8px', borderRadius: 6,
                                }}>
                                    +{data.bonusPerReferral}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
