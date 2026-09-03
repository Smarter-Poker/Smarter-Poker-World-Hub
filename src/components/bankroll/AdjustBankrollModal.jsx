/**
 * ADJUST BANKROLL MODAL
 * ═══════════════════════════════════════════════════════════════
 * Deposit (add money) or Withdraw (remove money) from bankroll
 * For outside sources - e.g. paycheck deposit or bills withdrawal
 * ═══════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { useModalHistory } from '../../hooks/useModalHistory';
import { motion } from 'framer-motion';
import { adjustBankroll } from '../../lib/bankroll/bankrollSelectors';
import toast from '../../stores/toastStore';

export default function AdjustBankrollModal({ userId, onComplete, onClose }) {
    const [type, setType] = useState('deposit'); // 'deposit' | 'withdrawal'
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');
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
            await adjustBankroll(userId, value, type, reason);
            toast.success(
                type === 'deposit'
                    ? `$${value.toLocaleString()} Added To Bankroll`
                    : `$${value.toLocaleString()} Withdrawn From Bankroll`
            );
            onComplete();
        } catch (err) {
            toast.error(err.message || 'Failed To Adjust Bankroll');
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
                    <h2 style={styles.title}>Adjust Bankroll</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="bankroll-modal-close sp-icon-btn" style={styles.closeBtn}>
                        ×
                    </button>
                </div>
                <div className="bankroll-modal-body">
                <p style={styles.subtitle}>
                    Add Or Remove Money From Outside Sources (Not Gambling Results).
                </p>

                {/* Type Toggle */}
                <div style={styles.toggleRow}>
                    <button
                        type="button"
                        onClick={() => setType('deposit')}
                        style={{
                            ...styles.toggleBtn,
                            ...(type === 'deposit' ? styles.toggleBtnActive : {}),
                            ...(type === 'deposit' ? { borderColor: '#10b981', color: '#10b981', background: 'rgba(16, 185, 129, 0.12)' } : {}),
                        }}
                    >
                        + Deposit
                    </button>
                    <button
                        type="button"
                        onClick={() => setType('withdrawal')}
                        style={{
                            ...styles.toggleBtn,
                            ...(type === 'withdrawal' ? styles.toggleBtnActive : {}),
                            ...(type === 'withdrawal' ? { borderColor: '#ef4444', color: '#ef4444', background: 'rgba(239, 68, 68, 0.12)' } : {}),
                        }}
                    >
                        - Withdraw
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={styles.form}>
                    <div style={styles.inputWrapper}>
                        <span style={{
                            ...styles.dollarSign,
                            color: type === 'deposit' ? '#10b981' : '#ef4444',
                        }}>
                            {type === 'deposit' ? '+' : '-'}
                        </span>
                        <span style={{
                            ...styles.dollarSign,
                            color: type === 'deposit' ? '#10b981' : '#ef4444',
                            marginRight: 2,
                        }}>
                            $
                        </span>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={amount}
                            onChange={(e) => {
                                // Allow only digits and one decimal point
                                const val = e.target.value.replace(/[^0-9.]/g, '');
                                if ((val.match(/\./g) || []).length <= 1) setAmount(val);
                            }}
                            placeholder="0.00"
                            style={styles.input}
                            autoFocus
                        />
                    </div>

                    <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={type === 'deposit' ? 'e.g. Paycheck, Bonus, Transfer...' : 'e.g. Bills, Rent, Emergency...'}
                        style={styles.reasonInput}
                    />

                    <div className="bankroll-modal-footer" style={styles.actions}>
                        <button
                            type="submit"
                            disabled={isSubmitting || !amount}
                            style={{
                                ...styles.submitBtn,
                                background: type === 'deposit'
                                    ? 'linear-gradient(135deg, #10b981, #059669)'
                                    : 'linear-gradient(135deg, #ef4444, #dc2626)',
                                opacity: isSubmitting || !amount ? 0.5 : 1,
                            }}
                        >
                            {isSubmitting
                                ? 'Processing...'
                                : type === 'deposit'
                                    ? '+ Add To Bankroll'
                                    : '- Remove From Bankroll'}
                        </button>
                        <button type="button" onClick={onClose} style={styles.cancelBtn}>
                            Cancel
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
        border: '2px solid rgba(255,255,255,0.12)',
        borderRadius: 16,
        padding: '0 24px 24px',
        maxWidth: 420,
        width: '100%',
        maxHeight: '90dvh',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
    },
    headerRow: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '10px 0 6px',
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
    title: {
        fontSize: 20,
        fontWeight: 700,
        color: '#fff',
        margin: 0,
        textAlign: 'left',
    },
    subtitle: {
        fontSize: 14,
        color: '#94a3b8',
        margin: '0 0 20px',
        textAlign: 'center',
    },

    // Toggle
    toggleRow: {
        display: 'flex',
        gap: 8,
        marginBottom: 20,
    },
    toggleBtn: {
        flex: 1,
        background: 'rgba(255,255,255,0.1)',
        border: '2px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        padding: '12px 16px',
        minHeight: 44,
        color: '#94a3b8',
        fontSize: 15,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s',
        touchAction: 'manipulation',
    },
    toggleBtnActive: {
        // Colors applied inline based on type
    },

    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
    },
    inputWrapper: {
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(0,0,0,0.3)',
        border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 12,
        padding: '4px 16px',
    },
    dollarSign: {
        fontSize: 24,
        fontWeight: 700,
        marginRight: 0,
        flexShrink: 0,
        lineHeight: 1,
    },
    input: {
        flex: 1,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        boxShadow: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'textfield',
        color: '#fff',
        fontSize: 24,
        fontWeight: 700,
        padding: '10px 0',
        minWidth: 0,
        width: '100%',
    },
    reasonInput: {
        background: 'rgba(0,0,0,0.2)',
        border: '2px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        padding: '10px 14px',
        color: '#fff',
        fontSize: 14,
        outline: 'none',
        width: '100%',
        boxSizing: 'border-box',
    },

    actions: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        marginTop: 4,
        background: '#0a1628',
        padding: '8px 0 0',
    },
    submitBtn: {
        color: '#fff',
        border: 'none',
        borderRadius: 10,
        padding: '14px 24px',
        minHeight: 48,
        fontSize: 15,
        fontWeight: 600,
        cursor: 'pointer',
        touchAction: 'manipulation',
    },
    cancelBtn: {
        background: 'transparent',
        border: '2px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        padding: '10px 24px',
        minHeight: 44,
        color: '#94a3b8',
        fontSize: 14,
        cursor: 'pointer',
        touchAction: 'manipulation',
    },
};
