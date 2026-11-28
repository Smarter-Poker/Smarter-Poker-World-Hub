import BankrollHeaderAdd from './BankrollHeaderAdd';
/**
 * CATEGORY OVERVIEW (?type=cash|tournament|casino|slots|sports|expense)
 * Filtered view of ledger entries by category with Add, Edit and Delete.
 *
 * Add and Edit go through the page (onAddEntry / onEditEntry), so a category
 * entry passes the same gates as the dashboard's Add + (sign-in, online,
 * Bankroll Pro, starting bankroll) and is judged against the Bankroll Rules
 * once saved. This view used to open its own LogEntryModal, which skipped
 * all of them. It reloads on 'bankroll-updated', which every save, delete
 * and adjustment dispatches.
 */

import { GRADIENTS, METAL } from './metalStyles';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchReportLedger } from '../../lib/bankroll/bankrollSelectors';
import { withoutHidden } from '../../lib/bankroll/pendingDeletes.mjs';
import { usePendingDeletes, scheduleLedgerDelete } from './usePendingDeletes';
import { entryCents } from '../../lib/bankroll/ledgerMath.mjs';
import { formatCentsCurrency } from '../../lib/bankroll/currencyUtils';
import LedgerTimeline from './LedgerTimeline';
import toast from '../../stores/toastStore';

const CATEGORY_META = {
    poker_cash: { label: 'Cash Games', single: 'Cash Game', color: '#22c55e' },
    poker_mtt: { label: 'Tournaments', single: 'Tournament', color: '#a9c6e6' },
    casino_table: { label: 'Table Games', single: 'Table Game', color: '#61d0e8' },
    slots: { label: 'Slots', single: 'Slots Session', color: '#a1bbd5' },
    sports: { label: 'Sports Betting', single: 'Sports Bet', color: '#a1bbd5' },
    expense: { label: 'Expenses', single: 'Expense', color: '#6b7280' },
};

