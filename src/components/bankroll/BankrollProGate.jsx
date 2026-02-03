/**
 * BANKROLL PRO ACCESS GATE
 * Shows unlock prompt for non-VIP users without active day pass
 */

import { useState, useEffect } from 'react';
import { Lock, Diamond, Crown, Timer, Loader2 } from 'lucide-react';
import {
    checkBankrollProAccess,
    purchaseBankrollProAccess,
    BANKROLL_PRO_DAY_COST
} from '../../lib/bankroll/premiumFeatureGate';

export default function BankrollProGate({ userId, children }) {
    const [access, setAccess] = useState({ hasAccess: false, isVip: false, expiresAt: null, loading: true });
    const [showUnlockModal, setShowUnlockModal] = useState(false);
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (userId) {
            loadAccess();
        } else {
            setAccess({ hasAccess: false, isVip: false, expiresAt: null, loading: false });
        }
    }, [userId]);

    const loadAccess = async () => {
        const result = await checkBankrollProAccess(userId);
        setAccess({ ...result, loading: false });
    };

    const handleUnlock = async () => {
        setIsUnlocking(true);
        setError(null);

        const result = await purchaseBankrollProAccess(userId);

        if (result.success) {
            setAccess({ hasAccess: true, isVip: result.isVip || false, expiresAt: result.expiresAt, loading: false });
            setShowUnlockModal(false);
        } else {
            setError(result.error);
        }

        setIsUnlocking(false);
    };

    // Loading
    if (access.loading) {
        return (
            <div style={styles.loadingContainer}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                <style jsx global>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    // Has access - show content
    if (access.hasAccess) {
        return (
            <div style={styles.accessWrapper}>
                {/* Access Status Badge */}
                <div style={styles.accessBadge}>
                    {access.isVip ? (
                        <><Crown size={12} style={{ color: '#f59e0b' }} /> VIP Access</>
                    ) : (
                        <><Timer size={12} /> {formatTimeRemaining(access.expiresAt)}</>
                    )}
                </div>
                {children}
            </div>
        );
    }

    // No access - show unlock prompt (replaces the premium features section)
    return (
        <>
            <div style={styles.lockedContainer}>
                <div style={styles.lockedIcon}>
                    <Lock size={32} />
                </div>
                <h3 style={styles.lockedTitle}>Bankroll Manager Pro</h3>
                <p style={styles.lockedDesc}>
                    Unlock advanced analytics, tax reports, staking tools, and AI-powered insights
                </p>

                <ul style={styles.featureList}>
                    <li>📸 Receipt Scanner (OCR)</li>
                    <li>📊 Tax Report Generator</li>
                    <li>👥 Staking & Backer Tracking</li>
                    <li>🏆 Tournament Series ROI</li>
                    <li>🧠 AI Hand Review Links</li>
                    <li>📈 Variance Calculator</li>
                    <li>🔥 Performance Heat Maps</li>
                </ul>

                <div style={styles.pricingBox}>
                    <div style={styles.priceRow}>
                        <Diamond size={20} style={{ color: '#00D4FF' }} />
                        <span style={styles.priceValue}>{BANKROLL_PRO_DAY_COST}</span>
                        <span style={styles.priceLabel}>diamonds / 24 hours</span>
                    </div>
                    <button onClick={() => setShowUnlockModal(true)} style={styles.unlockBtn}>
                        <Lock size={14} /> Unlock Pro Access
                    </button>
                </div>

                <div style={styles.vipPromo}>
                    <Crown size={14} style={{ color: '#f59e0b' }} />
                    <span>VIP members get <strong>unlimited free access</strong></span>
                </div>
            </div>

            {/* Unlock Modal */}
            {showUnlockModal && (
                <div style={styles.modalOverlay} onClick={() => setShowUnlockModal(false)}>
                    <div style={styles.modal} onClick={e => e.stopPropagation()}>
                        <h3 style={styles.modalTitle}>Unlock Bankroll Pro</h3>

                        <div style={styles.modalCost}>
                            <Diamond size={24} style={{ color: '#00D4FF' }} />
                            <span style={styles.modalCostValue}>{BANKROLL_PRO_DAY_COST}</span>
                            <span style={styles.modalCostLabel}>diamonds for 24 hours</span>
                        </div>

                        <div style={styles.balanceRow}>
                            Your balance: <strong>{access.diamonds || 0}</strong> 💎
                        </div>

                        {error && (
                            <div style={styles.errorBox}>{error}</div>
                        )}

                        {(access.diamonds || 0) < BANKROLL_PRO_DAY_COST && (
                            <div style={styles.insufficientBox}>
                                You need {BANKROLL_PRO_DAY_COST - (access.diamonds || 0)} more diamonds.
                                <button
                                    onClick={() => window.location.href = '/hub/diamond-store'}
                                    style={styles.buyDiamondsBtn}
                                >
                                    Get Diamonds
                                </button>
                            </div>
                        )}

                        <div style={styles.modalActions}>
                            <button onClick={() => setShowUnlockModal(false)} style={styles.cancelBtn}>
                                Cancel
                            </button>
                            <button
                                onClick={handleUnlock}
                                disabled={isUnlocking || (access.diamonds || 0) < BANKROLL_PRO_DAY_COST}
                                style={{
                                    ...styles.confirmBtn,
                                    opacity: (isUnlocking || (access.diamonds || 0) < BANKROLL_PRO_DAY_COST) ? 0.5 : 1
                                }}
                            >
                                {isUnlocking ? 'Unlocking...' : <><Diamond size={14} /> Unlock</>}
                            </button>
                        </div>

                        <p style={styles.modalNote}>
                            <Crown size={12} style={{ color: '#f59e0b' }} /> Go VIP for unlimited access to all premium features
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}

function formatTimeRemaining(expiresAt) {
    if (!expiresAt) return 'Active';
    const now = new Date();
    const expires = new Date(expiresAt);
    const diffMs = expires - now;

    if (diffMs <= 0) return 'Expired';

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
}

const styles = {
    loadingContainer: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 60,
        color: 'rgba(255,255,255,0.4)',
    },
    accessWrapper: {
        position: 'relative',
    },
    accessBadge: {
        position: 'absolute',
        top: -8,
        right: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        background: 'rgba(34,197,94,0.15)',
        border: '1px solid rgba(34,197,94,0.3)',
        borderRadius: 20,
        color: '#22c55e',
        fontSize: 10,
        fontWeight: 600,
        zIndex: 10,
    },
    lockedContainer: {
        textAlign: 'center',
        padding: '40px 24px',
        background: 'linear-gradient(180deg, rgba(0,212,255,0.05), rgba(0,0,0,0.2))',
        border: '1px solid rgba(0,212,255,0.15)',
        borderRadius: 16,
        margin: '20px 0',
    },
    lockedIcon: {
        width: 64,
        height: 64,
        margin: '0 auto 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,212,255,0.1)',
        borderRadius: '50%',
        color: '#00D4FF',
    },
    lockedTitle: {
        fontSize: 20,
        fontWeight: 700,
        color: '#fff',
        margin: '0 0 8px',
    },
    lockedDesc: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.6)',
        margin: '0 0 20px',
        maxWidth: 320,
        marginLeft: 'auto',
        marginRight: 'auto',
    },
    featureList: {
        listStyle: 'none',
        padding: 0,
        margin: '0 auto 24px',
        maxWidth: 260,
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontSize: 13,
        color: 'rgba(255,255,255,0.8)',
    },
    pricingBox: {
        padding: 20,
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        marginBottom: 16,
    },
    priceRow: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 16,
    },
    priceValue: {
        fontSize: 36,
        fontWeight: 800,
        color: '#00D4FF',
    },
    priceLabel: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
    },
    unlockBtn: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '14px 32px',
        background: 'linear-gradient(135deg, #00D4FF, #00A3CC)',
        border: 'none',
        borderRadius: 10,
        color: '#000',
        fontSize: 15,
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 4px 20px rgba(0,212,255,0.3)',
    },
    vipPromo: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
    },
    modalOverlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
    },
    modal: {
        width: '100%',
        maxWidth: 360,
        background: '#1a1a2e',
        borderRadius: 16,
        padding: 28,
        border: '1px solid rgba(255,255,255,0.1)',
        textAlign: 'center',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 20,
    },
    modalCost: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 16,
    },
    modalCostValue: {
        fontSize: 40,
        fontWeight: 800,
        color: '#00D4FF',
    },
    modalCostLabel: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
    },
    balanceRow: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 16,
    },
    errorBox: {
        padding: 12,
        background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 8,
        color: '#ef4444',
        fontSize: 13,
        marginBottom: 16,
    },
    insufficientBox: {
        padding: 14,
        background: 'rgba(245,158,11,0.1)',
        border: '1px solid rgba(245,158,11,0.3)',
        borderRadius: 8,
        color: '#f59e0b',
        fontSize: 13,
        marginBottom: 16,
    },
    buyDiamondsBtn: {
        display: 'block',
        width: '100%',
        marginTop: 10,
        padding: '8px 14px',
        background: 'rgba(245,158,11,0.2)',
        border: 'none',
        borderRadius: 6,
        color: '#f59e0b',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
    },
    modalActions: {
        display: 'flex',
        gap: 12,
        marginBottom: 16,
    },
    cancelBtn: {
        flex: 1,
        padding: '14px 0',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        cursor: 'pointer',
    },
    confirmBtn: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '14px 0',
        background: 'linear-gradient(135deg, #00D4FF, #00A3CC)',
        border: 'none',
        borderRadius: 10,
        color: '#000',
        fontSize: 14,
        fontWeight: 700,
        cursor: 'pointer',
    },
    modalNote: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        fontSize: 11,
        color: 'rgba(255,255,255,0.5)',
        margin: 0,
    },
};
