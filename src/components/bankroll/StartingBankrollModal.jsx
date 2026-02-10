/**
 * STARTING BANKROLL MODAL
 * ═══════════════════════════════════════════════════════════════
 * First-time setup: asks user for their starting bankroll
 * before they can log any entries
 * ═══════════════════════════════════════════════════════════════
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { setStartingBankroll } from '../../lib/bankroll/bankrollSelectors';
import toast from '../../stores/toastStore';

export default function StartingBankrollModal({ userId, onComplete, onClose }) {
    const [amount, setAmount] = useState('');
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
            await setStartingBankroll(userId, value);
            toast.success(`Starting bankroll set to $${value.toLocaleString()}!`);
            onComplete();
        } catch (err) {
            toast.error(err.message || 'Failed to set starting bankroll');
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
                <div style={styles.iconCircle}>$</div>

                <h2 style={styles.title}>Set Your Starting Bankroll</h2>
                <p style={styles.subtitle}>
                    Before logging sessions, tell us how much money you&apos;re starting with.
                    This is the total amount dedicated to gambling.
                </p>

                <form onSubmit={handleSubmit} style={styles.form}>
                    <div style={styles.inputWrapper}>
                        <span style={styles.dollarSign}>$</span>
                        <input
                            type="number"
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
                        You can add or withdraw from your bankroll at any time from the dashboard.
                    </p>

                    <button
                        type="submit"
                        disabled={isSubmitting || !amount}
                        style={{
                            ...styles.submitBtn,
                            opacity: isSubmitting || !amount ? 0.5 : 1,
                        }}
                    >
                        {isSubmitting ? 'Setting up...' : 'Start Tracking →'}
                    </button>
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
        padding: 32,
        maxWidth: 440,
        width: '100%',
        textAlign: 'center',
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
    },
    presets: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'center',
    },
    presetBtn: {
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        padding: '8px 14px',
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.15s',
    },
    presetBtnActive: {
        background: 'rgba(59, 130, 246, 0.2)',
        borderColor: 'rgba(59, 130, 246, 0.5)',
        color: '#3b82f6',
    },
    hint: {
        fontSize: 12,
        color: '#64748b',
        margin: 0,
    },
    submitBtn: {
        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
        color: '#fff',
        border: 'none',
        borderRadius: 10,
        padding: '14px 24px',
        fontSize: 16,
        fontWeight: 600,
        cursor: 'pointer',
        marginTop: 4,
    },
};