export default function CategoryOverview({ userId, categoryFilter, onAddEntry, onEditEntry, displayEUR = false }) {
    const [loadedEntries, setEntries] = useState([]);
    // Deletes wait out their undo window (usePendingDeletes); the totals
    // below are summed from the rows still shown, so they move at once.
    const { hidden } = usePendingDeletes(userId);
    const entries = useMemo(() => withoutHidden(loadedEntries, hidden), [loadedEntries, hidden]);
    // Signed out there is nothing to load; it must not sit on "Loading" forever.
    const [isLoading, setIsLoading] = useState(Boolean(userId));
    const [loadFailed, setLoadFailed] = useState(false);

    const meta = CATEGORY_META[categoryFilter] || { label: categoryFilter, single: 'Entry', color: '#94a3b8' };

    const loadData = useCallback(async () => {
        if (!userId || !categoryFilter) {
            setEntries([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            // Every row in the category, not the newest 200: Total P&L, Sessions
            // and Win Rate are lifetime figures, and a capped read under-counted
            // them for anyone with more than 200 entries.
            const data = await fetchReportLedger(userId, {
                category: categoryFilter,
                includeExpenses: categoryFilter === 'expense',
            });
            setEntries(data || []);
            setLoadFailed(false);
        } catch (err) {
            // A failed read is not "No Entries Yet".
            console.warn('Error loading category data:', err);
            setLoadFailed(true);
        } finally {
            setIsLoading(false);
        }
    }, [userId, categoryFilter]);

    useEffect(() => {
        loadData();
        window.addEventListener('bankroll-updated', loadData);
        return () => window.removeEventListener('bankroll-updated', loadData);
    }, [loadData]);

    const handleEditEntry = (entry) => { onEditEntry?.(entry); };

    const handleDeleteEntry = (entryId) => {
        if (!userId) { toast.error('You Must Be Logged In'); return; }
        // Hidden now, with Undo; sent when the window closes. Once sent, the
        // queue fires 'bankroll-updated', which reloads this list and the
        // dashboard. A failure brings the row back with the error.
        scheduleLedgerDelete(userId, entries.find(e => e.id === entryId) || { id: entryId });
    };

    const openAddEntry = () => { onAddEntry?.(); };

    const totalSessions = entries.length;
    const totalCents = entries.reduce((sum, e) => sum + entryCents(e), 0);
    const avgCents = totalSessions > 0 ? Math.round(totalCents / totalSessions) : 0;
    const wins = entries.filter(e => entryCents(e) > 0).length;
    const winRate = totalSessions > 0 ? Math.round((wins / totalSessions) * 100) : 0;

    return (
        <div className="sd-panel">
            {/* Header */}
            <div style={styles.header}>
                <BankrollHeaderAdd label="Log Category Entry" onClick={openAddEntry}>
                    <button
                        type="button"
                        style={styles.addButton}
                        onClick={openAddEntry}
                    >
                        + Add Entry
                    </button>
                </BankrollHeaderAdd>
            </div>

            {/* Summary Stats */}
            <div style={styles.statsRow}>
                <div style={styles.statCard}>
                    <span style={styles.statLabel}>Total P&L</span>
                    <span style={{ ...styles.statValue, color: totalCents >= 0 ? '#22c55e' : '#ef4444' }}>
                        {!userId || loadFailed || isLoading ? '-' : formatCentsCurrency(totalCents, displayEUR, { signed: true })}
                    </span>
                </div>
                <div style={styles.statCard}>
                    <span style={styles.statLabel}>Sessions</span>
                    <span style={styles.statValue}>{!userId || loadFailed || isLoading ? '-' : totalSessions}</span>
                </div>
                <div style={styles.statCard}>
                    <span style={styles.statLabel}>Avg Result</span>
                    <span style={{ ...styles.statValue, color: avgCents >= 0 ? '#22c55e' : '#ef4444' }}>
                        {!userId || loadFailed || isLoading ? '-' : formatCentsCurrency(avgCents, displayEUR, { signed: true })}
                    </span>
                </div>
                {categoryFilter !== 'expense' && (
                    <div style={styles.statCard}>
                        <span style={styles.statLabel}>Win Rate</span>
                        <span style={styles.statValue}>{!userId || loadFailed || isLoading ? '-' : winRate + '%'}</span>
                    </div>
                )}
            </div>

            {/* Entry List */}
            <div style={styles.entriesSection}>
                <h2 style={styles.sectionTitle}>
                    All {meta.label}{!userId || loadFailed || isLoading ? '' : ` (${totalSessions})`}
                </h2>

                {isLoading ? (
                    <div style={styles.loadingMessage} role="status">Loading Entries...</div>
                ) : loadFailed ? (
                    <div style={styles.emptyState} role="alert">
                        <p style={styles.emptyText}>Could Not Load {meta.label}. Check Your Connection.</p>
                        <button type="button" style={styles.addButton} onClick={loadData}>Try Again</button>
                    </div>
                ) : !userId ? (
                    <div style={styles.emptyState} role="status">
                        <p style={styles.emptyText}>Sign In To See Your {meta.label}</p>
                        <button type="button" style={styles.addButton} onClick={openAddEntry}>Sign In</button>
                    </div>
                ) : entries.length === 0 ? (
                    <div style={styles.emptyState}>
                        <p style={styles.emptyText}>No {meta.label} Logged Yet</p>
                        <button
                            type="button"
                            style={styles.addButton}
                            onClick={openAddEntry}
                        >
                            + Log Your First {meta.single}
                        </button>
                    </div>
                ) : (
                    <LedgerTimeline
                        displayEUR={displayEUR}
                        entries={entries}
                        isLoading={isLoading}
                        onEdit={handleEditEntry}
                        onDelete={handleDeleteEntry}
                    />
                )}
            </div>

        </div>
    );
}

const styles = {
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
        flexWrap: 'wrap',
        gap: 12,
    },
    addButton: {
        background: GRADIENTS.cyanAction,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 10,
        color: '#edf6ff',
        padding: '10px 20px',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 600,
        boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
        transition: 'all 0.2s',
    },
    statsRow: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12,
        marginBottom: 24,
    },
    statCard: {
        background: 'rgba(255,255,255,0.1)',
        border: '2px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
    },
    statLabel: {
        fontSize: 14,
        fontWeight: 500,
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    },
    statValue: {
        fontSize: 22,
        fontWeight: 700,
        color: 'white',
    },
    entriesSection: {
        marginTop: 8,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.8)',
        marginBottom: 16,
    },
    loadingMessage: {
        textAlign: 'center',
        padding: 40,
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
    },
    emptyState: {
        textAlign: 'center',
        padding: '60px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
    },
    emptyText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 15,
        margin: 0,
    },
};
