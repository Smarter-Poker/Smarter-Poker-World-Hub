/**
 * QUICK LOG WIDGET
 * Inline form for fast session logging
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { localDay } from '../../lib/bankroll/localDates.mjs';

// Clean SmarterPoker-style categories (no emojis)
const QUICK_CATEGORIES = [
    { id: 'poker_cash', label: 'Cash Game', icon: '', color: '#31a24c' },
    { id: 'poker_mtt', label: 'Tournament', icon: '', color: '#92cfff' },
    { id: 'casino_table', label: 'Table Games', icon: '', color: '#71aac8' },
    { id: 'sports', label: 'Sports Bet', icon: '', color: '#92cfff' },
    { id: 'expense', label: 'Expense', icon: '', color: '#ee5651' },
];

export default function QuickLogWidget({ userId, onSubmit, onOpenFullModal }) {
    const [category, setCategory] = useState('poker_cash');
    const [amount, setAmount] = useState('');
    const [isWin, setIsWin] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [failed, setFailed] = useState(false);

    const selectedCategory = QUICK_CATEGORIES.find(c => c.id === category);
    const isExpense = category === 'expense';
    // A positive amount with at most two decimals; "-5", "0" and "1e3" are not.
    const valid = /^\d+(?:\.\d{1,2})?$/.test(amount) && Number(amount) > 0;

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Sweep-5 audit fix: add isSubmitting guard to prevent double-submit
        // (rapid clicks before button disables) and wrap body in try/finally so
        // an uncaught throw can't leave isSubmitting stuck at true forever.
        if (!valid || !userId || isSubmitting) return;

        setIsSubmitting(true);
        try {
            const numAmount = Math.round(parseFloat(amount) * 100) / 100;
            // An expense is always money out; the win/loss toggle does not apply
            // (it used to record a "winning" expense as income).
            const isIncome = category !== 'expense' && isWin;
            const grossIn = isIncome ? 0 : numAmount;
            const grossOut = isIncome ? numAmount : 0;

            const formData = {
                category,
                entry_date: localDay(),
                gross_in: grossIn,
                gross_out: grossOut,
                notes: 'Quick logged',
            };

            try {
                await onSubmit?.(formData);
                setShowSuccess(true);
                setAmount('');
                setTimeout(() => setShowSuccess(false), 2000);
            } catch (error) {
                console.warn('Quick log failed:', error);
                setFailed(true);
                setTimeout(() => setFailed(false), 4000);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!userId) {
        return (
            <div className="sd-panel" style={styles.container}>
                <div style={styles.signInPrompt}>
                    <span style={styles.lockText}>Sign In To Log Sessions</span>
                </div>
            </div>
        );
    }

    return (
        <div className="sd-panel" style={styles.container}>
            <div style={styles.header}>
                <h4 style={styles.title}>Quick Log</h4>
                <button type="button" onClick={onOpenFullModal} style={styles.fullLogBtn}>
                    Full Form →
                </button>
            </div>

            <form onSubmit={handleSubmit} style={styles.form}>
                {/* Category Selector */}
                <div style={styles.categoryRow}>
                    {QUICK_CATEGORIES.map(cat => (
                        <button
                            key={cat.id}
                            type="button"
                            onClick={() => setCategory(cat.id)}
                            aria-pressed={category === cat.id}
                            style={{
                                ...styles.categoryBtn,
                                ...(category === cat.id ? {
                                    borderColor: cat.color,
                                    background: `${cat.color}20`,
                                } : {}),
                            }}
                        >
                            {/* The icons were emoji and were removed, which left
                                five blank buttons. The label is the button. */}
                            <span style={styles.categoryIcon}>{cat.label}</span>
                        </button>
                    ))}
                </div>

                {/* Amount Input */}
                <div style={styles.inputRow}>
                    {!isExpense && <div style={styles.winLossToggle} role="group" aria-label="Result">
                        <button
                            type="button"
                            aria-pressed={isWin}
                            aria-label="Win"
                            onClick={() => setIsWin(true)}
                            style={{
                                ...styles.toggleBtn,
                                ...(isWin ? styles.toggleBtnWin : {}),
                            }}
                        >
                            +
                        </button>
                        <button
                            type="button"
                            aria-pressed={!isWin}
                            aria-label="Loss"
                            onClick={() => setIsWin(false)}
                            style={{
                                ...styles.toggleBtn,
                                ...(!isWin ? styles.toggleBtnLoss : {}),
                            }}
                        >
                            −
                        </button>
                    </div>}

                    <div style={styles.amountWrapper}>
                        <span style={styles.dollarSign}>$</span>
                        <input
                            type="text"
                            inputMode="decimal"
                            aria-label="Amount"
                            value={amount}
                            onChange={(e) => { if (/^\d*(?:\.\d{0,2})?$/.test(e.target.value)) setAmount(e.target.value); }}
                            placeholder="0.00"
                            style={styles.amountInput}
                        />
                    </div>

                    <motion.button
                        type="submit"
                        disabled={!valid || isSubmitting}
                        style={{
                            ...styles.submitBtn,
                            opacity: !valid || isSubmitting ? 0.5 : 1,
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        {isSubmitting ? '...' : 'Log'}
                    </motion.button>
                </div>

                {/* Category Label */}
                <div style={styles.categoryLabel}>
                    <span style={{ color: selectedCategory?.color }}>
                        {selectedCategory?.label}
                    </span>
                    <span style={styles.resultLabel}>
                        {isExpense ? '• Money Out' : isWin ? '• Win' : '• Loss'}
                    </span>
                </div>
            </form>

            {/* Success Animation */}
            <AnimatePresence>
                {showSuccess && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        style={styles.successBanner}
                    >
                        Logged Successfully
                    </motion.div>
                )}
                {failed && (
                    <motion.div
                        role="alert"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        style={{ ...styles.successBanner, background: '#b3261e' }}
                    >
                        Not Saved. Please Try Again.
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

const styles = {
    container: {
        padding: 14,
        marginBottom: 16,
        position: 'relative',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    title: {
        margin: 0,
        fontSize: 14,
        fontWeight: 600,
        color: '#92cfff',
    },
    fullLogBtn: {
        padding: '4px 8px',
        background: 'transparent',
        border: 'none',
        color: '#9fb4c8',
        fontSize: 14,
        cursor: 'pointer',
    },
    form: {},
    categoryRow: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
        gap: 6,
        marginBottom: 12,
    },
    categoryBtn: {
        minWidth: 0,
        minHeight: 44,
        padding: '8px 4px',
        color: '#edf6ff',
        background: 'rgba(255,255,255,0.15)',
        border: '2px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    categoryIcon: {
        fontSize: 14,
        fontWeight: 600,
    },
    inputRow: {
        display: 'flex',
        gap: 8,
        alignItems: 'stretch',
    },
    winLossToggle: {
        display: 'flex',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: 8,
        overflow: 'hidden',
    },
    toggleBtn: {
        padding: '8px 12px',
        background: 'transparent',
        border: 'none',
        color: '#a1b4c7',
        fontSize: 18,
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    toggleBtnWin: {
        background: 'rgba(34,197,94,0.2)',
        color: '#22c55e',
    },
    toggleBtnLoss: {
        background: 'rgba(239,68,68,0.2)',
        color: '#ef4444',
    },
    amountWrapper: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: 8,
        padding: '0 12px',
    },
    dollarSign: {
        color: '#9fb4c8',
        fontSize: 16,
        marginRight: 4,
    },
    amountInput: {
        flex: 1,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        color: '#fff',
        fontSize: 18,
        fontWeight: 600,
        width: '100%',
    },
    submitBtn: {
        padding: '10px 20px',
        background: 'linear-gradient(135deg, #2374e1, #1a5fc9)',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    categoryLabel: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 10,
        fontSize: 14,
    },
    resultLabel: {
        color: '#a1b4c7',
    },
    successBanner: {
        position: 'absolute',
        bottom: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(34,197,94,0.9)',
        color: '#fff',
        padding: '6px 16px',
        borderRadius: 20,
        fontSize: 14,
        fontWeight: 500,
    },
    signInPrompt: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 20,
        color: '#a1b4c7',
    },
    lockIcon: {
        fontSize: 18,
    },
};
