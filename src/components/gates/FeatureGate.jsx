/**
 * FEATURE GATE COMPONENT
 * Generic day-pass access gate UI with Futuristic Metal design
 * Wraps children with VIP/day-pass access control
 * Adapted from BankrollProGate.jsx for any feature
 */

import { useState, useEffect } from 'react';
import { Lock, Diamond, Crown, Timer, Loader2, Zap, CheckCircle } from 'lucide-react';
import { checkFeatureAccess, purchaseFeatureAccess, FEATURE_CONFIG } from '../../lib/gates/premiumFeatureGate';

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
 * @param {string} props.userId - User UUID
 * @param {string} props.featureKey - Key from FEATURE_CONFIG (e.g., 'poker_near_me')
 * @param {string} props.title - Display title (e.g., 'POKER NEAR ME')
 * @param {string} props.subtitle - Display subtitle (e.g., 'PRO')
 * @param {string} props.description - Feature description
 * @param {string[]} props.features - List of feature names to show in grid
 * @param {number} [props.cost] - Override cost from FEATURE_CONFIG
 * @param {React.ReactNode} props.children - Content to show when access granted
 */
export default function FeatureGate({ userId, featureKey, title, subtitle, description, features = [], cost: costOverride, hideBadge, children }) {
    const config = FEATURE_CONFIG[featureKey] || { cost: 25, label: featureKey, durationHours: 24 };
    const cost = costOverride || config.cost;

    const [access, setAccess] = useState({ hasAccess: false, isVip: false, expiresAt: null, loading: true });
    const [diamonds, setDiamonds] = useState(0);
    const [showModal, setShowModal] = useState(false);
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [unlockSuccess, setUnlockSuccess] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (userId) {
            loadAccess();
        } else {
            setAccess({ hasAccess: false, isVip: false, expiresAt: null, loading: false });
        }
    }, [userId, featureKey]);

    const loadAccess = async () => {
        const result = await checkFeatureAccess(userId, featureKey);
        setAccess({ ...result, loading: false });
        setDiamonds(result.diamonds || 0);
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

    // Loading
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

                {/* Lock icon */}
                <div style={{ marginBottom: 24 }}>
                    <div style={s.lockRing}>
                        <Lock size={28} style={{ color: M.cyan }} />
                    </div>
                </div>

                <h3 style={s.title}>
                    {title || config.label} {subtitle && <span style={s.proText}>{subtitle}</span>}
                </h3>
                <p style={s.desc}>{description || 'Premium feature — unlock with diamonds or VIP membership'}</p>

                {/* Feature grid */}
                {features.length > 0 && (
                    <div style={s.featureGrid}>
                        {features.map((f, i) => (
                            <div key={i} style={s.featureCard}>
                                <span style={s.featureLabel}>{f}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Pricing */}
                <div style={s.pricingPanel}>
                    <div style={s.pricingLed} />
                    <div style={s.priceRow}>
                        <Diamond size={28} style={{ color: M.cyan, filter: `drop-shadow(0 0 8px ${M.cyanGlow})` }} />
                        <span style={s.priceValue}>{cost}</span>
                        <span style={s.priceUnit}>/ {config.durationHours} HRS</span>
                    </div>
                    <button onClick={() => setShowModal(true)} style={s.unlockBtn}>
                        <Zap size={18} /> UNLOCK ACCESS
                    </button>
                    <p style={s.balanceNote}>
                        BALANCE: <strong style={{ color: M.cyan }}>{diamonds}</strong> diamonds
                    </p>
                </div>

                {/* VIP promo */}
                <div style={s.vipPromo}>
                    <Crown size={14} style={{ color: M.gold }} />
                    <span>VIP = <strong>UNLIMITED ACCESS</strong></span>
                    <button onClick={() => window.location.href = '/hub/diamond-store#vip'} style={s.vipLink}>
                        UPGRADE →
                    </button>
                </div>
            </div>

            {/* Unlock Modal */}
            {showModal && (
                <div style={s.overlay} onClick={() => !isUnlocking && setShowModal(false)}>
                    <div style={s.modal} onClick={e => e.stopPropagation()}>
                        <div style={s.modalLed} />

                        {unlockSuccess ? (
                            <div style={{ padding: '24px 0', textAlign: 'center' }}>
                                <CheckCircle size={56} style={{ color: M.success, filter: `drop-shadow(0 0 15px ${M.successGlow})`, marginBottom: 16 }} />
                                <h3 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 20, color: M.success, letterSpacing: '0.15em', margin: '0 0 8px' }}>ACCESS UNLOCKED</h3>
                                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.1em', margin: 0 }}>{config.durationHours}-hour full access activated</p>
                            </div>
                        ) : (
                            <>
                                <h3 style={s.modalTitle}>
                                    <Diamond size={22} style={{ color: M.cyan }} /> UNLOCK {subtitle || 'PRO'}
                                </h3>
                                <div style={s.modalCost}>
                                    <span style={s.modalCostVal}>{cost}</span>
                                    <span style={s.modalCostUnit}>DIAMONDS</span>
                                </div>
                                <div style={s.modalDuration}>
                                    <Timer size={14} /> {config.durationHours}-HOUR FULL ACCESS
                                </div>
                                <div style={s.balancePanel}>
                                    <span>YOUR BALANCE</span>
                                    <strong style={{ color: diamonds >= cost ? M.success : M.danger, fontSize: 20 }}>
                                        {diamonds} diamonds
                                    </strong>
                                </div>

                                {error && <div style={s.errorBox}>{error}</div>}

                                {diamonds < cost && (
                                    <div style={s.insufficientBox}>
                                        <span>NEED {cost - diamonds} MORE</span>
                                        <button onClick={() => window.location.href = '/hub/diamond-store'} style={s.getDiamondsBtn}>
                                            <Diamond size={12} /> GET DIAMONDS
                                        </button>
                                    </div>
                                )}

                                <div style={s.modalActions}>
                                    <button onClick={() => setShowModal(false)} disabled={isUnlocking} style={s.cancelBtn}>CANCEL</button>
                                    <button
                                        onClick={handleUnlock}
                                        disabled={isUnlocking || diamonds < cost}
                                        style={{ ...s.confirmBtn, opacity: (isUnlocking || diamonds < cost) ? 0.4 : 1 }}
                                    >
                                        {isUnlocking ? (
                                            <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> PROCESSING</>
                                        ) : (
                                            <><Zap size={16} /> CONFIRM</>
                                        )}
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
};
