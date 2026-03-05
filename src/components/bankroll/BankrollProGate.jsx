/**
 * BANKROLL PRO ACCESS GATE
 * Premium unlock UI with Futuristic Metal design system
 * Industrial sci-fi aesthetic with LED accents and machined metal surfaces
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
import { supabase } from '../../lib/supabase';
import {
    checkBankrollProAccess,
    purchaseBankrollProAccess,
    BANKROLL_PRO_DAY_COST
} from '../../lib/bankroll/premiumFeatureGate';
import { METAL, GRADIENTS, GLOWS, ANIMATIONS } from './metalStyles';
import { useAvatar } from '../../contexts/AvatarContext';

export default function BankrollProGate({ userId: userIdProp, children }) {
    // ═══════════════════════════════════════════════════════════════════
    // HARDENED: Source user + VIP status from AvatarContext (server-verified)
    // Falls back to userIdProp for backward compatibility
    // ═══════════════════════════════════════════════════════════════════
    const { user, isVip: contextIsVip, initializing } = useAvatar();
    const userId = user?.id || userIdProp;

    const [access, setAccess] = useState({ hasAccess: false, isVip: false, expiresAt: null, loading: true });
    const [diamonds, setDiamonds] = useState(0);
    const [showUnlockModal, setShowUnlockModal] = useState(false);
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [unlockSuccess, setUnlockSuccess] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        // ═══════════════════════════════════════════════════════════════
        // HARDENED: Wait for auth initialization before making any access
        // decision. This prevents the flash of locked UI on page load.
        // ═══════════════════════════════════════════════════════════════
        if (initializing) {
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
            loadAccess();
            loadDiamonds();
        } else {
            setAccess({ hasAccess: false, isVip: false, expiresAt: null, loading: false });
        }
    }, [userId, contextIsVip, initializing]);

    const loadAccess = async () => {
        try {
            const result = await checkBankrollProAccess(userId);
            setAccess({ ...result, loading: false });
        } catch (err) {
            console.error('[BankrollProGate] loadAccess crashed:', err);
            setAccess({ hasAccess: false, isVip: false, expiresAt: null, loading: false });
        }
    };

    const loadDiamonds = async () => {
        const { data } = await supabase
            .from('profiles')
            .select('diamonds')
            .eq('id', userId)
            .single();
        setDiamonds(data?.diamonds || 0);
    };

    const handleUnlock = async () => {
        setIsUnlocking(true);
        setError(null);

        const result = await purchaseBankrollProAccess(userId);

        if (result.success) {
            setUnlockSuccess(true);
            setDiamonds(result.newBalance);

            setTimeout(() => {
                setAccess({ hasAccess: true, isVip: result.isVip || false, expiresAt: result.expiresAt, loading: false });
                setShowUnlockModal(false);
                setUnlockSuccess(false);
            }, 1500);
        } else {
            setError(result.error);
        }

        setIsUnlocking(false);
    };

    // Loading state
    if (access.loading) {
        return (
            <div style={styles.loadingContainer}>
                <div style={styles.loadingSpinner}>
                    <Loader2 size={28} />
                </div>
                <p style={styles.loadingText}>INITIALIZING</p>
                <style jsx global>{ANIMATIONS}</style>
            </div>
        );
    }

    // Has access - show content directly
    if (access.hasAccess) {
        return (
            <>
                {children}
                <style jsx global>{ANIMATIONS}</style>
            </>
        );
    }

    // No access - Metal unlock panel
    return (
        <>
            <div style={styles.lockedContainer}>
                {/* Background grid pattern */}
                <div style={styles.gridBg} />

                {/* LED strip top */}
                <div style={styles.ledStripTop} />

                {/* Corner bolts */}
                <div style={{ ...styles.cornerBolt, top: 12, left: 12 }} />
                <div style={{ ...styles.cornerBolt, top: 12, right: 12 }} />
                <div style={{ ...styles.cornerBolt, bottom: 12, left: 12 }} />
                <div style={{ ...styles.cornerBolt, bottom: 12, right: 12 }} />

                {/* Lock Icon */}
                <div style={styles.lockIconContainer}>
                    <div style={styles.lockIconRing}>
                        <Lock size={28} style={{ color: METAL.cyan }} />
                    </div>
                </div>

                <h3 style={styles.lockedTitle}>
                    BANKROLL MANAGER <span style={styles.proText}>PRO</span>
                </h3>
                <p style={styles.lockedDesc}>
                    Advanced analytics, tax reports, staking tools, and AI-powered insights
                </p>

                {/* Feature Grid - Clean Cards */}
                <div style={styles.featureGrid}>
                    {[
                        { icon: '', label: 'Receipt OCR' },
                        { icon: '', label: 'Tax Reports' },
                        { icon: '', label: 'Staking' },
                        { icon: '', label: 'Series ROI' },
                        { icon: '', label: 'AI Review' },
                        { icon: '', label: 'Variance' },
                    ].map((feature, i) => (
                        <div key={i} style={styles.featureCard}>
                            <span style={styles.featureLabel}>{feature.label}</span>
                        </div>
                    ))}
                </div>

                {/* Pricing Panel */}
                <div style={styles.pricingPanel}>
                    <div style={styles.pricingLed} />
                    <div style={styles.priceDisplay}>
                        <Diamond size={28} style={styles.diamondIcon} />
                        <span style={styles.priceValue}>{BANKROLL_PRO_DAY_COST}</span>
                        <span style={styles.priceUnit}>/ 24 HRS</span>
                    </div>

                    <button onClick={() => setShowUnlockModal(true)} style={styles.unlockBtn}>
                        <Zap size={18} />
                        UNLOCK PRO ACCESS
                    </button>

                    <p style={styles.balanceNote}>
                        BALANCE: <strong style={{ color: METAL.cyan }}>{diamonds}</strong> diamonds
                    </p>
                </div>

                {/* VIP Promo */}
                <div style={styles.vipPromo}>
                    <Crown size={14} style={{ color: METAL.primary }} />
                    <span>VIP = <strong>UNLIMITED ACCESS</strong></span>
                    <button
                        onClick={() => window.location.href = '/hub/diamond-store#vip'}
                        style={styles.vipLink}
                    >
                        UPGRADE →
                    </button>
                </div>
            </div>

            {/* Unlock Modal */}
            {showUnlockModal && (
                <div style={styles.modalOverlay} onClick={() => !isUnlocking && setShowUnlockModal(false)}>
                    <div style={styles.modal} onClick={e => e.stopPropagation()}>
                        {/* Modal LED strip */}
                        <div style={styles.modalLed} />

                        {unlockSuccess ? (
                            <div style={styles.successState}>
                                <CheckCircle size={56} style={styles.successIcon} />
                                <h3 style={styles.successTitle}>PRO UNLOCKED</h3>
                                <p style={styles.successDesc}>24-hour Access Activated</p>
                            </div>
                        ) : (
                            <>
                                <h3 style={styles.modalTitle}>
                                    <Diamond size={22} style={{ color: METAL.cyan }} />
                                    UNLOCK PRO
                                </h3>

                                <div style={styles.modalCostDisplay}>
                                    <span style={styles.modalCostValue}>{BANKROLL_PRO_DAY_COST}</span>
                                    <span style={styles.modalCostUnit}>DIAMONDS</span>
                                </div>

                                <div style={styles.modalDuration}>
                                    <Timer size={14} />
                                    24-HOUR FULL ACCESS
                                </div>

                                <div style={styles.balancePanel}>
                                    <span>YOUR BALANCE</span>
                                    <strong style={{
                                        color: diamonds >= BANKROLL_PRO_DAY_COST ? METAL.success : METAL.danger,
                                        fontSize: 20
                                    }}>
                                        {diamonds} diamonds
                                    </strong>
                                </div>

                                {error && <div style={styles.errorBox}>{error}</div>}

                                {diamonds < BANKROLL_PRO_DAY_COST && (
                                    <div style={styles.insufficientBox}>
                                        <span>NEED {BANKROLL_PRO_DAY_COST - diamonds} MORE</span>
                                        <button
                                            onClick={() => window.location.href = '/hub/diamond-store'}
                                            style={styles.getDiamondsBtn}
                                        >
                                            <Diamond size={12} />
                                            GET DIAMONDS
                                        </button>
                                    </div>
                                )}

                                <div style={styles.modalActions}>
                                    <button
                                        onClick={() => setShowUnlockModal(false)}
                                        style={styles.cancelBtn}
                                        disabled={isUnlocking}
                                    >
                                        CANCEL
                                    </button>
                                    <button
                                        onClick={handleUnlock}
                                        disabled={isUnlocking || diamonds < BANKROLL_PRO_DAY_COST}
                                        style={{
                                            ...styles.confirmBtn,
                                            opacity: (isUnlocking || diamonds < BANKROLL_PRO_DAY_COST) ? 0.4 : 1,
                                        }}
                                    >
                                        {isUnlocking ? (
                                            <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> PROCESSING</>
                                        ) : (
                                            <><Zap size={16} /> CONFIRM</>
                                        )}
                                    </button>
                                </div>

                                <div style={styles.modalVipNote}>
                                    <Crown size={12} style={{ color: METAL.primary }} />
                                    VIP = UNLIMITED ACCESS
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            <style jsx global>{ANIMATIONS}</style>
        </>
    );
}

function formatTimeRemaining(expiresAt) {
    if (!expiresAt) return 'ACTIVE';
    const now = new Date();
    const expires = new Date(expiresAt);
    const diffMs = expires - now;

    if (diffMs <= 0) return 'EXPIRED';

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}H ${minutes}M`;
    return `${minutes}M LEFT`;
}

const styles = {
    // Loading
    loadingContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 80,
        background: METAL.base,
        borderRadius: 16,
        border: `2px solid ${METAL.mid}`,
    },
    loadingSpinner: {
        animation: 'spin 1s linear infinite',
        color: METAL.cyan,
        marginBottom: 12,
    },
    loadingText: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 14,
        letterSpacing: '0.2em',
        color: 'rgba(255,255,255,0.4)',
    },

    // Access wrapper
    accessWrapper: {
        position: 'relative',
    },
    accessBadge: {
        position: 'absolute',
        top: -10,
        right: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '6px 14px',
        borderRadius: 6,
        fontSize: 14,
        fontFamily: "'Rajdhani', sans-serif",
        fontWeight: 700,
        letterSpacing: '0.1em',
        zIndex: 10,
        animation: 'float 3s ease-in-out infinite',
    },
    badgeCyan: {
        background: METAL.cyanDim,
        border: `2px solid ${METAL.cyan}`,
        color: METAL.cyan,
        boxShadow: GLOWS.cyanSubtle,
    },
    badgeGold: {
        background: METAL.primaryDim,
        border: `2px solid ${METAL.primary}`,
        color: METAL.primary,
        boxShadow: `0 0 10px ${METAL.primaryGlow}`,
    },

    // Locked container
    lockedContainer: {
        position: 'relative',
        textAlign: 'center',
        padding: '48px 28px',
        background: GRADIENTS.darkPanel,
        border: `2px solid ${METAL.highlight}`,
        borderRadius: 16,
        margin: '20px 0',
        overflow: 'hidden',
    },
    gridBg: {
        position: 'absolute',
        inset: 0,
        backgroundImage: `
            linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '20px 20px',
        pointerEvents: 'none',
    },
    ledStripTop: {
        position: 'absolute',
        top: 0,
        left: '15%',
        right: '15%',
        height: 3,
        background: METAL.cyan,
        borderRadius: '0 0 3px 3px',
        boxShadow: GLOWS.cyan,
    },
    cornerBolt: {
        position: 'absolute',
        width: 8,
        height: 8,
        background: `radial-gradient(circle, ${METAL.light} 30%, ${METAL.mid} 70%)`,
        borderRadius: '50%',
        border: `2px solid ${METAL.highlight}`,
        boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.2)',
    },

    // Lock icon
    lockIconContainer: {
        marginBottom: 24,
    },
    lockIconRing: {
        width: 72,
        height: 72,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)',
        border: `2px solid ${METAL.cyan}`,
        borderRadius: '50%',
        boxShadow: `${GLOWS.cyanSubtle}, inset 0 0 20px rgba(0,212,255,0.1)`,
        animation: 'metalGlow 3s ease-in-out infinite',
    },

    // Title
    lockedTitle: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 22,
        fontWeight: 700,
        letterSpacing: '0.1em',
        color: '#fff',
        margin: '0 0 8px',
    },
    proText: {
        background: GRADIENTS.cyanAction,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
    },
    lockedDesc: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        margin: '0 0 28px',
        maxWidth: 320,
        marginLeft: 'auto',
        marginRight: 'auto',
    },

    // Feature grid
    featureGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10,
        maxWidth: 300,
        margin: '0 auto 28px',
    },
    featureCard: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '12px 8px',
        background: 'rgba(0,0,0,0.3)',
        border: `2px solid ${METAL.mid}`,
        borderRadius: 8,
    },
    featureIcon: {
        fontSize: 18,
    },
    featureLabel: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.6)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    },

    // Pricing panel
    pricingPanel: {
        position: 'relative',
        padding: 28,
        background: 'rgba(0,20,40,0.5)',
        border: `2px solid ${METAL.cyan}`,
        borderRadius: 14,
        marginBottom: 20,
    },
    pricingLed: {
        position: 'absolute',
        top: 0,
        left: '20%',
        right: '20%',
        height: 2,
        background: METAL.cyan,
        borderRadius: '0 0 2px 2px',
        boxShadow: GLOWS.cyanSubtle,
    },
    priceDisplay: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 20,
    },
    diamondIcon: {
        color: METAL.cyan,
        filter: `drop-shadow(0 0 8px ${METAL.cyanGlow})`,
    },
    priceValue: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 48,
        fontWeight: 900,
        background: `linear-gradient(180deg, #ffffff 0%, ${METAL.cyan} 100%)`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
    },
    priceUnit: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: '0.1em',
    },
    unlockBtn: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '16px 40px',
        background: GRADIENTS.cyanAction,
        border: 'none',
        borderRadius: 10,
        color: '#000',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 15,
        fontWeight: 700,
        letterSpacing: '0.1em',
        cursor: 'pointer',
        boxShadow: `0 4px 20px ${METAL.cyanGlow}`,
        transition: 'transform 0.2s, box-shadow 0.2s',
    },
    balanceNote: {
        fontFamily: "'Rajdhani', sans-serif",
        marginTop: 16,
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: '0.1em',
    },

    // VIP promo
    vipPromo: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: '0.05em',
    },
    vipLink: {
        background: 'none',
        border: 'none',
        color: METAL.primary,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: '0.1em',
        cursor: 'pointer',
    },

    // Modal
    modalOverlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.95)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
    },
    modal: {
        position: 'relative',
        width: '100%',
        maxWidth: 400,
        background: `linear-gradient(180deg, #1a2a3a 0%, ${METAL.base} 100%)`,
        border: `2px solid ${METAL.highlight}`,
        borderRadius: 16,
        padding: 32,
        textAlign: 'center',
        boxShadow: `0 0 60px rgba(0,0,0,0.8), ${GLOWS.cyanSubtle}`,
    },
    modalLed: {
        position: 'absolute',
        top: 0,
        left: '25%',
        right: '25%',
        height: 2,
        background: METAL.cyan,
        boxShadow: GLOWS.cyanSubtle,
        borderRadius: '0 0 2px 2px',
    },
    modalTitle: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 18,
        fontWeight: 700,
        letterSpacing: '0.1em',
        color: '#fff',
        marginBottom: 24,
    },
    modalCostDisplay: {
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 8,
    },
    modalCostValue: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 56,
        fontWeight: 900,
        background: `linear-gradient(180deg, #ffffff 0%, ${METAL.cyan} 100%)`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
    },
    modalCostUnit: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: '0.1em',
    },
    modalDuration: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        color: METAL.cyan,
        letterSpacing: '0.15em',
        marginBottom: 24,
    },
    balancePanel: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 18px',
        background: 'rgba(0,0,0,0.4)',
        border: `2px solid ${METAL.mid}`,
        borderRadius: 10,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: '0.1em',
        marginBottom: 16,
    },
    errorBox: {
        padding: 14,
        background: 'rgba(239,68,68,0.1)',
        border: `2px solid ${METAL.danger}`,
        borderRadius: 10,
        color: METAL.danger,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        marginBottom: 16,
    },
    insufficientBox: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        background: METAL.primaryDim,
        border: `2px solid ${METAL.primary}`,
        borderRadius: 10,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        color: METAL.primary,
        letterSpacing: '0.1em',
        marginBottom: 16,
    },
    getDiamondsBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '10px',
        background: METAL.primaryDim,
        border: `2px solid ${METAL.primary}`,
        borderRadius: 8,
        color: METAL.primary,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: '0.1em',
        cursor: 'pointer',
    },
    modalActions: {
        display: 'flex',
        gap: 12,
        marginBottom: 20,
    },
    cancelBtn: {
        flex: 1,
        padding: '14px',
        background: GRADIENTS.metalButton,
        border: `2px solid ${METAL.mid}`,
        borderRadius: 10,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.7)',
        letterSpacing: '0.1em',
        cursor: 'pointer',
    },
    confirmBtn: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '14px',
        background: GRADIENTS.cyanAction,
        border: 'none',
        borderRadius: 10,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: '#000',
        letterSpacing: '0.1em',
        cursor: 'pointer',
    },
    modalVipNote: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: '0.15em',
    },

    // Success state
    successState: {
        padding: '24px 0',
    },
    successIcon: {
        color: METAL.success,
        filter: `drop-shadow(0 0 15px ${METAL.successGlow})`,
        marginBottom: 16,
        animation: 'pulse 1s ease-out',
    },
    successTitle: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 20,
        fontWeight: 700,
        letterSpacing: '0.15em',
        color: METAL.success,
        margin: '0 0 8px',
    },
    successDesc: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: '0.1em',
        margin: 0,
    },
};
