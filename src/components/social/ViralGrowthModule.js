import React, { useState, useEffect } from 'react';
import { getAccessToken } from '../../lib/authUtils';
import toast from '../../stores/toastStore';

export default function ViralGrowthModule({ currentUser }) {
    const [referralCode, setReferralCode] = useState(null);
    const [shareUrl, setShareUrl] = useState(null);
    const [bonus, setBonus] = useState({ referrer: 500, referee: 100 });
    const [referrals, setReferrals] = useState([]);
    const [loading, setLoading] = useState(true);

    // One source for the code, the link and the list: /api/social/referral.
    // (2026-10-17) This used to build smarter.poker/?ref=<code>, a link the
    // homepage dropped, and to embed referee:referee_id(...), which points at
    // auth.users rather than profiles and so never returned a list.
    useEffect(() => {
        if (!currentUser) return;
        let cancelled = false;
        const loadData = async () => {
            try {
                const token = getAccessToken();
                if (!token) return;
                const res = await fetch('/api/social/referral', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled) return;
                setReferralCode(data.referralCode || null);
                setShareUrl(data.shareUrl || null);
                setBonus({ referrer: data.bonusPerReferral || 500, referee: data.refereeBonus || 100 });
                setReferrals(Array.isArray(data.recentReferrals) ? data.recentReferrals : []);
            } catch (e) {
                console.warn('Error loading referrals:', e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        loadData();
        return () => { cancelled = true; };
    }, [currentUser]);

    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (!shareUrl) return;
        navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        toast.success('Referral link copied!');
        setTimeout(() => setCopied(false), 2000);
    };

    const handleCopyCode = () => {
        if (!referralCode) return;
        navigator.clipboard.writeText(referralCode);
        toast.success('Referral code copied!');
    };

    if (loading) return null;

    return (
        <div style={{
            background: 'linear-gradient(135deg, #1A1A2E 0%, #16213E 100%)',
            borderRadius: 12, padding: 20, color: 'white', marginBottom: 16,
            border: '1px solid rgba(0, 255, 136, 0.3)',
            boxShadow: '0 4px 20px rgba(0, 255, 136, 0.15)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #00FF88, #00BFFF)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
                    }}>{'\u2197'}</div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>VIRAL GROWTH</div>
                        <div style={{ fontSize: 11, opacity: 0.8 }}>Invite Friends & Earn Diamonds</div>
                    </div>
                </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 16, textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#ccc', marginBottom: 8 }}>Your Unique Invite Code</div>
                <div 
                    onClick={handleCopyCode}
                    style={{ 
                        fontSize: 24, fontWeight: 800, color: '#00FF88', letterSpacing: 2, 
                        background: 'rgba(0,0,0,0.3)', padding: '8px 16px', borderRadius: 8,
                        cursor: 'pointer', display: 'inline-block', border: '1px dashed #00FF88'
                    }}
                >
                    {referralCode || '---------'}
                </div>
                <button 
                    onClick={handleCopy}
                    style={{
                        display: 'block', margin: '12px auto 0', padding: '10px 24px',
                        background: copied ? '#00FF88' : 'linear-gradient(135deg, #00FF88, #00BFFF)',
                        color: copied ? '#000' : '#000', border: 'none', borderRadius: 8,
                        fontWeight: 700, fontSize: 14, cursor: 'pointer',
                        transition: 'all 0.3s ease'
                    }}
                >{copied ? 'Copied!' : 'Share Invite Link'}</button>
                <div style={{ fontSize: 12, marginTop: 8, color: '#FFD700' }}>
                    You Earn {bonus.referrer} Diamonds And Your Friend Earns {bonus.referee} The Moment They Confirm Their Email!
                </div>
            </div>

            {referrals.length > 0 && (
                <div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Your Referrals ({referrals.length})</div>
                    <div style={{ display: 'grid', gap: 8, maxHeight: 150, overflowY: 'auto' }}>
                        {referrals.map(ref => (
                            <div key={ref.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: 8 }}>
                                <img src={ref.referredUser?.avatar_url || '/default-avatar.png'} alt="" style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #444' }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600 }}>{ref.referredUser?.username || 'Player'}</div>
                                    <div style={{ fontSize: 11, color: '#00FF88' }}>{ref.status === 'completed' ? `+${bonus.referrer} Diamonds Earned` : 'Pending...'}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
