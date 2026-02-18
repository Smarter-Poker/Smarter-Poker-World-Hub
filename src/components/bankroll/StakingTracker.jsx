/**
 * STAKING TRACKER
 * Facebook Dark UI — Manage backer arrangements and staking sessions
 * Matches TripTracker/SeriesTracker styling
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    fetchStakingArrangements,
    createStakingArrangement,
    updateStakingArrangement,
    deleteStakingArrangement,
    deactivateAllArrangements,
    fetchStakingSessions,
    createStakingSession,
    getStakingStats,
    fetchLedgerEntries,
} from '../../lib/bankroll/bankrollSelectors';
import { formatCurrency } from '../../lib/bankroll/currencyUtils';
import toast from '../../stores/toastStore';

export default function StakingTracker({ userId, refreshTrigger }) {
    const [arrangements, setArrangements] = useState([]);
    const [activeArrangement, setActiveArrangement] = useState(null);
    const [sessions, setSessions] = useState([]);
    const [stats, setStats] = useState({ totalProfitLoss: 0, playerShare: 0, backerShare: 0, sessionCount: 0 });
    const [unlinkedEntries, setUnlinkedEntries] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingArrangement, setEditingArrangement] = useState(null);
    const [saving, setSaving] = useState(false);

    // Confirm states
    const [confirmEnd, setConfirmEnd] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);

    // Link session state
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [linkingEntry, setLinkingEntry] = useState(null);

    // Form
    const [form, setForm] = useState({
        backer_name: '',
        backer_email: '',
        backer_phone: '',
        split_percentage: 50,
        markup_percentage: 0,
        starting_makeup: 0,
        start_date: new Date().toISOString().split('T')[0],
        notes: '',
    });

    const loadData = useCallback(async () => {
        if (!userId) return;
        setIsLoading(true);
        try {
            const arr = await fetchStakingArrangements(userId);
            setArrangements(arr);

            const active = arr.find(a => a.status === 'active') || null;
            setActiveArrangement(active);

            if (active) {
                const [sessData, statsData] = await Promise.all([
                    fetchStakingSessions(active.id),
                    getStakingStats(active.id),
                ]);
                setSessions(sessData);
                setStats(statsData);

                // Find ledger entries not yet linked to a staking session
                try {
                    const allEntries = await fetchLedgerEntries(userId, { limit: 50 });
                    const linkedIds = new Set(sessData.map(s => s.ledger_entry_id));
                    const unlinked = allEntries.filter(e =>
                        !linkedIds.has(e.id) &&
                        e.category !== 'expense' &&
                        new Date(e.entry_date) >= new Date(active.start_date)
                    );
                    setUnlinkedEntries(unlinked);
                } catch { setUnlinkedEntries([]); }
            } else {
                setSessions([]);
                setStats({ totalProfitLoss: 0, playerShare: 0, backerShare: 0, sessionCount: 0 });
                setUnlinkedEntries([]);
            }
        } catch (err) {
            console.error('Error loading staking data:', err);
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

    useEffect(() => { loadData(); }, [loadData, refreshTrigger]);

    // --- HANDLERS ---

    const handleAddNew = () => {
        setEditingArrangement(null);
        setForm({
            backer_name: '',
            backer_email: '',
            backer_phone: '',
            split_percentage: 50,
            markup_percentage: 0,
            starting_makeup: 0,
            start_date: new Date().toISOString().split('T')[0],
            notes: '',
        });
        setShowModal(true);
    };

    const handleEdit = (arr) => {
        setEditingArrangement(arr);
        setForm({
            backer_name: arr.backer_name || '',
            backer_email: arr.backer_email || '',
            backer_phone: arr.backer_phone || '',
            split_percentage: arr.split_percentage || 50,
            markup_percentage: arr.markup_percentage || 0,
            starting_makeup: arr.starting_makeup || 0,
            start_date: arr.start_date || new Date().toISOString().split('T')[0],
            notes: arr.notes || '',
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.backer_name.trim()) return;
        setSaving(true);
        try {
            if (editingArrangement) {
                await updateStakingArrangement(editingArrangement.id, {
                    backer_name: form.backer_name,
                    backer_email: form.backer_email || null,
                    backer_phone: form.backer_phone || null,
                    split_percentage: parseInt(form.split_percentage),
                    markup_percentage: parseInt(form.markup_percentage) || 0,
                    starting_makeup: parseFloat(form.starting_makeup) || 0,
                    start_date: form.start_date,
                    notes: form.notes || null,
                });
                toast.success('Arrangement updated');
            } else {
                // Deactivate any existing active arrangement
                await deactivateAllArrangements(userId);
                await createStakingArrangement(userId, {
                    backer_name: form.backer_name,
                    backer_email: form.backer_email || null,
                    backer_phone: form.backer_phone || null,
                    split_percentage: parseInt(form.split_percentage),
                    markup_percentage: parseInt(form.markup_percentage) || 0,
                    starting_makeup: parseFloat(form.starting_makeup) || 0,
                    start_date: form.start_date,
                    notes: form.notes || null,
                });
                toast.success('Arrangement created');
            }
            setShowModal(false);
            loadData();
        } catch (err) {
            console.error('Error saving arrangement:', err);
            toast.error('Failed to save arrangement');
        } finally {
            setSaving(false);
        }
    };

    const handleEndArrangement = async () => {
        if (!activeArrangement) return;
        try {
            await updateStakingArrangement(activeArrangement.id, {
                status: 'completed',
                end_date: new Date().toISOString().split('T')[0],
            });
            toast.success('Arrangement completed');
            setConfirmEnd(false);
            loadData();
        } catch (err) {
            console.error('Error ending arrangement:', err);
            toast.error('Failed to end arrangement');
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteStakingArrangement(id);
            toast.success('Arrangement deleted');
            setConfirmDelete(null);
            loadData();
        } catch (err) {
            console.error('Error deleting arrangement:', err);
            toast.error('Failed to delete');
        }
    };

    const handleLinkEntry = async (entry) => {
        if (!activeArrangement) return;
        try {
            const net = (entry.gross_out || 0) - (entry.gross_in || 0);
            await createStakingSession({
                arrangement_id: activeArrangement.id,
                ledger_entry_id: entry.id,
                profit_loss: net,
                split_percentage: activeArrangement.split_percentage,
                markup_percentage: activeArrangement.markup_percentage || 0,
                current_makeup: activeArrangement.current_makeup || 0,
            });
            toast.success('Session linked to staking arrangement');
            setShowLinkModal(false);
            setLinkingEntry(null);
            loadData();
        } catch (err) {
            console.error('Error linking entry:', err);
            toast.error('Failed to link session');
        }
    };

    // --- RENDER ---

    if (isLoading) {
        return (
            <div style={styles.container}>
                <div style={styles.loadingState}>Loading Staking Data...</div>
            </div>
        );
    }

    const CATEGORY_LABELS = {
        poker_cash: 'Cash',
        poker_mtt: 'MTT',
        casino_table: 'Casino',
        slots: 'Slots',
        sports: 'Sports',
    };

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <h3 style={styles.headerTitle}>Staking Tracker</h3>
                {!activeArrangement && (
                    <button onClick={handleAddNew} style={styles.addBtn}>+ Add Backer</button>
                )}
            </div>

            {/* Active Arrangement */}
            {activeArrangement ? (
                <div style={styles.activeCard}>
                    <div style={styles.activeHeader}>
                        <div>
                            <div style={styles.liveBadge}>● ACTIVE DEAL</div>
                            <h3 style={styles.backerName}>{activeArrangement.backer_name}</h3>
                            <div style={styles.activeMeta}>
                                Started {new Date(activeArrangement.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                {activeArrangement.backer_email && ` · ${activeArrangement.backer_email}`}
                            </div>
                        </div>
                    </div>

                    {/* Split Display */}
                    <div style={styles.splitRow}>
                        <div style={styles.splitBox}>
                            <div style={styles.splitValue}>{activeArrangement.split_percentage}%</div>
                            <div style={styles.splitLabel}>YOUR SPLIT</div>
                        </div>
                        <div style={{ ...styles.splitBox, borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={styles.splitValue}>{100 - activeArrangement.split_percentage}%</div>
                            <div style={styles.splitLabel}>BACKER SPLIT</div>
                        </div>
                        {activeArrangement.markup_percentage > 0 && (
                            <div style={{ ...styles.splitBox, borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={styles.splitValue}>{activeArrangement.markup_percentage}%</div>
                                <div style={styles.splitLabel}>MARKUP</div>
                            </div>
                        )}
                    </div>

                    {/* Stats Grid */}
                    <div style={styles.statsGrid}>
                        <div style={styles.statBox}>
                            <div style={{ ...styles.statLabel }}>NET P/L</div>
                            <div style={{
                                ...styles.statValue,
                                color: stats.totalProfitLoss >= 0 ? '#22c55e' : '#ef4444'
                            }}>
                                {formatCurrency(stats.totalProfitLoss)}
                            </div>
                        </div>
                        <div style={styles.statBox}>
                            <div style={styles.statLabel}>YOUR SHARE</div>
                            <div style={{ ...styles.statValue, color: '#22c55e' }}>
                                {formatCurrency(stats.playerShare)}
                            </div>
                        </div>
                        <div style={styles.statBox}>
                            <div style={styles.statLabel}>BACKER SHARE</div>
                            <div style={{ ...styles.statValue, color: '#3b82f6' }}>
                                {formatCurrency(stats.backerShare)}
                            </div>
                        </div>
                        <div style={styles.statBox}>
                            <div style={styles.statLabel}>MAKEUP</div>
                            <div style={{
                                ...styles.statValue,
                                color: (activeArrangement.current_makeup || 0) > 0 ? '#ef4444' : '#22c55e'
                            }}>
                                {(activeArrangement.current_makeup || 0) > 0
                                    ? `-${formatCurrency(activeArrangement.current_makeup)}`
                                    : 'Clear'
                                }
                            </div>
                        </div>
                    </div>

                    {/* Linked Sessions */}
                    {sessions.length > 0 && (
                        <div style={styles.sessionsSection}>
                            <div style={styles.sectionTitle}>Linked Sessions ({sessions.length})</div>
                            <div style={styles.sessionsScroll}>
                                {sessions.map(s => (
                                    <div key={s.id} style={styles.sessionRow}>
                                        <div style={styles.sessionInfo}>
                                            <span style={styles.sessionDate}>
                                                {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </span>
                                            <span style={{
                                                ...styles.sessionNet,
                                                color: s.profit_loss >= 0 ? '#22c55e' : '#ef4444'
                                            }}>
                                                {formatCurrency(s.profit_loss)}
                                            </span>
                                        </div>
                                        <div style={styles.sessionSplits}>
                                            <span style={{ color: '#22c55e', fontSize: 11 }}>You: {formatCurrency(s.player_share)}</span>
                                            <span style={{ color: '#3b82f6', fontSize: 11 }}>Backer: {formatCurrency(s.backer_share)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Unlinked Entries */}
                    {unlinkedEntries.length > 0 && (
                        <div style={styles.sessionsSection}>
                            <div style={styles.sectionTitle}>Unlinked Sessions ({unlinkedEntries.length})</div>
                            <div style={styles.sessionsScroll}>
                                {unlinkedEntries.map(entry => {
                                    const net = (entry.gross_out || 0) - (entry.gross_in || 0);
                                    return (
                                        <div key={entry.id} style={styles.sessionRow}>
                                            <div style={styles.sessionInfo}>
                                                <span style={styles.sessionDate}>
                                                    {new Date(entry.entry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                </span>
                                                <span style={styles.sessionCat}>
                                                    {CATEGORY_LABELS[entry.category] || entry.category}
                                                </span>
                                                <span style={{
                                                    ...styles.sessionNet,
                                                    color: net >= 0 ? '#22c55e' : '#ef4444'
                                                }}>
                                                    {formatCurrency(net)}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => handleLinkEntry(entry)}
                                                style={styles.linkBtn}
                                            >
                                                Link
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div style={styles.actionsRow}>
                        {!confirmEnd ? (
                            <>
                                <button onClick={() => handleEdit(activeArrangement)} style={styles.editBtn}>
                                    ✏ Edit Deal
                                </button>
                                <button onClick={handleAddNew} style={styles.addEntryBtn}>
                                    + New Deal
                                </button>
                                <button onClick={() => setConfirmEnd(true)} style={styles.completeBtn}>
                                    ✓ End Deal
                                </button>
                            </>
                        ) : (
                            <AnimatePresence>
                                <motion.div
                                    initial={{ opacity: 0, y: -5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    style={styles.confirmRow}
                                >
                                    <span style={{ color: '#94a3b8', fontSize: 13 }}>End This Arrangement?</span>
                                    <button onClick={handleEndArrangement} style={styles.confirmYes}>Yes, End</button>
                                    <button onClick={() => setConfirmEnd(false)} style={styles.confirmNo}>Cancel</button>
                                </motion.div>
                            </AnimatePresence>
                        )}
                    </div>
                </div>
            ) : (
                <div style={styles.emptyState}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🤝</div>
                    <p style={styles.emptyTitle}>No Active Staking Deal</p>
                    <p style={styles.emptyHint}>Track Backer Relationships, Profit Splits & Makeup</p>
                    <button onClick={handleAddNew} style={styles.addBtn}>+ Add Backer</button>
                </div>
            )}

            {/* Past Arrangements */}
            {arrangements.filter(a => a.status !== 'active').length > 0 && (
                <div style={styles.historySection}>
                    <h3 style={styles.historyTitle}>Past Arrangements</h3>
                    {arrangements.filter(a => a.status !== 'active').map(arr => (
                        <div key={arr.id} style={styles.pastCard}>
                            <div>
                                <div style={styles.pastName}>{arr.backer_name}</div>
                                <div style={styles.pastMeta}>
                                    {arr.split_percentage}% / {100 - arr.split_percentage}%
                                    {arr.end_date && ` · Ended ${new Date(arr.end_date).toLocaleDateString()}`}
                                </div>
                            </div>
                            <div style={styles.pastActions}>
                                {confirmDelete === arr.id ? (
                                    <>
                                        <button onClick={() => handleDelete(arr.id)} style={styles.confirmYesSmall}>Delete</button>
                                        <button onClick={() => setConfirmDelete(null)} style={styles.confirmNoSmall}>Cancel</button>
                                    </>
                                ) : (
                                    <button onClick={() => setConfirmDelete(arr.id)} style={styles.deleteBtn}>✕</button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Modal */}
            <AnimatePresence>
                {showModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={styles.modalOverlay}
                        onClick={() => setShowModal(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            style={styles.modal}
                            onClick={e => e.stopPropagation()}
                        >
                            <h3 style={styles.modalTitle}>
                                {editingArrangement ? 'Edit Arrangement' : 'New Staking Arrangement'}
                            </h3>

                            <label style={styles.formLabel}>Backer Name *</label>
                            <input
                                value={form.backer_name}
                                onChange={e => setForm({ ...form, backer_name: e.target.value })}
                                placeholder="Enter Backer Name..."
                                style={styles.formInput}
                                autoFocus
                            />

                            <div style={styles.formRow}>
                                <div>
                                    <label style={styles.formLabel}>Email</label>
                                    <input
                                        value={form.backer_email}
                                        onChange={e => setForm({ ...form, backer_email: e.target.value })}
                                        placeholder="backer@email.com"
                                        style={styles.formInput}
                                    />
                                </div>
                                <div>
                                    <label style={styles.formLabel}>Phone</label>
                                    <input
                                        value={form.backer_phone}
                                        onChange={e => setForm({ ...form, backer_phone: e.target.value })}
                                        placeholder="555-1234"
                                        style={styles.formInput}
                                    />
                                </div>
                            </div>

                            <div style={styles.formRow}>
                                <div>
                                    <label style={styles.formLabel}>Your Split %</label>
                                    <input
                                        type="number"
                                        min="0" max="100"
                                        value={form.split_percentage}
                                        onChange={e => setForm({ ...form, split_percentage: e.target.value })}
                                        style={styles.formInput}
                                    />
                                </div>
                                <div>
                                    <label style={styles.formLabel}>Backer Split %</label>
                                    <input
                                        type="number"
                                        value={100 - parseInt(form.split_percentage || 0)}
                                        disabled
                                        style={{ ...styles.formInput, opacity: 0.5 }}
                                    />
                                </div>
                            </div>

                            <div style={styles.formRow}>
                                <div>
                                    <label style={styles.formLabel}>Markup %</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={form.markup_percentage}
                                        onChange={e => setForm({ ...form, markup_percentage: e.target.value })}
                                        placeholder="0"
                                        style={styles.formInput}
                                    />
                                </div>
                                <div>
                                    <label style={styles.formLabel}>Starting Makeup</label>
                                    <input
                                        type="number"
                                        value={form.starting_makeup}
                                        onChange={e => setForm({ ...form, starting_makeup: e.target.value })}
                                        placeholder="0"
                                        style={styles.formInput}
                                    />
                                </div>
                            </div>

                            <div style={styles.formRow}>
                                <div>
                                    <label style={styles.formLabel}>Start Date</label>
                                    <input
                                        type="date"
                                        value={form.start_date}
                                        onChange={e => setForm({ ...form, start_date: e.target.value })}
                                        style={styles.formInput}
                                    />
                                </div>
                                <div>
                                    <label style={styles.formLabel}>Notes</label>
                                    <input
                                        value={form.notes}
                                        onChange={e => setForm({ ...form, notes: e.target.value })}
                                        placeholder="Optional notes..."
                                        style={styles.formInput}
                                    />
                                </div>
                            </div>

                            <div style={styles.modalActions}>
                                <button onClick={() => setShowModal(false)} style={styles.cancelBtn}>
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving || !form.backer_name.trim()}
                                    style={{
                                        ...styles.saveBtn,
                                        opacity: (saving || !form.backer_name.trim()) ? 0.5 : 1,
                                    }}
                                >
                                    {saving ? 'Saving...' : (editingArrangement ? 'Update' : 'Create Deal')}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ── Facebook Dark Inline Styles (matching TripTracker/SeriesTracker) ──

const styles = {
    container: {
        background: 'rgba(36,37,38,0.6)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
        overflow: 'hidden',
    },
    loadingState: {
        padding: 48,
        textAlign: 'center',
        color: '#94a3b8',
        fontSize: 14,
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: 700,
        color: '#e4e6eb',
        margin: 0,
    },
    addBtn: {
        background: '#3b82f6',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        padding: '8px 16px',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
    },

    // Active arrangement
    activeCard: {
        padding: '16px 18px',
    },
    activeHeader: {
        marginBottom: 14,
    },
    liveBadge: {
        display: 'inline-block',
        fontSize: 10,
        fontWeight: 700,
        color: '#22c55e',
        letterSpacing: 1.2,
        marginBottom: 4,
    },
    backerName: {
        fontSize: 22,
        fontWeight: 800,
        color: '#fff',
        margin: '0 0 4px',
    },
    activeMeta: {
        fontSize: 12,
        color: '#94a3b8',
    },
    splitRow: {
        display: 'flex',
        background: 'rgba(0,0,0,0.25)',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.06)',
        marginBottom: 14,
        overflow: 'hidden',
    },
    splitBox: {
        flex: 1,
        padding: '12px 8px',
        textAlign: 'center',
    },
    splitValue: {
        fontSize: 20,
        fontWeight: 800,
        color: '#e4e6eb',
    },
    splitLabel: {
        fontSize: 9,
        fontWeight: 600,
        color: '#64748b',
        letterSpacing: 0.8,
        marginTop: 2,
    },

    // Stats
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 8,
        marginBottom: 14,
    },
    statBox: {
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 8,
        padding: '10px 12px',
        textAlign: 'center',
    },
    statLabel: {
        fontSize: 10,
        fontWeight: 600,
        color: '#64748b',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    statValue: {
        fontSize: 16,
        fontWeight: 700,
    },

    // Sessions
    sessionsSection: {
        marginBottom: 14,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: 600,
        color: '#94a3b8',
        marginBottom: 8,
    },
    sessionsScroll: {
        maxHeight: 200,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    sessionRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(0,0,0,0.25)',
        borderRadius: 6,
        padding: '8px 10px',
        border: '1px solid rgba(255,255,255,0.05)',
    },
    sessionInfo: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    sessionDate: {
        fontSize: 12,
        color: '#64748b',
        fontWeight: 500,
    },
    sessionCat: {
        fontSize: 12,
        color: '#cbd5e1',
    },
    sessionNet: {
        fontSize: 13,
        fontWeight: 700,
    },
    sessionSplits: {
        display: 'flex',
        gap: 12,
    },
    linkBtn: {
        background: 'rgba(59,130,246,0.15)',
        color: '#3b82f6',
        border: '1px solid rgba(59,130,246,0.3)',
        borderRadius: 4,
        padding: '3px 10px',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
    },

    // Actions
    actionsRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
    },
    editBtn: {
        background: 'rgba(59, 130, 246, 0.15)',
        color: '#3b82f6',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        borderRadius: 8,
        padding: '10px 18px',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    addEntryBtn: {
        background: 'rgba(16, 185, 129, 0.15)',
        color: '#10b981',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        borderRadius: 8,
        padding: '10px 18px',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    completeBtn: {
        background: 'rgba(16, 185, 129, 0.15)',
        color: '#10b981',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        borderRadius: 8,
        padding: '10px 18px',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    confirmRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
    },
    confirmYes: {
        background: '#22c55e',
        color: '#fff',
        border: 'none',
        borderRadius: 6,
        padding: '8px 16px',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
    },
    confirmNo: {
        background: 'transparent',
        color: '#94a3b8',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 6,
        padding: '8px 16px',
        fontSize: 13,
        cursor: 'pointer',
    },

    // Empty state
    emptyState: {
        padding: '40px 20px',
        textAlign: 'center',
    },
    emptyTitle: {
        fontSize: 15,
        fontWeight: 600,
        color: '#94a3b8',
        margin: '0 0 4px',
    },
    emptyHint: {
        fontSize: 12,
        color: '#64748b',
        margin: '0 0 16px',
    },

    // History
    historySection: {
        padding: '14px 18px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
    },
    historyTitle: {
        fontSize: 15,
        fontWeight: 700,
        color: '#94a3b8',
        margin: '0 0 12px',
    },
    pastCard: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 6,
    },
    pastName: {
        fontSize: 14,
        fontWeight: 600,
        color: '#e4e6eb',
    },
    pastMeta: {
        fontSize: 11,
        color: '#64748b',
        marginTop: 2,
    },
    pastActions: {
        display: 'flex',
        gap: 6,
    },
    deleteBtn: {
        background: 'rgba(239,68,68,0.15)',
        color: '#ef4444',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 4,
        padding: '4px 8px',
        fontSize: 12,
        cursor: 'pointer',
    },
    confirmYesSmall: {
        background: '#ef4444',
        color: '#fff',
        border: 'none',
        borderRadius: 4,
        padding: '4px 10px',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
    },
    confirmNoSmall: {
        background: 'transparent',
        color: '#94a3b8',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 4,
        padding: '4px 10px',
        fontSize: 11,
        cursor: 'pointer',
    },

    // Modal
    modalOverlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
    },
    modal: {
        width: '100%',
        maxWidth: 440,
        background: '#242526',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 16,
        padding: 24,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 700,
        color: '#e4e6eb',
        marginBottom: 18,
        textAlign: 'center',
    },
    formLabel: {
        display: 'block',
        fontSize: 11,
        fontWeight: 600,
        color: '#94a3b8',
        marginBottom: 4,
        marginTop: 12,
    },
    formInput: {
        width: '100%',
        padding: '10px 12px',
        background: '#18191a',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        fontSize: 14,
        color: '#e4e6eb',
        boxSizing: 'border-box',
    },
    formRow: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
    },
    modalActions: {
        display: 'flex',
        gap: 12,
        marginTop: 20,
    },
    cancelBtn: {
        flex: 1,
        padding: 12,
        background: 'transparent',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 10,
        fontSize: 14,
        color: '#94a3b8',
        cursor: 'pointer',
    },
    saveBtn: {
        flex: 1,
        padding: 12,
        background: '#3b82f6',
        border: 'none',
        borderRadius: 10,
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
        cursor: 'pointer',
    },
};
