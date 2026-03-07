/**
 * QUICK LOG WIDGET
 * Inline form for fast session logging
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Clean SmarterPoker-style categories (no emojis)
const QUICK_CATEGORIES = [
    { id: 'poker_cash', label: 'Cash Game', icon: '', color: '#31a24c' },
    { id: 'poker_mtt', label: 'Tournament', icon: '', color: '#2374e1' },
    { id: 'casino_table', label: 'Table Games', icon: '', color: '#9b59b6' },
    { id: 'sports', label: 'Sports Bet', icon: '', color: '#2374e1' },
    { id: 'expense', label: 'Expense', icon: '', color: '#f02849' },
];

export default function QuickLogWidget({ userId, onSubmit, onOpenFullModal }) {
    const [category, setCategory] = useState('poker_cash');
    const [amount, setAmount] = useState('');
    const [isWin, setIsWin] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    const selectedCategory = QUICK_CATEGORIES.find(c => c.id === category);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!amount || !userId) return;

        setIsSubmitting(true);

        const numAmount = parseFloat(amount);
        const grossIn = isWin ? 0 : numAmount;
        const grossOut = isWin ? numAmount : 0;

        const formData = {
            category,
            entry_date: new Date().toISOString().split('T')[0],
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
            console.error('Quick log failed:', error);
        }

        setIsSubmitting(false);
    };

    if (!userId) {
        return (
            <div style={styles.container}>
                <div style={styles.signInPrompt}>
                    <span style={styles.lockText}>Sign In To Log Sessions</span>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h4 style={styles.title}>Quick Log</h4>
                <button onClick={onOpenFullModal} style={styles.fullLogBtn}>
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
                            style={{
                                ...styles.categoryBtn,
                                ...(category === cat.id ? {
                                    borderColor: cat.color,
                                    background: `${cat.color}20`,
                                } : {}),
                            }}
                            title={cat.label}
                        >
                            <span style={styles.categoryIcon}>{cat.icon}</span>
                        </button>
                    ))}
                </div>

                {/* Amount Input */}
                <div style={styles.inputRow}>
                    <div style={styles.winLossToggle}>
                        <button
                            type="button"
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
                            onClick={() => setIsWin(false)}
                            style={{
                                ...styles.toggleBtn,
                                ...(!isWin ? styles.toggleBtnLoss : {}),
                            }}
                        >
                            −
                        </button>
                    </div>

                    <div style={styles.amountWrapper}>
                        <span style={styles.dollarSign}>$</span>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0"
                            style={styles.amountInput}
                            min="0"
                            step="any"
                        />
                    </div>

                    <motion.button
                        type="submit"
                        disabled={!amount || isSubmitting}
                        style={{
                            ...styles.submitBtn,
                            opacity: !amount || isSubmitting ? 0.5 : 1,
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
                        {selectedCategory?.icon} {selectedCategory?.label}
                    </span>
                    <span style={styles.resultLabel}>
                        {isWin ? '• Win' : '• Loss'}
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
                        ✓ Logged successfully!
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

const styles = {
    container: {
        background: 'linear-gradient(135deg, rgba(0,40,60,0.9), rgba(0,60,80,0.8))',
        borderRadius: 12,
        border: '2px solid rgba(0,212,255,0.3)',
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
        color: '#2374e1',
    },
    fullLogBtn: {
        padding: '4px 8px',
        background: 'transparent',
        border: 'none',
        color: '#888',
        fontSize: 14,
        cursor: 'pointer',
    },
    form: {},
    categoryRow: {
        display: 'flex',
        gap: 6,
        marginBottom: 12,
    },
    categoryBtn: {
        flex: 1,
        padding: '8px 4px',
        background: 'rgba(255,255,255,0.15)',
        border: '2px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    categoryIcon: {
        fontSize: 18,
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
        color: '#8a8d91',
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
        color: '#888',
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
        color: '#8a8d91',
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
        color: '#8a8d91',
    },
    lockIcon: {
        fontSize: 18,
    },
};
