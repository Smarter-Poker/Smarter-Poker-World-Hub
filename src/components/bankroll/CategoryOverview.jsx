import BankrollHeaderAdd from './BankrollHeaderAdd';
/**
 * CATEGORY OVERVIEW
 * Filtered view of ledger entries by category (Cash Games, Tournaments, etc.)
 * with Add, Edit, and Delete functionality
 */

import { GRADIENTS, METAL } from './metalStyles';
import { useState, useEffect, useCallback } from 'react';
import { fetchReportLedger, deleteLedgerEntry } from '../../lib/bankroll/bankrollSelectors';
import { entryCents, formatSignedCents } from '../../lib/bankroll/ledgerMath.mjs';
import LedgerTimeline from './LedgerTimeline';
import LogEntryModal from './LogEntryModal';
import { supabase } from '../../lib/supabase';
import toast from '../../stores/toastStore';

const CATEGORY_META = {
    poker_cash: { label: 'Cash Games', single: 'Cash Game', color: '#22c55e' },
    poker_mtt: { label: 'Tournaments', single: 'Tournament', color: '#a9c6e6' },
    casino_table: { label: 'Table Games', single: 'Table Game', color: '#61d0e8' },
    slots: { label: 'Slots', single: 'Slots Session', color: '#a1bbd5' },
    sports: { label: 'Sports Betting', single: 'Sports Bet', color: '#a1bbd5' },
    expense: { label: 'Expenses', single: 'Expense', color: '#6b7280' },
};

export default function CategoryOverview({ userId, categoryFilter }) {
    const [entries, setEntries] = useState([]);
    const [locations, setLocations] = useState([]);
    const [trips, setTrips] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [showLogModal, setShowLogModal] = useState(false);
    const [editEntry, setEditEntry] = useState(null);

    const meta = CATEGORY_META[categoryFilter] || { label: categoryFilter, single: 'Entry', color: '#94a3b8' };

    const loadData = useCallback(async () => {
        if (!userId || !categoryFilter) return;
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

            // Locations and trips only feed the modal's pickers.
            const [{ data: locs }, { data: trps }] = await Promise.all([
                supabase.from('bankroll_locations').select('*').eq('user_id', userId),
                supabase.from('bankroll_trips').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
            ]);
            setLocations(locs || []);
            setTrips(trps || []);
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
    }, [loadData]);

    const handleEditEntry = (entry) => {
        setEditEntry(entry);
        setShowLogModal(true);
    };

    const handleDeleteEntry = async (entryId) => {
        setEntries(prev => prev.filter(e => e.id !== entryId));
        try {
            await deleteLedgerEntry(userId, entryId);
            toast.success('Entry Deleted');
            // The dashboard tiles and chart listen for this.
            window.dispatchEvent(new CustomEvent('bankroll-updated'));
            await loadData();
        } catch (err) {
            console.warn('Delete failed:', err);
            toast.error('Failed To Delete Entry');
            await loadData();
        }
    };

    const handleLogSubmit = async () => {
        setShowLogModal(false);
        setEditEntry(null);
        await loadData();
    };

    // Summary stats
    const openAddEntry = () => {
        setEditEntry(null);
        setShowLogModal(true);
    };

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
                        {loadFailed || isLoading ? '-' : formatSignedCents(totalCents)}
                    </span>
                </div>
                <div style={styles.statCard}>
                    <span style={styles.statLabel}>Sessions</span>
                    <span style={styles.statValue}>{loadFailed || isLoading ? '-' : totalSessions}</span>
                </div>
                <div style={styles.statCard}>
                    <span style={styles.statLabel}>Avg Result</span>
                    <span style={{ ...styles.statValue, color: avgCents >= 0 ? '#22c55e' : '#ef4444' }}>
                        {loadFailed || isLoading ? '-' : formatSignedCents(avgCents)}
                    </span>
                </div>
                {categoryFilter !== 'expense' && (
                    <div style={styles.statCard}>
                        <span style={styles.statLabel}>Win Rate</span>
                        <span style={styles.statValue}>{loadFailed || isLoading ? '-' : winRate + '%'}</span>
                    </div>
                )}
            </div>

            {/* Entry List */}
            <div style={styles.entriesSection}>
                <h2 style={styles.sectionTitle}>
                    All {meta.label}{loadFailed || isLoading ? '' : ` (${totalSessions})`}
                </h2>

                {isLoading ? (
                    <div style={styles.loadingMessage} role="status">Loading Entries...</div>
                ) : loadFailed ? (
                    <div style={styles.emptyState} role="alert">
                        <p style={styles.emptyText}>Could Not Load {meta.label}. Check Your Connection.</p>
                        <button type="button" style={styles.addButton} onClick={loadData}>Try Again</button>
                    </div>
                ) : entries.length === 0 ? (
                    <div style={styles.emptyState}>
                        <p style={styles.emptyText}>No {meta.label} Logged Yet</p>
                        <button
                            type="button"
                            style={styles.addButton}
                            onClick={() => {
                                setEditEntry(null);
                                setShowLogModal(true);
                            }}
                        >
                            + Log Your First {meta.single}
                        </button>
                    </div>
                ) : (
                    <LedgerTimeline
                        entries={entries}
                        isLoading={isLoading}
                        onEdit={handleEditEntry}
                        onDelete={handleDeleteEntry}
                    />
                )}
            </div>

            {/* Log Modal pre-set to this category */}
            {showLogModal && (
                <LogEntryModal
                    userId={userId}
                    locations={locations}
                    trips={trips}
                    editEntry={editEntry}
                    defaultCategory={categoryFilter}
                    onClose={() => { setShowLogModal(false); setEditEntry(null); }}
                    onSubmit={handleLogSubmit}
                />
            )}
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
