/**
 * ADJUST BANKROLL MODAL
 * ═══════════════════════════════════════════════════════════════
 * Deposit (add money) or Withdraw (remove money) from bankroll
 * For outside sources — e.g. paycheck deposit or bills withdrawal
 * ═══════════════════════════════════════════════════════════════
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { adjustBankroll } from '../../lib/bankroll/bankrollSelectors';
import toast from '../../stores/toastStore';

export default function AdjustBankrollModal({ userId, onComplete, onClose }) {
    const [type, setType] = useState('deposit'); // 'deposit' | 'withdrawal'
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const value = parseFloat(amount);
        if (!value || value <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }

        setIsSubmitting(true);
        try {
            await adjustBankroll(userId, value, type, reason);
            toast.success(
                type === 'deposit'
                    ? `$${value.toLocaleString()} added to bankroll 💵`
                    : `$${value.toLocaleString()} withdrawn from bankroll`
            );
            onComplete();
        } catch (err) {
            toast.error(err.message || 'Failed to adjust bankroll');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={styles.overlay}
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                style={styles.modal}
                onClick={(e) => e.stopPropagation()}
            >
                <h2 style={styles.title}>Adjust Bankroll</h2>
                <p style={styles.subtitle}>
                    Add or remove money from outside sources (not gambling results).
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
                        − Withdraw
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

                    <div style={styles.actions}>
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
                                    ? '+ Add to Bankroll'
                                    : '− Remove from Bankroll'}
                        </button>
                        <button type="button" onClick={onClose} style={styles.cancelBtn}>
                            Cancel
                        </button>
                    </div>
                </form>
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
        border: '1px solid rgba(59, 130, 246, 0.3)',
        borderRadius: 16,
        padding: 28,
        maxWidth: 420,
        width: '100%',
    },
    title: {
        fontSize: 20,
        fontWeight: 700,
        color: '#fff',
        margin: '0 0 6px',
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 13,
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
        background: 'rgba(255,255,255,0.04)',
        border: '2px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        padding: '12px 16px',
        color: '#94a3b8',
        fontSize: 15,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s',
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
        border: '1px solid rgba(255,255,255,0.15)',
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
        color: '#fff',
        fontSize: 24,
        fontWeight: 700,
        padding: '10px 0',
    },
    reasonInput: {
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,255,255,0.1)',
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
    },
    submitBtn: {
        color: '#fff',
        border: 'none',
        borderRadius: 10,
        padding: '14px 24px',
        fontSize: 15,
        fontWeight: 600,
        cursor: 'pointer',
    },
    cancelBtn: {
        background: 'transparent',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        padding: '10px 24px',
        color: '#94a3b8',
        fontSize: 14,
        cursor: 'pointer',
    },
};
