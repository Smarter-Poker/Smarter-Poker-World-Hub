/**
 * FEATURE GATE COMPONENT
 * Generic day-pass access gate UI with Futuristic Metal design
 * Wraps children with VIP/day-pass access control
 *
 * ═══════════════════════════════════════════════════════════════════════
 * HARDENED: March 5, 2026 — Uses AvatarContext as single source of VIP
 * truth to prevent false lockouts caused by auth race conditions and
 * client-side RLS fetch failures. The gate now:
 *   1. Waits for auth initialization (no flash of locked UI)
 *   2. Trusts server-verified VIP status from AvatarContext
 *   3. Only falls through to day-pass checks for non-VIP users
 * ═══════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { Lock, Diamond, Crown, Timer, Loader2, Zap, CheckCircle } from 'lucide-react';
import { checkFeatureAccess, purchaseFeatureAccess, purchaseDailyUnlockAll, FEATURE_CONFIG, DAILY_UNLOCK_ALL_COST } from '../../lib/gates/premiumFeatureGate';
import { useAvatar } from '../../contexts/AvatarContext';

// Inline design tokens (Futuristic Metal)
const M = {
    base: '#242526', mid: '#3a3b3c', highlight: '#4e4f50', light: '#65676b',
    cyan: '#2374e1', cyanGlow: 'rgba(35,116,225,0.4)', cyanDim: 'rgba(35,116,225,0.15)',
    gold: '#f7b928', goldGlow: 'rgba(247,185,40,0.4)',
    success: '#31a24c', successGlow: 'rgba(49,162,76,0.4)',
    danger: '#f02849', warning: '#f7b928',
};

const ANIM = `
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes pulse { 0%,100% { transform: scale(1); opacity:1; } 50% { transform: scale(1.05); opacity:0.8; } }
    @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
    @keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
    @keyframes metalGlow { 0%,100% { opacity:0.6; } 50% { opacity:1; } }
`;

/**
 * @param {Object} props
 * @param {string} [props.userId] - DEPRECATED: now sourced from AvatarContext. Kept for backward-compat.
 * @param {string} props.featureKey - Key from FEATURE_CONFIG (e.g., 'poker_near_me')
 * @param {string} props.title - Display title (e.g., 'POKER NEAR ME')
 * @param {string} props.subtitle - Display subtitle (e.g., 'PRO')
 * @param {string} props.description - Feature description
 * @param {string[]} props.features - List of feature names to show in grid
 * @param {number} [props.cost] - Override cost from FEATURE_CONFIG
 * @param {React.ReactNode} props.children - Content to show when access granted
 */
