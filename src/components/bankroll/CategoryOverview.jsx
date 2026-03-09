/**
 * CATEGORY OVERVIEW
 * Filtered view of ledger entries by category (Cash Games, Tournaments, etc.)
 * with Add, Edit, and Delete functionality
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchLedgerEntries, deleteLedgerEntry } from '../../lib/bankroll/bankrollSelectors';
import LedgerTimeline from './LedgerTimeline';
import LogEntryModal from './LogEntryModal';
import { supabase } from '../../lib/supabase';
import toast from '../../stores/toastStore';

const CATEGORY_META = {
    poker_cash: { label: 'Cash Games', icon: '🃏', color: '#22c55e' },
    poker_mtt: { label: 'Tournaments', icon: '🏆', color: '#a855f7' },
    casino_table: { label: 'Table Games', icon: '🎲', color: '#eab308' },
    slots: { label: 'Slots', icon: '🎲', color: '#f97316' },
    sports: { label: 'Sports Betting', icon: '⚽', color: '#f97316' },
    expense: { label: 'Expenses', icon: '💸', color: '#6b7280' },
};

export default function CategoryOverview({ userId, categoryFilter, onBack }) {
    const [entries, setEntries] = useState([]);
    const [locations, setLocations] = useState([]);
    const [trips, setTrips] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showLogModal, setShowLogModal] = useState(false);
    const [editEntry, setEditEntry] = useState(null);

    const meta = CATEGORY_META[categoryFilter] || { label: categoryFilter, icon: '📊', color: '#94a3b8' };

    const loadData = useCallback(async () => {
        if (!userId || !categoryFilter) return;
        setIsLoading(true);
        try {
            const data = await fetchLedgerEntries(userId, {
                category: categoryFilter,
                includeExpenses: categoryFilter === 'expense',
                limit: 200,
            });
            setEntries(data || []);

            // Load locations & trips for modal
            const [{ data: locs }, { data: trps }] = await Promise.all([
                supabase.from('bankroll_locations').select('*').eq('user_id', userId),
                supabase.from('bankroll_trips').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
            ]);
            setLocations(locs || []);
            setTrips(trps || []);
        } catch (err) {
            console.error('Error loading category data:', err);
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
            toast.success('Entry deleted');
            await loadData();
        } catch (err) {
            console.error('Delete failed:', err);
            toast.error('Failed to delete entry');
            await loadData();
        }
    };

    const handleLogSubmit = async () => {
        setShowLogModal(false);
        setEditEntry(null);
        await loadData();
    };

    // Summary stats
    const totalSessions = entries.length;
    const totalPL = entries.reduce((sum, e) => {
        if (e.category === 'expense') return sum - Math.abs(e.gross_in || 0);
        return sum + ((e.gross_out || 0) - (e.gross_in || 0));
    }, 0);
    const avgResult = totalSessions > 0 ? totalPL / totalSessions : 0;
    const wins = entries.filter(e => (e.gross_out || 0) - (e.gross_in || 0) > 0).length;
    const winRate = totalSessions > 0 ? Math.round((wins / totalSessions) * 100) : 0;

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerLeft}>
                    <button style={styles.backButton} onClick={onBack}>
                        ← All
                    </button>
                    <h1 style={{ ...styles.title, color: meta.color }}>
                        {meta.icon} {meta.label}
                    </h1>
                </div>
                <button
                    style={styles.addButton}
                    onClick={() => {
                        setEditEntry(null);
                        setShowLogModal(true);
                    }}
                >
                    + Add Entry
                </button>
            </div>

            {/* Summary Stats */}
            <div style={styles.statsRow}>
                <div style={styles.statCard}>
                    <span style={styles.statLabel}>Total P&L</span>
                    <span style={{ ...styles.statValue, color: totalPL >= 0 ? '#22c55e' : '#ef4444' }}>
                        {totalPL >= 0 ? '+' : '-'}${Math.abs(totalPL).toLocaleString()}
                    </span>
                </div>
                <div style={styles.statCard}>
                    <span style={styles.statLabel}>Sessions</span>
                    <span style={styles.statValue}>{totalSessions}</span>
                </div>
                <div style={styles.statCard}>
                    <span style={styles.statLabel}>Avg Result</span>
                    <span style={{ ...styles.statValue, color: avgResult >= 0 ? '#22c55e' : '#ef4444' }}>
                        {avgResult >= 0 ? '+' : '-'}${Math.abs(Math.round(avgResult)).toLocaleString()}
                    </span>
                </div>
                {categoryFilter !== 'expense' && (
                    <div style={styles.statCard}>
                        <span style={styles.statLabel}>Win Rate</span>
                        <span style={styles.statValue}>{winRate}%</span>
                    </div>
                )}
            </div>

            {/* Entry List */}
            <div style={styles.entriesSection}>
                <h2 style={styles.sectionTitle}>
                    All {meta.label} ({totalSessions})
                </h2>

                {isLoading ? (
                    <div style={styles.loadingMessage}>Loading Entries...</div>
                ) : entries.length === 0 ? (
                    <div style={styles.emptyState}>
                        <span style={{ fontSize: 40 }}>{meta.icon}</span>
                        <p style={styles.emptyText}>No {meta.label.toLowerCase()} entries yet</p>
                        <button
                            style={styles.addButton}
                            onClick={() => {
                                setEditEntry(null);
                                setShowLogModal(true);
                            }}
                        >
                            + Log Your First {meta.label.replace(/s$/, '')}
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
    container: {
        padding: 0,
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
        flexWrap: 'wrap',
        gap: 12,
    },
    headerLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },
    backButton: {
        background: 'rgba(255,255,255,0.08)',
        border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 8,
        color: 'rgba(255,255,255,0.7)',
        padding: '8px 14px',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 500,
        transition: 'all 0.2s',
    },
    title: {
        fontSize: 24,
        fontWeight: 700,
        margin: 0,
    },
    addButton: {
        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
        border: 'none',
        borderRadius: 10,
        color: 'white',
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
