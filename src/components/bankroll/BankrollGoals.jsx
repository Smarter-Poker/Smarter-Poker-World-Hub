import BankrollHeaderAdd from './BankrollHeaderAdd';
/**
 * BANKROLL GOALS COMPONENT
 * Set and track profit targets with progress visualization
 */

import { GRADIENTS, METAL } from './metalStyles';
import { useState, useEffect, useMemo } from 'react';
import { usePendingDeletes, scheduleDelete } from './usePendingDeletes';
import { withoutHidden } from '../../lib/bankroll/pendingDeletes.mjs';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { localDay, parseLedgerDay } from '../../lib/bankroll/localDates.mjs';
import { fetchReportLedger } from '../../lib/bankroll/bankrollSelectors';
import { resultsCents, toCents } from '../../lib/bankroll/ledgerMath.mjs';
import { formatCentsCurrency } from '../../lib/bankroll/currencyUtils';
import toast from '../../stores/toastStore';

const PERIOD_OPTIONS = [
    { id: 'weekly', label: 'Weekly', days: 7 },
    { id: 'monthly', label: 'Monthly', days: 30 },
    { id: 'quarterly', label: 'Quarterly', days: 90 },
    { id: 'yearly', label: 'Yearly', days: 365 },
];

// Progress is the player's net results (sessions and expenses, never deposits
// or withdrawals) between the goal's own start and end days. It used to come
// from a periodPL prop fed by stats.monthlyPL, a field getBankrollStats never
// returned, so every goal sat at $0 and 0% however the player was doing.
export default function BankrollGoals({ userId, displayEUR = false }) {
    const [loadedGoals, setGoals] = useState([]);
    // Removing a goal waits out an undo window (usePendingDeletes).
    const { hidden } = usePendingDeletes(userId);
    const goals = useMemo(() => withoutHidden(loadedGoals, hidden, 'goal'), [loadedGoals, hidden]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [progress, setProgress] = useState({ goalId: null, cents: null, failed: false });
    const [saving, setSaving] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
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

            if (error) throw error;
            setGoals(data || []);
            setLoadFailed(false);
        } catch (err) {
            console.warn('[BankrollGoals] Error:', err);
            setLoadFailed(true);
        }
        setIsLoading(false);
    }

    async function addGoal() {
        if (!userId) return;
        if (!newGoal.target) {
            toast.error('Enter A Target Profit');
            return;
        }

        const targetAmount = parseFloat(newGoal.target);
        if (isNaN(targetAmount) || targetAmount <= 0) {
            toast.error('Enter A Target Greater Than $0');
            return;
        }

        const periodConfig = PERIOD_OPTIONS.find(p => p.id === newGoal.period);
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + periodConfig.days);

        if (saving) return;
        setSaving(true);
        try {
            const { data, error } = await supabase
                .from('bankroll_goals')
                .insert({
                    user_id: userId,
                    target_amount: targetAmount,
                    period: newGoal.period,
                    start_date: localDay(startDate),
                    end_date: localDay(endDate),
                })
                .select()
                .maybeSingle();

            if (error || !data) throw error || new Error('Goal not saved');
            setGoals(prev => [data, ...prev]);
            setNewGoal({ target: '', period: 'monthly' });
            setShowAddGoal(false);
            toast.success('Goal Set');
        } catch (err) {
            console.warn('[BankrollGoals] Add error:', err);
            toast.error('Failed To Set Goal');
        } finally {
            setSaving(false);
        }
    }

    // Hidden now with Undo; the one delete call is sent when the window
    // closes. A failure brings the goal back with the error.
    function deleteGoal(goalId) {
        if (!userId) return;
        scheduleDelete(userId, 'goal', goalId, 'Goal Removed');
    }

    // Goal days are calendar days in the player's own time zone. Comparing
    // `new Date(end_date)` (UTC midnight) with now ended every goal at 6 PM
    // Chicago time on the day before its last day.
    const today = localDay();
    const activeGoal = goals.find(g => g.end_date && String(g.end_date).slice(0, 10) >= today && String(g.start_date || '').slice(0, 10) <= today)
        || goals.find(g => g.end_date && String(g.end_date).slice(0, 10) >= today);

    useEffect(() => {
        if (!userId || !activeGoal) return undefined;
        let cancelled = false;
        const end = String(activeGoal.end_date).slice(0, 10);
        setProgress({ goalId: activeGoal.id, cents: null, failed: false });
        fetchReportLedger(userId, {
            startDate: String(activeGoal.start_date).slice(0, 10),
            endDate: end < today ? end : today,
            includeExpenses: true,
        }).then(rows => {
            if (!cancelled) setProgress({ goalId: activeGoal.id, cents: resultsCents(rows), failed: false });
        }).catch(err => {
            console.warn('[BankrollGoals] Progress error:', err);
            if (!cancelled) setProgress({ goalId: activeGoal.id, cents: null, failed: true });
        });
        return () => { cancelled = true; };
    }, [userId, activeGoal?.id, activeGoal?.start_date, activeGoal?.end_date, today, refreshKey]);

    // A session logged or deleted elsewhere on the page moves the progress too.
    useEffect(() => {
        const refresh = () => setRefreshKey(k => k + 1);
        window.addEventListener('bankroll-updated', refresh);
        return () => window.removeEventListener('bankroll-updated', refresh);
    }, []);

    const earnedCents = progress.goalId === activeGoal?.id ? progress.cents : null;
    const targetCents = activeGoal ? toCents(activeGoal.target_amount) : 0;

    function calculateProgress() {
        if (earnedCents === null || !(targetCents > 0)) return 0;
        return Math.min(100, Math.max(0, (earnedCents / targetCents) * 100));
    }

    function getDaysRemaining(endDate) {
        // Inclusive of today: a goal that ends today has 1 day left.
        const end = parseLedgerDay(String(endDate).slice(0, 10));
        const now = parseLedgerDay(today);
        return Math.max(0, Math.round((end - now) / 86400000) + 1);
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
                                inputMode="decimal"
                                min="0"
                                aria-label="Target Profit"
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
                                    type="button"
                                    aria-pressed={newGoal.period === period.id}
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
                            <button type="button" onClick={() => setShowAddGoal(false)} style={styles.cancelBtn}>
                                Cancel
                            </button>
                            <button type="button" onClick={addGoal} disabled={saving} style={{ ...styles.saveBtn, opacity: saving ? 0.6 : 1 }}>
                                {saving ? 'Saving...' : 'Set Goal'}
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
                                {formatCentsCurrency(targetCents, displayEUR)}
                            </span>
                        </div>
                        <button
                            type="button"
                            aria-label="Remove Goal"
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
                                color: (earnedCents || 0) >= 0 ? '#22c55e' : '#ef4444',
                                fontWeight: 600
                            }}>
                                {progress.failed && progress.goalId === activeGoal.id
                                    ? 'Progress Unavailable'
                                    : earnedCents === null ? 'Loading...' : formatCentsCurrency(earnedCents, displayEUR, { signed: true }) + ' Of ' + formatCentsCurrency(targetCents, displayEUR)}
                            </span>
                            <span style={styles.progressPercent}>
                                {Math.round(calculateProgress(activeGoal))}%
                            </span>
                        </div>
                    </div>

                    <div style={styles.daysRemaining}>
                        {getDaysRemaining(activeGoal.end_date)} Days Remaining
                    </div>

                    {/* Milestone Check */}
                    {calculateProgress(activeGoal) >= 100 && (
                        <div style={styles.milestone}>
                            Goal Achieved!
                        </div>
                    )}
                </div>
            )}

            {!isLoading && loadFailed && (
                <div style={styles.emptyState} role="alert">
                    <span>Could Not Load Your Goals.</span>
                    <button type="button" onClick={() => { setIsLoading(true); fetchGoals(); }} style={styles.setGoalBtn}>
                        Try Again
                    </button>
                </div>
            )}

            {/* No Goals State */}
            {!isLoading && !loadFailed && !activeGoal && !showAddGoal && (
                <div style={styles.emptyState}>
                    <span style={{ opacity: 0.5 }}>No Active Goal</span>
                    <BankrollHeaderAdd label="Set A Profit Target" onClick={() => setShowAddGoal(true)}>
                        <button onClick={() => setShowAddGoal(true)} style={styles.setGoalBtn}>
                            Set A Profit Target
                        </button>
                    </BankrollHeaderAdd>
                </div>
            )}
        </div>
    );
}