export default function FeatureGate({ userId: userIdProp, featureKey, title, subtitle, description, features = [], cost: costOverride, hideBadge, children }) {
    // ═══════════════════════════════════════════════════════════════════
    // HARDENED: Source user + VIP status from AvatarContext (server-verified)
    // Falls back to userIdProp for backward compatibility
    // ═══════════════════════════════════════════════════════════════════
    const { user, isVip: contextIsVip, initializing } = useAvatar();
    const userId = user?.id || userIdProp;

    const config = FEATURE_CONFIG[featureKey] || { cost: 25, label: featureKey, durationHours: 24 };
    const cost = costOverride || config.cost;

    const [access, setAccess] = useState({ hasAccess: false, isVip: false, expiresAt: null, loading: true });
    const [diamonds, setDiamonds] = useState(0);
    const [showModal, setShowModal] = useState(false);
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [unlockSuccess, setUnlockSuccess] = useState(false);
    const [error, setError] = useState(null);
    const [isUnlockingAll, setIsUnlockingAll] = useState(false);

    useEffect(() => {
        // ═══════════════════════════════════════════════════════════════
        // HARDENED: Wait for auth initialization before making any access
        // decision. This prevents the flash of locked UI on page load.
        // ═══════════════════════════════════════════════════════════════
        if (initializing) {
            // Keep loading state while auth is initializing
            setAccess({ hasAccess: false, isVip: false, expiresAt: null, loading: true });
            return;
        }

        // ═══════════════════════════════════════════════════════════════
        // HARDENED: If AvatarContext says VIP, grant immediately. No
        // client-side profile fetch needed — this status was already
        // verified via the server-side /api/vip/check-status bridge.
        // ═══════════════════════════════════════════════════════════════
        if (contextIsVip) {
            setAccess({ hasAccess: true, isVip: true, expiresAt: null, loading: false });
            return;
        }

        // Non-VIP: check for active day pass
        if (userId) {
            loadDayPassAccess();
        } else {
            setAccess({ hasAccess: false, isVip: false, expiresAt: null, loading: false });
        }
    }, [userId, featureKey, contextIsVip, initializing]);

    // Only checks day-pass access (VIP is already handled above)
    const loadDayPassAccess = async () => {
        try {
            const result = await checkFeatureAccess(userId, featureKey);
            setAccess({ ...result, loading: false });
            setDiamonds(result.diamonds || 0);
            if (result.error) {
                console.warn('[FeatureGate UI] Access check returned error:', result.error);
            }
        } catch (err) {
            console.error('[FeatureGate UI] loadDayPassAccess crashed:', err);
            setAccess({ hasAccess: false, isVip: false, expiresAt: null, loading: false });
            setDiamonds(0);
        }
    };

    const handleUnlock = async () => {
        setIsUnlocking(true);
        setError(null);

        const result = await purchaseFeatureAccess(
            userId, featureKey, cost, config.durationHours,
            `${config.label} - ${config.durationHours} Hour Access`
        );

        if (result.success) {
            setUnlockSuccess(true);
            if (result.newBalance !== undefined) setDiamonds(result.newBalance);

            setTimeout(() => {
                setAccess({ hasAccess: true, isVip: result.isVip || false, expiresAt: result.expiresAt, loading: false });
                setShowModal(false);
                setUnlockSuccess(false);
            }, 1500);
        } else {
            setError(result.error);
        }

        setIsUnlocking(false);
    };

    // ═══════════════════════════════════════════════════════════════════
    // DAILY UNLOCK ALL: Purchase 150💎 universal day pass
    // ═══════════════════════════════════════════════════════════════════
    const handleUnlockAll = async () => {
        setIsUnlockingAll(true);
        setError(null);

        const result = await purchaseDailyUnlockAll(userId);

        if (result.success) {
            setUnlockSuccess(true);
            if (result.newBalance !== undefined) setDiamonds(result.newBalance);

            setTimeout(() => {
                setAccess({ hasAccess: true, isVip: false, isDailyUnlock: true, expiresAt: result.expiresAt, loading: false });
                setShowModal(false);
                setUnlockSuccess(false);
            }, 1500);
        } else {
            setError(result.error);
        }

        setIsUnlockingAll(false);
    };

    // Loading (auth initializing or access check in progress)
    if (access.loading) {
        return (
            <div style={s.loadingWrap}>
                <Loader2 size={28} style={{ color: M.cyan, animation: 'spin 1s linear infinite' }} />
                <p style={s.loadingText}>INITIALIZING</p>
                <style>{ANIM}</style>
            </div>
        );
    }

    // Has access — show children directly
    if (access.hasAccess) {
        return (
            <>
                {!hideBadge && access.isVip && (
                    <div style={{ ...s.badge, ...s.badgeGold }}>
                        <Crown size={12} /> VIP ACCESS
                    </div>
                )}
                {!hideBadge && access.isDailyUnlock && access.expiresAt && (
                    <div style={{ ...s.badge, ...s.badgeCyan }}>
                        <Zap size={12} /> ALL ACCESS — {formatTimeRemaining(access.expiresAt)}
                    </div>
                )}
                {!hideBadge && !access.isVip && !access.isDailyUnlock && access.expiresAt && (
                    <div style={{ ...s.badge, ...s.badgeCyan }}>
                        <Timer size={12} /> {formatTimeRemaining(access.expiresAt)}
                    </div>
                )}
                {children}
                <style>{ANIM}</style>
            </>
        );
    }

    // No access — locked gate
    return (
        <>
            <div style={s.locked}>
                <div style={s.gridBg} />
                <div style={s.ledStrip} />

                <div style={s.lockRing}>
                    <Lock size={28} style={{ color: M.cyan }} />
                </div>

                <h3 style={s.title}>
                    {title || 'FEATURE'} <span style={s.proText}>{subtitle || 'PRO'}</span>
                </h3>
                <p style={s.desc}>{description || 'Unlock premium access to this feature'}</p>

                {features.length > 0 && (
                    <div style={s.featureGrid}>
                        {features.map((f, i) => (
                            <div key={i} style={s.featureCard}>
                                <Zap size={16} style={{ color: M.cyan }} />
                                <span style={s.featureLabel}>{f}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* ═══ UNLOCK ALL FEATURES BANNER ═══ */}
                <div style={s.unlockAllBanner}>
                    <div style={s.unlockAllLed} />
                    <div style={s.unlockAllHeader}>
                        <Zap size={18} style={{ color: '#f7b928' }} />
                        <span style={s.unlockAllTitle}>UNLOCK ALL FEATURES</span>
                    </div>
                    <div style={s.unlockAllPriceRow}>
                        <Diamond size={22} style={{ color: '#f7b928' }} />
                        <span style={s.unlockAllPrice}>150</span>
                        <span style={s.unlockAllUnit}>DIAMONDS / 24 HRS</span>
                    </div>
                    <p style={s.unlockAllDesc}>One pass. Every premium feature. All day.</p>
                    <button
                        style={s.unlockAllBtn}
                        onClick={handleUnlockAll}
                        disabled={isUnlockingAll || diamonds < DAILY_UNLOCK_ALL_COST}
                    >
                        {isUnlockingAll ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={16} />}
                        {isUnlockingAll ? 'UNLOCKING...' : 'GET ALL-ACCESS PASS'}
                    </button>
                </div>

                <div style={s.pricingPanel}>
                    <div style={s.pricingLed} />
                    <div style={s.priceRow}>
                        <Diamond size={32} style={{ color: M.cyan }} />
                        <span style={s.priceValue}>{cost}</span>
                        <span style={s.priceUnit}>DIAMONDS</span>
                    </div>
                    <button style={s.unlockBtn} onClick={() => setShowModal(true)}>
                        <Lock size={18} /> UNLOCK {config.durationHours}H ACCESS
                    </button>
                    <p style={s.balanceNote}>YOUR BALANCE: {diamonds} 💎</p>
                </div>

                <div style={s.vipPromo}>
                    <Crown size={14} style={{ color: M.gold }} />
                    <span>Want unlimited?</span>
                    <button style={s.vipLink}>GET VIP →</button>
                </div>
            </div>

            {/* Unlock Modal */}
            {showModal && (
                <div style={s.overlay} onClick={() => !isUnlocking && setShowModal(false)}>
                    <div style={s.modal} onClick={e => e.stopPropagation()}>
                        <div style={s.modalLed} />

                        {unlockSuccess ? (
                            <div style={{ padding: '24px 0' }}>
                                <CheckCircle size={56} style={{ color: M.success, animation: 'pulse 1s ease-out' }} />
                                <h4 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 20, fontWeight: 700, letterSpacing: '0.15em', color: M.success, margin: '16px 0 8px' }}>ACCESS GRANTED</h4>
                                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.1em' }}>{config.durationHours} hours of premium access activated</p>
                            </div>
                        ) : (
                            <>
                                <div style={s.modalTitle}>
                                    <Lock size={20} style={{ color: M.cyan }} />
                                    CONFIRM UNLOCK
                                </div>

                                <div style={s.modalCost}>
                                    <span style={s.modalCostVal}>{cost}</span>
                                    <span style={s.modalCostUnit}>DIAMONDS</span>
                                </div>

                                <div style={s.modalDuration}>
                                    <Timer size={14} />
                                    {config.durationHours} HOUR ACCESS
                                </div>

                                <div style={s.balancePanel}>
                                    <span>YOUR BALANCE</span>
                                    <span style={{ color: '#fff', fontWeight: 700 }}>{diamonds} 💎</span>
                                </div>

                                {error && (
                                    diamonds < cost ? (
                                        <div style={s.insufficientBox}>
                                            <span>Need {cost - diamonds} more diamonds</span>
                                            <button style={s.getDiamondsBtn}>
                                                <Diamond size={14} /> GET DIAMONDS
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={s.errorBox}>{error}</div>
                                    )
                                )}

                                <div style={s.modalActions}>
                                    <button style={s.cancelBtn} onClick={() => setShowModal(false)} disabled={isUnlocking}>
                                        CANCEL
                                    </button>
                                    <button style={s.confirmBtn} onClick={handleUnlock} disabled={isUnlocking || diamonds < cost}>
                                        {isUnlocking ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Diamond size={16} />}
                                        {isUnlocking ? 'UNLOCKING...' : 'CONFIRM'}
                                    </button>
                                </div>

                                <div style={s.modalVipNote}>
                                    <Crown size={12} style={{ color: M.gold }} /> VIP = UNLIMITED ACCESS
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            <style>{ANIM}</style>
        </>
    );
}

function formatTimeRemaining(expiresAt) {
    if (!expiresAt) return 'ACTIVE';
    const diffMs = new Date(expiresAt) - new Date();
    if (diffMs <= 0) return 'EXPIRED';
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return hours > 0 ? `${hours}H ${minutes}M` : `${minutes}M LEFT`;
}

// Styles
const s = {
    loadingWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 80, background: M.base, borderRadius: 16, border: `1px solid ${M.mid}` },
    loadingText: { fontFamily: "'Orbitron',sans-serif", fontSize: 11, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.4)', marginTop: 12 },
    badge: { position: 'absolute', top: -10, right: 12, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', zIndex: 10, animation: 'float 3s ease-in-out infinite' },
    badgeCyan: { background: M.cyanDim, border: `1px solid ${M.cyan}`, color: M.cyan },
    badgeGold: { background: 'rgba(245,158,11,0.15)', border: `1px solid ${M.gold}`, color: M.gold, boxShadow: `0 0 10px ${M.goldGlow}` },
    locked: { position: 'relative', textAlign: 'center', padding: '48px 28px', background: `linear-gradient(180deg, #242526 0%, #18191a 100%)`, border: `2px solid ${M.highlight}`, borderRadius: 16, margin: '20px 0', overflow: 'hidden' },
    gridBg: { position: 'absolute', inset: 0, backgroundImage: `linear-gradient(rgba(35,116,225,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(35,116,225,0.03) 1px, transparent 1px)`, backgroundSize: '20px 20px', pointerEvents: 'none' },
    ledStrip: { position: 'absolute', top: 0, left: '15%', right: '15%', height: 3, background: M.cyan, borderRadius: '0 0 3px 3px', boxShadow: `0 1px 2px rgba(0,0,0,0.2), 0 2px 8px ${M.cyanGlow}` },
    lockRing: { width: 72, height: 72, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', border: `2px solid ${M.cyan}`, borderRadius: '50%', boxShadow: `0 0 10px ${M.cyanGlow}`, animation: 'metalGlow 3s ease-in-out infinite' },
    title: { fontFamily: "'Orbitron',sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: '0.1em', color: '#fff', margin: '0 0 8px' },
    proText: { background: `linear-gradient(135deg, ${M.cyan} 0%, #1a5fc9 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
    desc: { fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '0 0 28px', maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' },
    featureGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 300, margin: '0 auto 28px' },
    featureCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '12px 8px', background: 'rgba(0,0,0,0.3)', border: `1px solid ${M.mid}`, borderRadius: 8 },
    featureLabel: { fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' },
    pricingPanel: { position: 'relative', padding: 28, background: 'rgba(0,20,40,0.5)', border: `2px solid ${M.cyan}`, borderRadius: 14, marginBottom: 20 },
    pricingLed: { position: 'absolute', top: 0, left: '20%', right: '20%', height: 2, background: M.cyan, borderRadius: '0 0 2px 2px' },
    priceRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 },
    priceValue: { fontFamily: "'Orbitron',sans-serif", fontSize: 48, fontWeight: 900, background: `linear-gradient(180deg, #ffffff 0%, ${M.cyan} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
    priceUnit: { fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em' },
    unlockBtn: { display: 'inline-flex', alignItems: 'center', gap: 10, padding: '16px 40px', background: `linear-gradient(135deg, ${M.cyan} 0%, #1a5fc9 100%)`, border: 'none', borderRadius: 10, color: '#000', fontSize: 15, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', boxShadow: `0 4px 20px ${M.cyanGlow}` },
    balanceNote: { marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em' },
    vipPromo: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.05em' },
    vipLink: { background: 'none', border: 'none', color: M.gold, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer' },
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
    modal: { position: 'relative', width: '100%', maxWidth: 400, background: `linear-gradient(180deg, #1a2a3a 0%, ${M.base} 100%)`, border: `2px solid ${M.highlight}`, borderRadius: 16, padding: 32, textAlign: 'center', boxShadow: '0 0 60px rgba(0,0,0,0.8)' },
    modalLed: { position: 'absolute', top: 0, left: '25%', right: '25%', height: 2, background: M.cyan, borderRadius: '0 0 2px 2px' },
    modalTitle: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontFamily: "'Orbitron',sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: '0.1em', color: '#fff', marginBottom: 24 },
    modalCost: { display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, marginBottom: 8 },
    modalCostVal: { fontFamily: "'Orbitron',sans-serif", fontSize: 56, fontWeight: 900, background: `linear-gradient(180deg, #ffffff 0%, ${M.cyan} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
    modalCostUnit: { fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em' },
    modalDuration: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: M.cyan, letterSpacing: '0.15em', marginBottom: 24 },
    balancePanel: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', background: 'rgba(0,0,0,0.4)', border: `1px solid ${M.mid}`, borderRadius: 10, fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.1em', marginBottom: 16 },
    errorBox: { padding: 14, background: 'rgba(239,68,68,0.1)', border: `1px solid ${M.danger}`, borderRadius: 10, color: M.danger, fontSize: 12, marginBottom: 16 },
    insufficientBox: { display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: 'rgba(245,158,11,0.1)', border: `1px solid ${M.warning}`, borderRadius: 10, fontSize: 12, color: M.warning, letterSpacing: '0.1em', marginBottom: 16 },
    getDiamondsBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, background: 'rgba(245,158,11,0.2)', border: `1px solid ${M.warning}`, borderRadius: 8, color: M.warning, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer' },
    modalActions: { display: 'flex', gap: 12, marginBottom: 20 },
    cancelBtn: { flex: 1, padding: 14, background: `linear-gradient(180deg, #3a3b3c 0%, #2d2e2f 100%)`, border: `1px solid ${M.mid}`, borderRadius: 10, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.1em', cursor: 'pointer' },
    confirmBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, background: `linear-gradient(135deg, ${M.cyan} 0%, #1a5fc9 100%)`, border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#000', letterSpacing: '0.1em', cursor: 'pointer' },
    modalVipNote: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.15em' },
    // UNLOCK ALL FEATURES banner styles
    unlockAllBanner: { position: 'relative', padding: '20px 24px', background: 'linear-gradient(180deg, rgba(247,185,40,0.12) 0%, rgba(247,185,40,0.04) 100%)', border: `2px solid rgba(247,185,40,0.5)`, borderRadius: 14, marginBottom: 16, textAlign: 'center', overflow: 'hidden' },
    unlockAllLed: { position: 'absolute', top: 0, left: '15%', right: '15%', height: 2, background: '#f7b928', borderRadius: '0 0 2px 2px', boxShadow: '0 0 8px rgba(247,185,40,0.5)' },
    unlockAllHeader: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 },
    unlockAllTitle: { fontFamily: "'Orbitron',sans-serif", fontSize: 15, fontWeight: 700, letterSpacing: '0.12em', background: 'linear-gradient(135deg, #f7b928, #ffd700)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
    unlockAllPriceRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 },
    unlockAllPrice: { fontFamily: "'Orbitron',sans-serif", fontSize: 32, fontWeight: 900, background: 'linear-gradient(180deg, #ffffff 0%, #f7b928 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
    unlockAllUnit: { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em' },
    unlockAllDesc: { fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: '0 0 14px', letterSpacing: '0.05em' },
    unlockAllBtn: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 28px', background: 'linear-gradient(135deg, #f7b928 0%, #d4981a 100%)', border: 'none', borderRadius: 10, color: '#000', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', boxShadow: '0 4px 16px rgba(247,185,40,0.35)', transition: 'transform 0.2s' },
};
