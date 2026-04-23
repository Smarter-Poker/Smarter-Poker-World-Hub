import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getAccessToken } from '../../lib/authUtils';
import toast from '../../stores/toastStore';

export default function ViralGrowthModule({ currentUser }) {
    const [referralCode, setReferralCode] = useState(null);
    const [referrals, setReferrals] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!currentUser) return;

        const loadData = async () => {
            try {
                // Get or auto-generate referral code via API — read token from localStorage (no lock contention)
                const token = getAccessToken();
                if (token) {
                    const res = await fetch('/api/social/referral', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        setReferralCode(data.referralCode);
                    }
                }

                // If API failed, fallback to direct profile query
                if (!referralCode) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('referral_code')
                        .eq('id', currentUser.id)
                        .maybeSingle();
                    
                    if (profile?.referral_code) {
                        setReferralCode(profile.referral_code);
                    }
                }

                // Get referrals
                const { data: refs } = await supabase
                    .from('referrals')
                    .select('*, referee:referee_id(username, full_name, avatar_url)')
                    .eq('referrer_id', currentUser.id)
                    .order('created_at', { ascending: false });

                if (refs) setReferrals(refs);
            } catch (e) {
                console.warn('Error loading referrals:', e);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [currentUser]);

    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (!referralCode) return;
        const shareUrl = `https://smarter.poker/?ref=${referralCode}`;
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
                    }}>🚀</div>
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
                    Both you and your friend earn 500 Diamonds upon joining!
                </div>
            </div>

            {referrals.length > 0 && (
                <div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Your Referrals ({referrals.length})</div>
                    <div style={{ display: 'grid', gap: 8, maxHeight: 150, overflowY: 'auto' }}>
                        {referrals.map(ref => (
                            <div key={ref.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: 8 }}>
                                <img src={ref.referee?.avatar_url || '/default-avatar.png'} alt="" style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #444' }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600 }}>{ref.referee?.full_name || ref.referee?.username || 'Unknown User'}</div>
                                    <div style={{ fontSize: 11, color: '#00FF88' }}>{ref.status === 'completed' ? '+500 Diamonds Earned' : 'Pending...'}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