const styles = {
    container: {
        background: GRADIENTS.darkPanel,
        borderRadius: 12,
        border: `1px solid ${METAL.highlight}`,
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
        color: '#92cfff',
    },
    addBtn: {
        width: 28,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: GRADIENTS.cyanAction,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 6,
        color: '#edf6ff',
        fontSize: 18,
        cursor: 'pointer',
    },
    loading: {
        padding: 20,
        textAlign: 'center',
        color: '#a1b4c7',
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
        background: GRADIENTS.metalButton,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 6,
        color: '#edf6ff',
        fontSize: 14,
        cursor: 'pointer',
    },
    periodBtnActive: {
        background: 'rgba(0,212,255,0.2)',
        borderColor: '#2374e1',
        color: '#92cfff',
    },
    formActions: {
        display: 'flex',
        gap: 8,
    },
    cancelBtn: {
        flex: 1,
        padding: '10px',
        background: GRADIENTS.metalButton,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 8,
        color: '#edf6ff',
        cursor: 'pointer',
    },
    saveBtn: {
        flex: 1,
        padding: '10px',
        background: GRADIENTS.cyanAction,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 8,
        color: '#edf6ff',
        fontWeight: 600,
        cursor: 'pointer',
    },
    goalCard: {
        background: GRADIENTS.darkPanel,
        border: `1px solid ${METAL.highlight}`,
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
        color: '#9fb4c8',
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
        color: '#a1b4c7',
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
        color: '#9fb4c8',
    },
    daysRemaining: {
        fontSize: 14,
        color: '#a1b4c7',
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
        color: '#a1b4c7',
        fontSize: 14,
    },
    setGoalBtn: {
        padding: '8px 16px',
        background: GRADIENTS.cyanAction,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 6,
        color: '#edf6ff',
        fontSize: 14,
        cursor: 'pointer',
    },
    signInPrompt: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 20,
        color: '#a1b4c7',
        fontSize: 14,
    },
};
