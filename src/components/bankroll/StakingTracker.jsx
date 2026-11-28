import BankrollHeaderAdd from './BankrollHeaderAdd';
/**
 * STAKING TRACKER
 * SmarterPoker Dark UI — Manage backer arrangements and staking sessions
 * Matches TripTracker/SeriesTracker styling
 */

import { GRADIENTS, METAL } from './metalStyles';
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    fetchStakingArrangements,
    createStakingArrangement,
    updateStakingArrangement,
    deleteStakingArrangement,
    deactivateAllArrangements,
    loadStakingDeal,
    linkStakingSession,
    unlinkStakingSession,
} from '../../lib/bankroll/bankrollSelectors';
import { buildStakingStatementCsv, normaliseStakingTerms, replayStakingDeal } from '../../lib/bankroll/stakingMath.mjs';
import toast from '../../stores/toastStore';
import { localDay, parseLedgerDay } from '../../lib/bankroll/localDates.mjs';
import { formatCurrency, formatSplit } from '../../lib/bankroll/currencyUtils';

const CATEGORY_LABELS = {
    poker_cash: 'Cash',
    poker_mtt: 'MTT',
    casino_table: 'Casino',
    slots: 'Slots',
    sports: 'Sports',
};

// Staking settles to the cent: whole-dollar rounding showed two $425 shares of
// an $851 session. Whole amounts stay short, anything else shows cents
// (currencyUtils' 'auto' cents variant, which also follows Display EUR).
const formatStake = (amount, displayEUR) => formatCurrency(Number(amount) || 0, displayEUR, { cents: 'auto' });
// Gross, your share, backer share: in euros the two shares still add up to the
// gross on screen (see formatSplit).
const formatShares = (gross, player, backer, displayEUR) => formatSplit(Number(gross) || 0, Number(player) || 0, Number(backer) || 0, displayEUR, { cents: 'auto' });

const shortDay = (day, withYear = false) => day
    ? parseLedgerDay(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) })
    : '';

