/**
 * STARTING BANKROLL MODAL
 * ═══════════════════════════════════════════════════════════════
 * First-time setup: asks user for their starting bankroll
 * before they can log any entries
 * ═══════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { useModalHistory } from '../../hooks/useModalHistory';
import { motion } from 'framer-motion';
import { setStartingBankroll } from '../../lib/bankroll/bankrollSelectors';
import toast from '../../stores/toastStore';

export default function StartingBankrollModal({ userId, onComplete, onClose }) {
    const [amount, setAmount] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Phone back gesture closes the sheet (mobile phase 0a). Mounted only while
    // open, so isOpen is constant; the unmount cleanup pops our entry if an
    // X-close left it on top.
    useModalHistory(true, onClose);
    useEffect(() => () => {
        try {
            if (typeof window !== 'undefined' && window.history && window.history.state && window.history.state.spModal) window.history.back();
        } catch (_) { /* history unavailable */ }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const value = parseFloat(amount);
        if (!value || value <= 0) {
            toast.error('Please Enter A Valid Amount');
            return;
        }

        setIsSubmitting(true);
        try {
            await setStartingBankroll(userId, value);
            toast.success(`Starting Bankroll Set To $${value.toLocaleString()}`);
            onComplete();
        } catch (err) {
            toast.error(err.message || 'Failed To Set Starting Bankroll');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <motion.div
            className="bankroll-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={styles.overlay}
            onClick={onClose}
        >
            <motion.div
                className="bankroll-modal"
                role="dialog"
                aria-modal="true"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                style={styles.modal}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bankroll-sheet-handle" aria-hidden="true" />
                <div className="bankroll-modal-header" style={styles.headerRow}>
                    <button type="button" onClick={onClose} aria-label="Close" className="bankroll-modal-close sp-icon-btn" style={styles.closeBtn}>
                        ×
                    </button>
                </div>
                <div className="bankroll-modal-body">
                <div style={styles.iconCircle}>$</div>

                <h2 style={styles.title}>Set Your Starting Bankroll</h2>
                <p style={styles.subtitle}>
                    Before Logging Sessions, Tell Us How Much Money You&apos;Re Starting With.
                    This Is The Total Amount Dedicated To Gambling.
                </p>

                <form onSubmit={handleSubmit} style={styles.form}>
                    <div style={styles.inputWrapper}>
                        <span style={styles.dollarSign}>$</span>
                        <input
                            type="number"
                            inputMode="decimal"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.00"
                            min="1"
                            step="0.01"
                            style={styles.input}
                            autoFocus
                        />
                    </div>

                    <div style={styles.presets}>
                        {[500, 1000, 2500, 5000, 10000].map(val => (
                            <button
                                key={val}
                                type="button"
                                onClick={() => setAmount(val.toString())}
                                style={{
                                    ...styles.presetBtn,
                                    ...(amount === val.toString() ? styles.presetBtnActive : {}),
                                }}
                            >
                                ${val.toLocaleString()}
                            </button>
                        ))}
                    </div>

                    <p style={styles.hint}>
                        You Can Add Or Withdraw From Your Bankroll At Any Time From The Dashboard.
                    </p>

                    <div className="bankroll-modal-footer" style={styles.footer}>
                        <button
                            type="submit"
                            disabled={isSubmitting || !amount}
                            style={{
                                ...styles.submitBtn,
                                opacity: isSubmitting || !amount ? 0.5 : 1,
                            }}
                        >
                            {isSubmitting ? 'Setting Up...' : 'Start Tracking'}
                        </button>
                    </div>
                </form>
                </div>
            </motion.div>
        </motion.div>
    );
}

const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
    },
    modal: {
        background: 'linear-gradient(180deg, #0d1f3c 0%, #0a1628 100%)',
        border: '2px solid rgba(59, 130, 246, 0.3)',
        borderRadius: 16,
        padding: '0 24px 24px',
        maxWidth: 440,
        width: '100%',
        textAlign: 'center',
        maxHeight: '90dvh',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
    },
    headerRow: {
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '8px 0 0',
        flexShrink: 0,
    },
    closeBtn: {
        width: 44,
        height: 44,
        minWidth: 44,
        minHeight: 44,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.08)',
        border: 'none',
        color: '#fff',
        fontSize: 22,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
    },
    footer: {
        background: '#0a1628',
        padding: '8px 0 0',
    },
    iconCircle: {
        width: 64,
        height: 64,
        borderRadius: '50%',
        background: 'rgba(59, 130, 246, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 32,
        margin: '0 auto 20px',
    },
    title: {
        fontSize: 22,
        fontWeight: 700,
        color: '#fff',
        margin: '0 0 8px',
    },
    subtitle: {
        fontSize: 14,
        color: '#94a3b8',
        lineHeight: 1.5,
        margin: '0 0 24px',
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
    },
    inputWrapper: {
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(0,0,0,0.3)',
        border: '2px solid rgba(59, 130, 246, 0.3)',
        borderRadius: 12,
        padding: '4px 16px',
    },
    dollarSign: {
        fontSize: 28,
        fontWeight: 700,
        color: '#3b82f6',
        marginRight: 4,
    },
    input: {
        flex: 1,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        color: '#fff',
        fontSize: 28,
        fontWeight: 700,
        padding: '12px 0',
        textAlign: 'left',
        minWidth: 0,
        width: '100%',
    },
    presets: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'center',
    },
    presetBtn: {
        background: 'rgba(255,255,255,0.15)',
        border: '2px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        padding: '8px 14px',
        minHeight: 44,
        color: '#94a3b8',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.15s',
        touchAction: 'manipulation',
    },
    presetBtnActive: {
        background: 'rgba(59, 130, 246, 0.2)',
        borderColor: 'rgba(59, 130, 246, 0.5)',
        color: '#3b82f6',
    },
    hint: {
        fontSize: 14,
        color: '#64748b',
        margin: 0,
    },
    submitBtn: {
        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
        color: '#fff',
        border: 'none',
        borderRadius: 10,
        padding: '14px 24px',
        minHeight: 48,
        width: '100%',
        fontSize: 16,
        fontWeight: 600,
        cursor: 'pointer',
        marginTop: 4,
        touchAction: 'manipulation',
    },
};
