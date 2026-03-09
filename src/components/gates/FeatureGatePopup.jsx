/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FEATURE GATE POPUP — Action-Interceptor Upgrade Modal
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Shows a premium metallic popup when non-VIP users attempt to USE
 * gated functionality (search, interact, etc). Users can explore pages
 * freely but this pops up on action attempts.
 * 
 * Design: Metallic card with two clickable panels:
 *   1. Gold: 150💎 All-Access Pass (all features, 24hrs)
 *   2. Blue: 25💎 Single Feature Access (24hrs)
 *   Bottom: "Want unlimited? GET VIP →" redirects to VIP membership
 * 
 * Both panels are fully clickable cards (no hover effects).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useAvatar } from '../../contexts/AvatarContext';
import toast from '../../stores/toastStore';
import {
    checkFeatureAccess,
    purchaseFeatureAccess,
    purchaseDailyUnlockAll,
    FEATURE_CONFIG
} from '../../lib/gates/premiumFeatureGate';

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVE PASS COUNTDOWN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export function ActivePassCountdown({ expiresAt, label = "Pass" }) {
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
        if (!expiresAt) return;
        const target = new Date(expiresAt).getTime();
        const update = () => {
            const now = Date.now();
            const diff = target - now;
            if (diff <= 0) {
                setTimeLeft('Expired');
                return;
            }
            const h = Math.floor(diff / (1000 * 60 * 60));
            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, '0');
            const s = Math.floor((diff % (1000 * 60)) / 1000).toString().padStart(2, '0');
            setTimeLeft(`${h}h ${m}m ${s}s`);
        };
        update();
        const int = setInterval(update, 1000);
        return () => clearInterval(int);
    }, [expiresAt]);

    if (!expiresAt || timeLeft === 'Expired') return null;

    return (
        <div style={{
            display: 'inline-flex', padding: '4px 8px',
            background: 'rgba(35, 116, 225, 0.1)', border: '1px solid rgba(35, 116, 225, 0.3)',
            borderRadius: 6, color: '#2374e1', fontSize: 11, fontWeight: 700,
            alignItems: 'center', gap: 6, letterSpacing: '0.05em'
        }}>
            <span style={{ fontSize: 13 }}>⏳</span>{label} ACTIVE: {timeLeft}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// useFeatureGate HOOK — The action-interceptor pattern
// Pages call guardAction() before performing gated operations.
// If user has access, the action runs. Otherwise, the popup shows.
// ═══════════════════════════════════════════════════════════════════════════
export function useFeatureGate(featureKey) {
    const { user, isVip: contextIsVip, initializing } = useAvatar();
    const userId = user?.id;

    const [hasAccess, setHasAccess] = useState(false);
    const [accessData, setAccessData] = useState({ isVip: false, expiresAt: null, diamonds: 0 });
    const [showPopup, setShowPopup] = useState(false);
    const [loading, setLoading] = useState(true);

    // ═══════════════════════════════════════════════════════════════
    // TRIPLE-FALLBACK VIP CHECK — never lock out a VIP user
    // Memoized to prevent infinite useEffect re-triggers
    // ═══════════════════════════════════════════════════════════════
    const isVipTriple = useMemo(() => {
        if (contextIsVip) return true;
        if (typeof window !== 'undefined') {
            try { if (localStorage.getItem('sp-vip-status') === 'true') return true; } catch (e) { }
        }
        if (user?.user_metadata?.is_vip) return true;
        return false;
    }, [contextIsVip, user?.user_metadata?.is_vip]);

    useEffect(() => {
        if (initializing) {
            setLoading(true);
            return;
        }

        // VIP users ALWAYS have access — no exceptions
        if (isVipTriple) {
            setHasAccess(true);
            setAccessData({ isVip: true, expiresAt: null, diamonds: 0 });
            setLoading(false);
            return;
        }

        // Non-VIP: check day pass
        if (userId) {
            checkFeatureAccess(userId, featureKey).then(result => {
                setHasAccess(result.hasAccess);
                setAccessData(result);
                setLoading(false);
            }).catch(() => {
                setHasAccess(false);
                setLoading(false);
            });
        } else {
            setHasAccess(false);
            setLoading(false);
        }
    }, [userId, featureKey, contextIsVip, initializing, isVipTriple]);

    // ═══════════════════════════════════════════════════════════════
    // BUS LISTENER: React to cross-component access changes in real time
    // Handles: VIP granted mid-session, day pass purchased on another page
    // ═══════════════════════════════════════════════════════════════
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleAccessChange = (e) => {
            const detail = e.detail || {};
            // If this feature or daily_unlock_all was just purchased, grant access
            if (detail.featureKey === featureKey || detail.featureKey === 'daily_unlock_all') {
                console.log(`[useFeatureGate] 🚌 Access granted via bus for ${featureKey}`);
                setHasAccess(true);
            }
        };

        const handleVipChange = (e) => {
            if (e.detail?.vipGranted !== false) {
                console.log(`[useFeatureGate] 🚌 VIP granted via bus — unlocking ${featureKey}`);
                setHasAccess(true);
            }
        };

        window.addEventListener('feature-access-changed', handleAccessChange);
        window.addEventListener('vip-status-changed', handleVipChange);
        return () => {
            window.removeEventListener('feature-access-changed', handleAccessChange);
            window.removeEventListener('vip-status-changed', handleVipChange);
        };
    }, [featureKey]);

    // guardAction: wraps any function - if user has access, run it, else show popup
    // OPTIMISTIC: During loading, VIP users (triple-fallback) always pass through.
    // Non-VIP users during loading also pass to avoid false popups on first render.
    const guardAction = useCallback((actionFn) => {
        if (isVipTriple || hasAccess) {
            if (actionFn) actionFn();
            return true;
        }
        // While still loading, don't flash a popup — let the action through
        // so VIP users or users with day passes aren't blocked by slow init
        if (loading) {
            if (actionFn) actionFn();
            return true;
        }
        setShowPopup(true);
        return false;
    }, [hasAccess, isVipTriple, loading]);

    const closePopup = useCallback(() => setShowPopup(false), []);

    const onAccessGranted = useCallback(() => {
        setHasAccess(true);
        setShowPopup(false);
    }, []);

    // The popup component, ready to render
    const UpgradePopup = showPopup ? (
        <FeatureGatePopup
            userId={userId}
            featureKey={featureKey}
            diamonds={accessData.diamonds}
            onClose={closePopup}
            onAccessGranted={onAccessGranted}
        />
    ) : null;

    return {
        hasAccess: isVipTriple || hasAccess,
        isVip: isVipTriple,
        expiresAt: accessData?.expiresAt || null,
        loading,
        guardAction,
        showUpgradePopup: () => setShowPopup(true),
        closePopup,
        UpgradePopup,
        ActivePassCountdown: (!isVipTriple && accessData?.expiresAt) ? (
            <ActivePassCountdown expiresAt={accessData.expiresAt} label={FEATURE_CONFIG[featureKey]?.label || 'Feature'} />
        ) : null,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE GATE POPUP COMPONENT — Metallic card design
// ═══════════════════════════════════════════════════════════════════════════
export default function FeatureGatePopup({ userId, featureKey, diamonds: initialDiamonds, onClose, onAccessGranted }) {
    const router = useRouter();
    const config = FEATURE_CONFIG[featureKey] || { cost: 25, label: featureKey, durationHours: 24 };
    const cost = config.cost;

    const [diamonds, setDiamonds] = useState(initialDiamonds || 0);
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [isUnlockingAll, setIsUnlockingAll] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    // Re-fetch balance on mount to be current (with 1 retry for resilience)
    useEffect(() => {
        if (!userId) return;
        const fetchAccess = async (retries = 1) => {
            try {
                const result = await checkFeatureAccess(userId, featureKey);
                setDiamonds(result.diamonds || 0);
                if (result.hasAccess) {
                    // They already have access now (maybe purchased elsewhere)
                    onAccessGranted?.();
                }
            } catch (err) {
                if (retries > 0) {
                    setTimeout(() => fetchAccess(retries - 1), 1000); // Wait 1s and retry
                }
            }
        };
        fetchAccess();
    }, [userId, featureKey]);

    // 🚌 BUS LISTENER: Keep diamond balance live in the popup
    // If diamonds change on another page/component, this updates immediately
    useEffect(() => {
        if (typeof window === 'undefined' || !userId) return;
        const refreshBalance = (e) => {
            if (e?.detail?.newBalance !== undefined) {
                setDiamonds(e.detail.newBalance);
            } else {
                checkFeatureAccess(userId, featureKey).then(result => {
                    setDiamonds(result.diamonds || 0);
                }).catch(() => { });
            }
        };
        window.addEventListener('diamond-balance-refresh', refreshBalance);
        return () => window.removeEventListener('diamond-balance-refresh', refreshBalance);
    }, [userId, featureKey]);

    // Purchase single feature access (25💎)
    const handleUnlockSingle = async () => {
        if (!userId) { setError('Please log in first'); return; }
        setIsUnlocking(true);
        setError(null);

        try {
            const result = await purchaseFeatureAccess(
                userId, featureKey, cost, config.durationHours,
                `${config.label} - ${config.durationHours} Hour Access`
            );

            if (result.success) {
                setSuccess(true);
                if (result.newBalance !== undefined) setDiamonds(result.newBalance);
                // 🚌 BUS: Notify other components of balance change + access grant
                if (typeof window !== 'undefined') {
                    // diamond-balance-refresh is dispatched by purchaseFeatureAccess
                    window.dispatchEvent(new CustomEvent('feature-access-changed', {
                        detail: { featureKey, hasAccess: true, newBalance: result.newBalance }
                    }));
                }
                setTimeout(() => {
                    onAccessGranted?.();
                    if (toast?.success) toast.success(`🎉 ${config.label} unlocked for ${config.durationHours} hours!`);
                }, 1200);
            } else {
                setError(result.error);
            }
        } catch (err) {
            console.error('[FeatureGatePopup] Purchase single failed:', err);
            setError('Something went wrong. Please try again.');
        }
        setIsUnlocking(false);
    };

    // Purchase daily all-access pass (150💎)
    const handleUnlockAll = async () => {
        if (!userId) { setError('Please log in first'); return; }
        setIsUnlockingAll(true);
        setError(null);

        try {
            const result = await purchaseDailyUnlockAll(userId);

            if (result.success) {
                setSuccess(true);
                if (result.newBalance !== undefined) setDiamonds(result.newBalance);
                // 🚌 BUS: Notify other components of balance change + access grant
                if (typeof window !== 'undefined') {
                    // diamond-balance-refresh is dispatched by purchaseDailyUnlockAll
                    window.dispatchEvent(new CustomEvent('feature-access-changed', {
                        detail: { featureKey: 'daily_unlock_all', hasAccess: true, newBalance: result.newBalance }
                    }));
                }
                setTimeout(() => {
                    onAccessGranted?.();
                    if (toast?.success) toast.success(`🎉 All Premium Features unlocked for 24 hours!`);
                }, 1200);
            } else {
                setError(result.error);
            }
        } catch (err) {
            console.error('[FeatureGatePopup] Purchase all-access failed:', err);
            setError('Something went wrong. Please try again.');
        }
        setIsUnlockingAll(false);
    };

    // Navigate to VIP membership page
    const handleGetVip = () => {
        onClose?.();
        router.push('/hub/diamond-store');
    };

    return (
        <>
            <style>{`
                @keyframes fgpFadeIn { from { opacity:0; transform:scale(0.92); } to { opacity:1; transform:scale(1); } }
                @keyframes fgpSpin   { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
                @keyframes fgpPulse  { 0%,100% { transform:scale(1); } 50% { transform:scale(1.03); } }
                @keyframes fgpCheckmark { 0% { transform:scale(0) rotate(-45deg); opacity:0; } 100% { transform:scale(1) rotate(0deg); opacity:1; } }
            `}</style>

            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.88)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 99999,
                    padding: 16,
                }}
            >
                {/* Card */}
                <div
                    onClick={e => e.stopPropagation()}
                    style={{
                        width: '100%',
                        maxWidth: 380,
                        background: 'linear-gradient(160deg, #3a3d42 0%, #2a2d32 12%, #1a1d22 50%, #2a2d32 88%, #3a3d42 100%)',
                        borderRadius: 18,
                        border: '3px solid #5a5e65',
                        boxShadow: '0 0 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.4)',
                        overflow: 'hidden',
                        animation: 'fgpFadeIn 0.25s ease-out',
                        position: 'relative',
                    }}
                >
                    {/* Close button */}
                    <button
                        onClick={onClose}
                        style={{
                            position: 'absolute', top: 10, right: 10, zIndex: 10,
                            width: 28, height: 28, borderRadius: '50%',
                            background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)',
                            color: 'rgba(255,255,255,0.5)', fontSize: 16,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', lineHeight: 1,
                        }}
                    >✕</button>

                    {/* Success overlay */}
                    {success && (
                        <div style={{
                            position: 'absolute', inset: 0, zIndex: 20,
                            background: 'rgba(10,15,20,0.95)',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', gap: 12,
                        }}>
                            <div style={{
                                width: 64, height: 64, borderRadius: '50%',
                                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                animation: 'fgpCheckmark 0.5s ease-out',
                                boxShadow: '0 0 30px rgba(34,197,94,0.4)',
                            }}>
                                <span style={{ fontSize: 32, color: '#fff' }}>✓</span>
                            </div>
                            <span style={{
                                fontFamily: "'Orbitron', sans-serif", fontSize: 16,
                                fontWeight: 700, letterSpacing: '0.12em', color: '#22c55e',
                            }}>ACCESS GRANTED</span>
                        </div>
                    )}

                    <div style={{ padding: '20px 16px 16px' }}>
                        {/* ═══ GOLD BOX: ALL-ACCESS PASS ═══ */}
                        <div
                            onClick={!isUnlockingAll && !isUnlocking && !success ? handleUnlockAll : undefined}
                            style={{
                                background: 'linear-gradient(180deg, #2a2520 0%, #1a1815 100%)',
                                border: '2px solid #c9a227',
                                borderRadius: 12,
                                padding: '18px 16px',
                                marginBottom: 12,
                                cursor: isUnlockingAll || success ? 'default' : 'pointer',
                                opacity: isUnlockingAll ? 0.7 : 1,
                                position: 'relative',
                                overflow: 'hidden',
                                WebkitTapHighlightColor: 'transparent',
                            }}
                        >
                            {/* Gold LED strip */}
                            <div style={{
                                position: 'absolute', top: 0, left: '10%', right: '10%',
                                height: 2, background: '#c9a227',
                                borderRadius: '0 0 2px 2px',
                                boxShadow: '0 0 8px rgba(201,162,39,0.5)',
                            }} />

                            {/* Header */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                marginBottom: 10,
                            }}>
                                <span style={{ fontSize: 18 }}>⚡</span>
                                <span style={{
                                    fontFamily: "'Orbitron', sans-serif",
                                    fontSize: 14, fontWeight: 700, letterSpacing: '0.1em',
                                    background: 'linear-gradient(135deg, #ffd700, #c9a227)',
                                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                }}>UNLOCK ALL FEATURES</span>
                            </div>

                            {/* Price */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                marginBottom: 6,
                            }}>
                                <span style={{ fontSize: 20 }}>💎</span>
                                <span style={{
                                    fontFamily: "'Orbitron', sans-serif",
                                    fontSize: 32, fontWeight: 900,
                                    background: 'linear-gradient(180deg, #ffffff 0%, #ffd700 100%)',
                                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                }}>150</span>
                                <span style={{
                                    fontSize: 12, fontWeight: 600,
                                    color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em',
                                }}>DIAMONDS / 24 HRS</span>
                            </div>

                            {/* Subtitle */}
                            <p style={{
                                fontSize: 11, color: 'rgba(255,255,255,0.45)',
                                margin: '0 0 12px', letterSpacing: '0.03em',
                            }}>One pass. Every premium feature. All day.</p>

                            {/* Button */}
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: 8, padding: '12px 0',
                                background: 'linear-gradient(135deg, #c9a227 0%, #a8861a 100%)',
                                borderRadius: 8, border: 'none',
                                color: '#000', fontSize: 13, fontWeight: 700,
                                letterSpacing: '0.08em',
                            }}>
                                {isUnlockingAll ? (
                                    <div style={{
                                        width: 16, height: 16, border: '2px solid #000',
                                        borderTopColor: 'transparent', borderRadius: '50%',
                                        animation: 'fgpSpin 0.8s linear infinite',
                                    }} />
                                ) : <span>⚡</span>}
                                {isUnlockingAll ? 'UNLOCKING...' : 'GET ALL-ACCESS PASS'}
                            </div>
                        </div>

                        {/* ═══ BLUE BOX: SINGLE FEATURE ACCESS ═══ */}
                        <div
                            onClick={!isUnlocking && !isUnlockingAll && !success ? handleUnlockSingle : undefined}
                            style={{
                                background: 'linear-gradient(180deg, #141a25 0%, #0d1118 100%)',
                                border: '2px solid #2374e1',
                                borderRadius: 12,
                                padding: '18px 16px',
                                marginBottom: 12,
                                cursor: isUnlocking || success ? 'default' : 'pointer',
                                opacity: isUnlocking ? 0.7 : 1,
                                position: 'relative',
                                overflow: 'hidden',
                                WebkitTapHighlightColor: 'transparent',
                            }}
                        >
                            {/* Blue LED strip */}
                            <div style={{
                                position: 'absolute', top: 0, left: '10%', right: '10%',
                                height: 2, background: '#2374e1',
                                borderRadius: '0 0 2px 2px',
                                boxShadow: '0 0 8px rgba(35,116,225,0.5)',
                            }} />

                            {/* Price */}
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: 8, marginBottom: 12,
                            }}>
                                <span style={{ fontSize: 20 }}>💎</span>
                                <span style={{
                                    fontFamily: "'Orbitron', sans-serif",
                                    fontSize: 32, fontWeight: 900,
                                    background: 'linear-gradient(180deg, #ffffff 0%, #2374e1 100%)',
                                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                }}>{cost}</span>
                                <span style={{
                                    fontSize: 12, fontWeight: 600,
                                    color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em',
                                }}>DIAMONDS</span>
                            </div>

                            {/* Button */}
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: 8, padding: '12px 0',
                                background: 'linear-gradient(135deg, #2374e1 0%, #1a5bb8 100%)',
                                borderRadius: 8,
                                color: '#fff', fontSize: 13, fontWeight: 700,
                                letterSpacing: '0.08em',
                            }}>
                                {isUnlocking ? (
                                    <div style={{
                                        width: 16, height: 16, border: '2px solid #fff',
                                        borderTopColor: 'transparent', borderRadius: '50%',
                                        animation: 'fgpSpin 0.8s linear infinite',
                                    }} />
                                ) : <span>🔒</span>}
                                {isUnlocking ? 'UNLOCKING...' : `UNLOCK ${config.durationHours}H ACCESS`}
                            </div>

                            {/* Balance */}
                            <p style={{
                                textAlign: 'center', marginTop: 10, marginBottom: 0,
                                fontSize: 11, color: 'rgba(255,255,255,0.4)',
                                letterSpacing: '0.1em',
                            }}>YOUR BALANCE: {diamonds} 💎</p>
                        </div>

                        {/* Error message */}
                        {error && (
                            <div style={{
                                padding: '10px 14px', marginBottom: 12,
                                background: 'rgba(239,68,68,0.1)',
                                border: '1px solid rgba(239,68,68,0.4)',
                                borderRadius: 8, textAlign: 'center',
                                fontSize: 12, color: '#ef4444', letterSpacing: '0.05em',
                            }}>{error}</div>
                        )}

                        {/* ═══ VIP LINK ═══ */}
                        <div
                            onClick={handleGetVip}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: 8, padding: '12px 0',
                                cursor: 'pointer',
                                WebkitTapHighlightColor: 'transparent',
                            }}
                        >
                            <span style={{ fontSize: 14 }}>👑</span>
                            <span style={{
                                fontSize: 12, color: 'rgba(255,255,255,0.55)',
                                letterSpacing: '0.05em',
                            }}>Want unlimited?</span>
                            <span style={{
                                fontSize: 12, fontWeight: 700,
                                color: '#ffd700', letterSpacing: '0.08em',
                            }}>GET VIP →</span>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
