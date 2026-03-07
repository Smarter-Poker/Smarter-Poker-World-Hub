/**
 * BANKROLL GOALS COMPONENT
 * Set and track profit targets with progress visualization
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';

const PERIOD_OPTIONS = [
    { id: 'weekly', label: 'Weekly', days: 7 },
    { id: 'monthly', label: 'Monthly', days: 30 },
    { id: 'quarterly', label: 'Quarterly', days: 90 },
    { id: 'yearly', label: 'Yearly', days: 365 },
];

export default function BankrollGoals({ userId, currentBankroll = 0, periodPL = 0 }) {
    const [goals, setGoals] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddGoal, setShowAddGoal] = useState(false);
    const [newGoal, setNewGoal] = useState({ target: '', period: 'monthly' });

    useEffect(() => {
        if (userId) {
            fetchGoals();
        } else {
            setIsLoading(false);
        }
    }, [userId]);

    async function fetchGoals() {
        try {
            const { data, error } = await supabase
                .from('bankroll_goals')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (!error && data) {
                setGoals(data);
            }
        } catch (err) {
            console.error('[BankrollGoals] Error:', err);
        }
        setIsLoading(false);
    }

    async function addGoal() {
        if (!newGoal.target || !userId) return;

        const targetAmount = parseFloat(newGoal.target);
        if (isNaN(targetAmount) || targetAmount <= 0) return;

        const periodConfig = PERIOD_OPTIONS.find(p => p.id === newGoal.period);
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + periodConfig.days);

        try {
            const { data, error } = await supabase
                .from('bankroll_goals')
                .insert({
                    user_id: userId,
                    target_amount: targetAmount,
                    period: newGoal.period,
                    start_date: startDate.toISOString().split('T')[0],
                    end_date: endDate.toISOString().split('T')[0],
                })
                .select()
                .single();

            if (!error && data) {
                setGoals([data, ...goals]);
                setNewGoal({ target: '', period: 'monthly' });
                setShowAddGoal(false);
            }
        } catch (err) {
            console.error('[BankrollGoals] Add error:', err);
        }
    }

    async function deleteGoal(goalId) {
        try {
            await supabase.from('bankroll_goals').delete().eq('id', goalId);
            setGoals(goals.filter(g => g.id !== goalId));
        } catch (err) {
            console.error('[BankrollGoals] Delete error:', err);
        }
    }

    function calculateProgress(goal) {
        const target = goal.target_amount;
        const progress = Math.min(100, Math.max(0, (periodPL / target) * 100));
        return progress;
    }

    function getDaysRemaining(endDate) {
        const end = new Date(endDate);
        const now = new Date();
        const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
        return Math.max(0, diff);
    }

    if (!userId) {
        return (
            <div style={styles.container}>
                <div style={styles.signInPrompt}>
                    <span>Sign In To Set Goals</span>
                </div>
            </div>
        );
    }

    const activeGoal = goals.find(g => new Date(g.end_date) >= new Date());

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.titleRow}>
                    <h4 style={styles.title}>Goals</h4>
                </div>
            </div>

            {isLoading && (
                <div style={styles.loading}>Loading...</div>
            )}

            {/* Add Goal Form */}
            <AnimatePresence>
                {showAddGoal && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={styles.addForm}
                    >
                        <div style={styles.formRow}>
                            <span style={styles.dollarSign}>$</span>
                            <input
                                type="number"
                                value={newGoal.target}
                                onChange={(e) => setNewGoal({ ...newGoal, target: e.target.value })}
                                placeholder="Target Profit"
                                style={styles.input}
                            />
                        </div>
                        <div style={styles.periodRow}>
                            {PERIOD_OPTIONS.map(period => (
                                <button
                                    key={period.id}
                                    onClick={() => setNewGoal({ ...newGoal, period: period.id })}
                                    style={{
                                        ...styles.periodBtn,
                                        ...(newGoal.period === period.id ? styles.periodBtnActive : {}),
                                    }}
                                >
                                    {period.label}
                                </button>
                            ))}
                        </div>
                        <div style={styles.formActions}>
                            <button onClick={() => setShowAddGoal(false)} style={styles.cancelBtn}>
                                Cancel
                            </button>
                            <button onClick={addGoal} style={styles.saveBtn}>
                                Set Goal
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Active Goal Display */}
            {activeGoal && (
                <div style={styles.goalCard}>
                    <div style={styles.goalHeader}>
                        <div>
                            <span style={styles.goalPeriod}>
                                {PERIOD_OPTIONS.find(p => p.id === activeGoal.period)?.label || 'Goal'}
                            </span>
                            <span style={styles.goalTarget}>
                                ${activeGoal.target_amount.toLocaleString()}
                            </span>
                        </div>
                        <button
                            onClick={() => deleteGoal(activeGoal.id)}
                            style={styles.deleteBtn}
                        >
                            ×
                        </button>
                    </div>

                    {/* Progress Bar */}
                    <div style={styles.progressContainer}>
                        <div style={styles.progressBar}>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${calculateProgress(activeGoal)}%` }}
                                transition={{ duration: 0.5 }}
                                style={{
                                    ...styles.progressFill,
                                    background: calculateProgress(activeGoal) >= 100
                                        ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                                        : 'linear-gradient(90deg, #2374e1, #1a5fc9)',
                                }}
                            />
                        </div>
                        <div style={styles.progressStats}>
                            <span style={{
                                color: periodPL >= 0 ? '#22c55e' : '#ef4444',
                                fontWeight: 600
                            }}>
                                ${periodPL >= 0 ? '+' : ''}{periodPL.toLocaleString()}
                            </span>
                            <span style={styles.progressPercent}>
                                {Math.round(calculateProgress(activeGoal))}%
                            </span>
                        </div>
                    </div>

                    <div style={styles.daysRemaining}>
                        {getDaysRemaining(activeGoal.end_date)} days remaining
                    </div>

                    {/* Milestone Check */}
                    {calculateProgress(activeGoal) >= 100 && (
                        <div style={styles.milestone}>
                            Goal achieved!
                        </div>
                    )}
                </div>
            )}

            {/* No Goals State */}
            {!isLoading && !activeGoal && !showAddGoal && (
                <div style={styles.emptyState}>
                    <span style={{ opacity: 0.5 }}>No Active Goal</span>
                    <button onClick={() => setShowAddGoal(true)} style={styles.setGoalBtn}>
                        Set a Profit Target
                    </button>
                </div>
            )}
        </div>
    );
}

const styles = {
    container: {
        background: 'linear-gradient(135deg, rgba(0,30,60,0.95), rgba(0,20,40,0.9))',
        borderRadius: 12,
        border: '2px solid rgba(0,212,255,0.2)',
        padding: 14,
        marginBottom: 16,
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    titleRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    icon: {
        fontSize: 16,
    },
    title: {
        margin: 0,
        fontSize: 14,
        fontWeight: 600,
        color: '#2374e1',
    },
    addBtn: {
        width: 28,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,212,255,0.2)',
        border: '2px solid rgba(0,212,255,0.4)',
        borderRadius: 6,
        color: '#2374e1',
        fontSize: 18,
        cursor: 'pointer',
    },
    loading: {
        padding: 20,
        textAlign: 'center',
        color: '#8a8d91',
        fontSize: 14,
    },
    addForm: {
        overflow: 'hidden',
    },
    formRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
    },
    dollarSign: {
        color: '#22c55e',
        fontSize: 18,
        fontWeight: 600,
    },
    input: {
        flex: 1,
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.15)',
        border: '2px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        color: '#fff',
        fontSize: 16,
        outline: 'none',
    },
    periodRow: {
        display: 'flex',
        gap: 6,
        marginBottom: 12,
    },
    periodBtn: {
        flex: 1,
        padding: '8px 4px',
        background: 'rgba(255,255,255,0.15)',
        border: '2px solid rgba(255,255,255,0.1)',
        borderRadius: 6,
        color: '#888',
        fontSize: 14,
        cursor: 'pointer',
    },
    periodBtnActive: {
        background: 'rgba(0,212,255,0.2)',
        borderColor: '#2374e1',
        color: '#2374e1',
    },
    formActions: {
        display: 'flex',
        gap: 8,
    },
    cancelBtn: {
        flex: 1,
        padding: '10px',
        background: 'rgba(255,255,255,0.15)',
        border: '2px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        color: '#888',
        cursor: 'pointer',
    },
    saveBtn: {
        flex: 1,
        padding: '10px',
        background: 'linear-gradient(135deg, #2374e1, #1a5fc9)',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        fontWeight: 600,
        cursor: 'pointer',
    },
    goalCard: {
        background: 'rgba(0,212,255,0.05)',
        border: '2px solid rgba(0,212,255,0.2)',
        borderRadius: 10,
        padding: 12,
    },
    goalHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 10,
    },
    goalPeriod: {
        fontSize: 14,
        color: '#888',
        textTransform: 'uppercase',
        display: 'block',
        marginBottom: 2,
    },
    goalTarget: {
        fontSize: 20,
        fontWeight: 700,
        color: '#fff',
    },
    deleteBtn: {
        width: 24,
        height: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        color: '#8a8d91',
        fontSize: 18,
        cursor: 'pointer',
    },
    progressContainer: {
        marginBottom: 8,
    },
    progressBar: {
        height: 8,
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 6,
    },
    progressFill: {
        height: '100%',
        borderRadius: 4,
    },
    progressStats: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 14,
    },
    progressPercent: {
        color: '#888',
    },
    daysRemaining: {
        fontSize: 14,
        color: '#8a8d91',
        textAlign: 'center',
    },
    milestone: {
        marginTop: 10,
        padding: '8px 12px',
        background: 'rgba(34,197,94,0.2)',
        border: '2px solid rgba(34,197,94,0.4)',
        borderRadius: 6,
        color: '#22c55e',
        fontSize: 14,
        fontWeight: 600,
        textAlign: 'center',
    },
    emptyState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        padding: 16,
        color: '#8a8d91',
        fontSize: 14,
    },
    setGoalBtn: {
        padding: '8px 16px',
        background: 'rgba(0,212,255,0.1)',
        border: '2px solid rgba(0,212,255,0.3)',
        borderRadius: 6,
        color: '#2374e1',
        fontSize: 14,
        cursor: 'pointer',
    },
    signInPrompt: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 20,
        color: '#8a8d91',
        fontSize: 14,
    },
};