export default function StakingTracker({ userId, refreshTrigger, displayEUR = false }) {
    const [arrangements, setArrangements] = useState([]);
    const [activeArrangement, setActiveArrangement] = useState(null);
    const [sessions, setSessions] = useState([]);
    const [stats, setStats] = useState({ totalGrossResult: 0, playerShare: 0, backerShare: 0, sessionCount: 0 });
    const [unlinkedEntries, setUnlinkedEntries] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [currentMakeup, setCurrentMakeup] = useState(0);
    const [formError, setFormError] = useState('');
    const [busyId, setBusyId] = useState(null);
    const [confirmUnlink, setConfirmUnlink] = useState(null);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingArrangement, setEditingArrangement] = useState(null);
    const [saving, setSaving] = useState(false);

    // Confirm states
    const [confirmEnd, setConfirmEnd] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);

    // Form
    const [form, setForm] = useState({
        backer_name: '',
        backer_email: '',
        backer_phone: '',
        split_percentage: 50,
        markup_percentage: 0,
        starting_makeup: 0,
        start_date: localDay(),
        notes: '',
    });

    const loadData = useCallback(async () => {
        if (!userId) { setIsLoading(false); return; }
        setIsLoading(true);
        setLoadError('');
        try {
            const arr = await fetchStakingArrangements(userId);
            setArrangements(arr);

            const active = arr.find(a => a.is_active) || null;
            setActiveArrangement(active);

            if (active) {
                const deal = await loadStakingDeal(userId, active, arr.map(a => a.id));
                setSessions(deal.sessions);
                setStats(deal.totals);
                setCurrentMakeup(deal.currentMakeup);
                setUnlinkedEntries(deal.linkable);
            } else {
                setSessions([]);
                setStats({ totalGrossResult: 0, playerShare: 0, backerShare: 0, sessionCount: 0 });
                setCurrentMakeup(0);
                setUnlinkedEntries([]);
            }
        } catch (err) {
            console.warn('Error loading staking data:', err);
            setLoadError('Your Staking Deals Could Not Be Loaded.');
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
            start_date: localDay(),
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
            split_percentage: arr.split_percentage ?? 50,
            markup_percentage: arr.markup_percentage || 0,
            starting_makeup: arr.starting_makeup || 0,
            start_date: arr.start_date || localDay(),
            notes: arr.notes || '',
        });
        setFormError('');
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.backer_name.trim() || saving) return;
        const { terms, error } = normaliseStakingTerms(form);
        if (error) { setFormError(error); return; }
        if (!form.start_date) { setFormError('Choose The Date The Deal Started.'); return; }
        setFormError('');
        setSaving(true);
        try {
            if (editingArrangement) {
                // Changed terms re-apply to every linked session when the deal reloads.
                await updateStakingArrangement(editingArrangement.id, {
                    backer_name: form.backer_name.trim(),
                    backer_email: form.backer_email || null,
                    backer_phone: form.backer_phone || null,
                    ...terms,
                    start_date: form.start_date,
                    notes: form.notes || null,
                });
                toast.success('Arrangement updated');
            } else {
                // Deactivate any existing active arrangement
                await deactivateAllArrangements(userId);
                await createStakingArrangement(userId, {
                    backer_name: form.backer_name.trim(),
                    backer_email: form.backer_email || null,
                    backer_phone: form.backer_phone || null,
                    ...terms,
                    start_date: form.start_date,
                    notes: form.notes || null,
                });
                toast.success('Arrangement created');
            }
            setShowModal(false);
            loadData();
        } catch (err) {
            console.warn('Error saving arrangement:', err);
            toast.error('Failed to save arrangement');
        } finally {
            setSaving(false);
        }
    };

    const handleEndArrangement = async () => {
        if (!activeArrangement) return;
        try {
            await updateStakingArrangement(activeArrangement.id, {
                is_active: false,
                end_date: localDay(),
            });
            toast.success('Arrangement completed');
            setConfirmEnd(false);
            loadData();
        } catch (err) {
            console.warn('Error ending arrangement:', err);
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
            console.warn('Error deleting arrangement:', err);
            toast.error('Failed to delete');
        }
    };

    const handleLinkEntry = async (entry) => {
        if (!activeArrangement || busyId) return;
        setBusyId(entry.id);
        try {
            await linkStakingSession({ ...activeArrangement, current_makeup: currentMakeup }, entry);
            toast.success('Session linked to staking arrangement');
        } catch (err) {
            console.warn('Error linking entry:', err);
            toast.error(err?.message?.startsWith('That Session') || err?.message?.startsWith('Only Poker') ? err.message : 'Failed to link session');
        } finally {
            setBusyId(null);
            loadData();
        }
    };

    const handleUnlink = async (session) => {
        if (busyId) return;
        setBusyId(session.id);
        try {
            await unlinkStakingSession(session.id);
            toast.success('Session removed from this deal');
        } catch (err) {
            console.warn('Error unlinking session:', err);
            toast.error('Failed to remove session');
        } finally {
            setBusyId(null);
            setConfirmUnlink(null);
            loadData();
        }
    };

    const handleExport = () => {
        if (!activeArrangement) return;
        const replay = replayStakingDeal({
            startingMakeup: activeArrangement.starting_makeup,
            splitPercentage: activeArrangement.split_percentage,
            sessions,
        });
        const csv = buildStakingStatementCsv(activeArrangement, replay, CATEGORY_LABELS);
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'staking-' + (activeArrangement.backer_name || 'deal').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-' + localDay() + '.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    // --- RENDER ---

    const [grossText, playerText, backerText] = formatShares(stats.totalGrossResult, stats.playerShare, stats.backerShare, displayEUR);

    if (isLoading) {
        return (
            <div className="sd-panel" style={styles.container}>
                <div style={styles.loadingState}>Loading Staking Data...</div>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="sd-panel" style={styles.container}>
                <div role="alert" style={styles.loadingState}>
                    <p style={{ margin: '0 0 12px' }}>{loadError}</p>
                    <button type="button" onClick={loadData} style={styles.addBtn}>Retry</button>
                </div>
            </div>
        );
    }

    return (
        <div className="sd-panel" style={styles.container}>
            {activeArrangement && <BankrollHeaderAdd label="New Staking Deal" onClick={handleAddNew} />}
            {/* Header */}
            <div style={styles.header}>
                <h3 style={styles.headerTitle}>Staking Tracker</h3>
            </div>

            {/* Active Arrangement */}
            {activeArrangement ? (
                <div style={styles.activeCard}>
                    <div style={styles.activeHeader}>
                        <div>
                            <div style={styles.liveBadge}>● ACTIVE DEAL</div>
                            <h3 style={styles.backerName}>{activeArrangement.backer_name}</h3>
                            <div style={styles.activeMeta}>
                                Started {shortDay(activeArrangement.start_date, true)}
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
                                color: stats.totalGrossResult >= 0 ? '#22c55e' : '#ef4444'
                            }}>
                                {grossText}
                            </div>
                        </div>
                        <div style={styles.statBox}>
                            <div style={styles.statLabel}>YOUR SHARE</div>
                            <div style={{ ...styles.statValue, color: '#22c55e' }}>
                                {playerText}
                            </div>
                        </div>
                        <div style={styles.statBox}>
                            <div style={styles.statLabel}>BACKER SHARE</div>
                            <div style={{ ...styles.statValue, color: '#3b82f6' }}>
                                {backerText}
                            </div>
                        </div>
                        <div style={styles.statBox}>
                            <div style={styles.statLabel}>MAKEUP</div>
                            <div style={{
                                ...styles.statValue,
                                color: currentMakeup > 0 ? '#ef4444' : '#22c55e'
                            }}>
                                {currentMakeup > 0
                                    ? `-${formatStake(currentMakeup, displayEUR)}`
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
                                {sessions.map(s => { const [sGross, sPlayer, sBacker] = formatShares(s.gross_result, s.player_share, s.backer_share, displayEUR); return (
                                    <div key={s.id} style={styles.sessionRow}>
                                        <div style={styles.sessionInfo}>
                                            <span style={styles.sessionDate}>
                                                {shortDay(s.entry_date) || shortDay(s.created_at)}
                                            </span>
                                            {s.category && (
                                                <span style={styles.sessionCat}>{CATEGORY_LABELS[s.category] || s.category}</span>
                                            )}
                                            <span style={{
                                                ...styles.sessionNet,
                                                color: s.gross_result >= 0 ? '#22c55e' : '#ef4444'
                                            }}>
                                                {sGross}
                                            </span>
                                        </div>
                                        <div style={styles.sessionSplits}>
                                            <span style={{ color: '#22c55e', fontSize: 14 }}>You: {sPlayer}</span>
                                            <span style={{ color: '#3b82f6', fontSize: 14 }}>Backer: {sBacker}</span>
                                            {confirmUnlink === s.id ? (
                                                <span style={styles.unlinkConfirm}>
                                                    <button type="button" onClick={() => handleUnlink(s)} disabled={!!busyId} style={styles.confirmYesSmall}>Remove</button>
                                                    <button type="button" onClick={() => setConfirmUnlink(null)} style={styles.confirmNoSmall}>Keep</button>
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => setConfirmUnlink(s.id)}
                                                    disabled={!!busyId}
                                                    aria-label={'Remove The ' + (shortDay(s.entry_date) || 'Linked') + ' Session From This Deal'}
                                                    style={styles.unlinkBtn}
                                                >
                                                    Unlink
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ); })}
                            </div>
                        </div>
                    )}

                    {/* Unlinked Entries */}
                    {unlinkedEntries.length > 0 && (
                        <div style={styles.sessionsSection}>
                            <div style={styles.sectionTitle}>Unlinked Sessions ({unlinkedEntries.length})</div>
                            <div style={styles.sessionsScroll}>
                                {unlinkedEntries.map(entry => {
                                    const net = entry.net_result ?? (entry.gross_out || 0) - (entry.gross_in || 0);
                                    return (
                                        <div key={entry.id} style={styles.sessionRow}>
                                            <div style={styles.sessionInfo}>
                                                <span style={styles.sessionDate}>
                                                    {shortDay(entry.entry_date)}
                                                </span>
                                                <span style={styles.sessionCat}>
                                                    {CATEGORY_LABELS[entry.category] || entry.category}
                                                </span>
                                                <span style={{
                                                    ...styles.sessionNet,
                                                    color: net >= 0 ? '#22c55e' : '#ef4444'
                                                }}>
                                                    {formatStake(net, displayEUR)}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleLinkEntry(entry)}
                                                disabled={!!busyId}
                                                aria-label={'Link The ' + shortDay(entry.entry_date) + ' Session To This Deal'}
                                                style={{ ...styles.linkBtn, opacity: busyId ? 0.5 : 1 }}
                                            >
                                                {busyId === entry.id ? 'Linking...' : 'Link'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {sessions.length === 0 && unlinkedEntries.length === 0 && (
                        <p style={styles.noSessions}>
                            No Poker Sessions Logged Since {shortDay(activeArrangement.start_date, true)} Yet. Log A Cash Game Or Tournament And Link It Here.
                        </p>
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
                                {sessions.length > 0 && (
                                    <button type="button" onClick={handleExport} style={styles.editBtn}>
                                        Export Statement
                                    </button>
                                )}
                            </>
                        ) : (
                            <AnimatePresence>
                                <motion.div
                                    initial={{ opacity: 0, y: -5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    style={styles.confirmRow}
                                >
                                    <span style={{ color: '#94a3b8', fontSize: 14 }}>End This Arrangement?</span>
                                    <button onClick={handleEndArrangement} style={styles.confirmYes}>Yes, End</button>
                                    <button onClick={() => setConfirmEnd(false)} style={styles.confirmNo}>Cancel</button>
                                </motion.div>
                            </AnimatePresence>
                        )}
                    </div>
                </div>
            ) : (
                <div style={styles.emptyState}>
                    <p style={styles.emptyTitle}>No Active Staking Deal</p>
                    <p style={styles.emptyHint}>Track Backer Relationships, Profit Splits & Makeup</p>
                    <BankrollHeaderAdd label="New Staking Deal" onClick={handleAddNew}>
                        <button onClick={handleAddNew} style={styles.addBtn}>+ New Deal</button>
                    </BankrollHeaderAdd>
                </div>
            )}

            {/* Past Arrangements */}
            {arrangements.filter(a => !a.is_active).length > 0 && (
                <div style={styles.historySection}>
                    <h3 style={styles.historyTitle}>Past Arrangements</h3>
                    {arrangements.filter(a => !a.is_active).map(arr => (
                        <div key={arr.id} style={styles.pastCard}>
                            <div>
                                <div style={styles.pastName}>{arr.backer_name}</div>
                                <div style={styles.pastMeta}>
                                    {arr.split_percentage}% / {100 - arr.split_percentage}%
                                    {arr.end_date && ` · Ended ${shortDay(arr.end_date, true)}`}
                                    {Number(arr.current_makeup) > 0 && ` · Makeup ${formatStake(arr.current_makeup, displayEUR)}`}
                                </div>
                            </div>
                            <div style={styles.pastActions}>
                                {confirmDelete === arr.id ? (
                                    <>
                                        <button onClick={() => handleDelete(arr.id)} style={styles.confirmYesSmall}>Delete</button>
                                        <button onClick={() => setConfirmDelete(null)} style={styles.confirmNoSmall}>Cancel</button>
                                    </>
                                ) : (
                                    <button type="button" onClick={() => setConfirmDelete(arr.id)} aria-label={'Delete The Deal With ' + arr.backer_name} style={styles.deleteBtn}>✕</button>
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
                            className="sd-panel" style={styles.modal}
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
                                        min="0" max="100" step="1" inputMode="numeric"
                                        value={form.split_percentage}
                                        onChange={e => setForm({ ...form, split_percentage: e.target.value })}
                                        style={styles.formInput}
                                    />
                                </div>
                                <div>
                                    <label style={styles.formLabel}>Backer Split %</label>
                                    <input
                                        type="number"
                                        value={(() => { const n = Number(form.split_percentage); return form.split_percentage !== '' && Number.isInteger(n) && n >= 0 && n <= 100 ? 100 - n : ''; })()}
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
                                    <label style={styles.formLabel}>Starting Makeup ($)</label>
                                    <input
                                        type="number"
                                        min="0" step="0.01" inputMode="decimal"
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

                            {formError && <p role="alert" style={styles.formError}>{formError}</p>}

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

// ── SmarterPoker Dark Inline Styles (matching TripTracker/SeriesTracker) ──

const styles = {
    container: {
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
        borderBottom: '1px solid rgba(255,255,255,0.15)',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: 700,
        color: '#edf6ff',
        margin: 0,
    },
    addBtn: {
        background: GRADIENTS.cyanAction,
        color: '#edf6ff',
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 8,
        padding: '8px 16px',
        fontSize: 14,
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
        fontSize: 14,
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
        fontSize: 14,
        color: '#94a3b8',
    },
    splitRow: {
        display: 'flex',
        background: 'rgba(0,0,0,0.25)',
        borderRadius: 8,
        border: '2px solid rgba(255,255,255,0.15)',
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
        color: '#edf6ff',
    },
    splitLabel: {
        fontSize: 14,
        fontWeight: 600,
        color: '#9aaec3',
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
        border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 8,
        padding: '10px 12px',
        textAlign: 'center',
    },
    statLabel: {
        fontSize: 14,
        fontWeight: 600,
        color: '#9aaec3',
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
        fontSize: 14,
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
        flexWrap: 'wrap',
        gap: 6,
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(0,0,0,0.25)',
        borderRadius: 6,
        padding: '8px 10px',
        border: '2px solid rgba(255,255,255,0.15)',
    },
    sessionInfo: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    sessionDate: {
        fontSize: 14,
        color: '#9aaec3',
        fontWeight: 500,
    },
    sessionCat: {
        fontSize: 14,
        color: '#cbd5e1',
    },
    sessionNet: {
        fontSize: 14,
        fontWeight: 700,
    },
    sessionSplits: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 12,
    },
    unlinkBtn: {
        background: 'transparent',
        color: '#9aaec3',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 4,
        padding: '3px 8px',
        fontSize: 14,
        cursor: 'pointer',
    },
    unlinkConfirm: {
        display: 'inline-flex',
        gap: 6,
    },
    noSessions: {
        fontSize: 14,
        color: '#9aaec3',
        margin: '0 0 14px',
    },
    formError: {
        color: '#f87171',
        fontSize: 14,
        margin: '12px 0 0',
    },
    linkBtn: {
        background: 'rgba(59,130,246,0.15)',
        color: '#3b82f6',
        border: '2px solid rgba(59,130,246,0.3)',
        borderRadius: 4,
        padding: '3px 10px',
        fontSize: 14,
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
        background: GRADIENTS.metalButton,
        color: '#edf6ff',
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 8,
        padding: '10px 18px',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    addEntryBtn: {
        background: GRADIENTS.cyanAction,
        color: '#edf6ff',
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 8,
        padding: '10px 18px',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    completeBtn: {
        background: 'rgba(16, 185, 129, 0.15)',
        color: '#10b981',
        border: '2px solid rgba(16, 185, 129, 0.3)',
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
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    confirmNo: {
        background: 'transparent',
        color: '#94a3b8',
        border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 6,
        padding: '8px 16px',
        fontSize: 14,
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
        fontSize: 14,
        color: '#9aaec3',
        margin: '0 0 16px',
    },

    // History
    historySection: {
        padding: '14px 18px',
        borderTop: '1px solid rgba(255,255,255,0.15)',
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
        background: GRADIENTS.darkPanel,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 6,
    },
    pastName: {
        fontSize: 14,
        fontWeight: 600,
        color: '#edf6ff',
    },
    pastMeta: {
        fontSize: 14,
        color: '#9aaec3',
        marginTop: 2,
    },
    pastActions: {
        display: 'flex',
        gap: 6,
    },
    deleteBtn: {
        background: 'rgba(239,68,68,0.15)',
        color: '#ef4444',
        border: '2px solid rgba(239,68,68,0.3)',
        borderRadius: 4,
        padding: '4px 8px',
        fontSize: 14,
        cursor: 'pointer',
    },
    confirmYesSmall: {
        background: '#ef4444',
        color: '#fff',
        border: 'none',
        borderRadius: 4,
        padding: '4px 10px',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    confirmNoSmall: {
        background: 'transparent',
        color: '#94a3b8',
        border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 4,
        padding: '4px 10px',
        fontSize: 14,
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

        borderRadius: 16,
        padding: 24,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 700,
        color: '#edf6ff',
        marginBottom: 18,
        textAlign: 'center',
    },
    formLabel: {
        display: 'block',
        fontSize: 14,
        fontWeight: 600,
        color: '#94a3b8',
        marginBottom: 4,
        marginTop: 12,
    },
    formInput: {
        width: '100%',
        padding: '10px 12px',
        background: '#081320',
        border: '2px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        fontSize: 14,
        color: '#edf6ff',
        boxSizing: 'border-box',
    },
    formRow: {
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
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
        border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 10,
        fontSize: 14,
        color: '#94a3b8',
        cursor: 'pointer',
    },
    saveBtn: {
        flex: 1,
        padding: 12,
        background: GRADIENTS.cyanAction,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 10,
        fontSize: 14,
        fontWeight: 600,
        color: '#edf6ff',
        cursor: 'pointer',
    },
};
