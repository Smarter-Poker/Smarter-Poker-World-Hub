import BankrollHeaderAdd from './BankrollHeaderAdd';
/**
 * SERIES TRACKER COMPONENT
 * ---------------------------------------------------------------
 * Full series management: create, track active, complete, view history
 * Mirrors Trip Tracker structure for multi-day tournament series
 * ---------------------------------------------------------------
 */

import { GRADIENTS, METAL } from './metalStyles';
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePendingDeletes } from './usePendingDeletes';
import { withoutHidden } from '../../lib/bankroll/pendingDeletes.mjs';
import {
    getActiveSeries,
    fetchSeries,
    createSeries,
    updateSeries,
    completeSeries,
    deleteSeries,
    getSeriesReport,
    reopenSeries,
    fetchLedgerEntries,
} from '../../lib/bankroll/bankrollSelectors';
import { getUserLocations } from '../../lib/bankroll/locationMemory';
import { formatCurrency, formatCurrencyWithSign } from '../../lib/bankroll/currencyUtils';
import toast from '../../stores/toastStore';
import TripReport from './TripReport';
import { localDay, parseLedgerDay } from '../../lib/bankroll/localDates.mjs';
import { dateRangeProblem, entryNet, tripDayLabel } from '../../lib/bankroll/tripMath.mjs';

const CATEGORY_LABELS = {
    poker_cash: 'Cash Games',
    poker_mtt: 'Tournaments',
    casino_table: 'Casino',
    slots: 'Slots',
    sports: 'Sports Betting',
    expense: 'Expenses',
};

function SeriesTracker({ userId, onOpenLog, onEditEntry, onDeleteEntry, refreshTrigger, openSeriesId, displayEUR = false }) {
    const [activeSeries, setActiveSeries] = useState(null);
    const [completedSeries, setCompletedSeries] = useState([]);
    const [loadedSeriesEntries, setSeriesEntries] = useState([]);
    // A deleted entry disappears at once and returns on Undo (usePendingDeletes).
    const { hidden: hiddenDeletes } = usePendingDeletes(userId);
    const seriesEntries = useMemo(() => withoutHidden(loadedSeriesEntries, hiddenDeletes), [loadedSeriesEntries, hiddenDeletes]);
    const [locations, setLocations] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [entriesError, setEntriesError] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [selectedSeriesReport, setSelectedSeriesReport] = useState(null);
    const [confirmComplete, setConfirmComplete] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', location_id: null, purpose: '', notes: '', end_date: '' });

    const [newSeries, setNewSeries] = useState({
        name: '',
        location_id: null,
        start_date: localDay(),
        end_date: null,
        purpose: '',
        notes: '',
    });
    const [showSeriesSuggestions, setShowSeriesSuggestions] = useState(false);
    const [dbSeriesNames, setDbSeriesNames] = useState([]);
    const [dbVenues, setDbVenues] = useState([]);
    const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);

    const loadData = useCallback(async () => {
        if (!userId) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const [active, all, locs] = await Promise.all([
                getActiveSeries(userId),
                fetchSeries(userId),
                getUserLocations(userId).catch(() => []),
            ]);
            setActiveSeries(active);
            setCompletedSeries(all.filter(s => s.status === 'completed'));
            setLocations(locs || []);
            setLoadError(false);

            // Fetch individual entries for active series
            if (active && active.id) {
                try {
                    const entries = await fetchLedgerEntries(userId, { tripId: active.id, includeExpenses: true, limit: 500 });
                    setSeriesEntries(entries || []);
                    setEntriesError(false);
                } catch (entryErr) {
                    console.warn('Could not load series entries:', entryErr);
                    setSeriesEntries([]);
                    setEntriesError(true);
                }
            } else {
                setSeriesEntries([]);
                setEntriesError(false);
            }
        } catch (err) {
            console.warn('Error loading series data:', err);
            setLoadError(true);
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

    useEffect(() => { loadData(); }, [loadData, refreshTrigger]);

    // Opened from a series' summary row in Recent Activity: show its report.
    useEffect(() => {
        if (!userId || !openSeriesId) return;
        let cancelled = false;
        getSeriesReport(userId, openSeriesId)
            .then(report => { if (!cancelled && report?.trip?.status === 'completed') setSelectedSeriesReport(report); })
            .catch(err => console.warn('Could not open series report:', err));
        return () => { cancelled = true; };
    }, [userId, openSeriesId]);

    // Fetch DB series + venues on mount (independent of userId)
    useEffect(() => {
        // Fetch tournament series (tour names)
        fetch('/api/poker/series?limit=200')
            .then(r => r.json())
            .then(data => {
                if (data.success && data.data) {
                    const tourSet = new Set();
                    data.data.forEach(s => {
                        if (s.short_name) tourSet.add(s.short_name);
                        if (s.series_type === 'major' && s.name) tourSet.add(s.name);
                    });
                    setDbSeriesNames([...tourSet].sort());
                }
            })
            .catch(err => console.warn('Could not load series:', err));

        // Fetch all 483 poker venues
        fetch('/api/poker/venues?limit=500')
            .then(r => r.json())
            .then(data => {
                if (data.success && data.data) {
                    setDbVenues(data.data.map(v => ({
                        name: v.name,
                        city: v.city || '',
                        state: v.state || '',
                    })).sort((a, b) => a.name.localeCompare(b.name)));
                }
            })
            .catch(err => console.warn('Could not load venues:', err));
    }, []);

    const handleCreateSeries = async (e) => {
        e.preventDefault();
        if (!newSeries.name.trim()) {
            toast.error('Please enter a series name');
            return;
        }
        try {
            let locationId = newSeries.location_id;
            if (locationId === '__new__' && newSeries.location_name?.trim()) {
                const { getOrCreateLocation } = await import('../../lib/bankroll/locationMemory');
                locationId = await getOrCreateLocation(userId, newSeries.location_name.trim());
            } else if (locationId === '__new__') {
                locationId = null;
            }

            // Sanitize: convert empty strings to null for date fields
            const seriesData = { ...newSeries, location_id: locationId };
            if (!seriesData.end_date) seriesData.end_date = null;
            if (!seriesData.start_date) seriesData.start_date = null;
            await createSeries(userId, seriesData);
            toast.success('Series started!');
            setShowCreateForm(false);
            setNewSeries({ name: '', location_id: null, start_date: localDay(), end_date: null, purpose: '', notes: '' });
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to create series');
        }
    };

    const handleCompleteSeries = async () => {
        if (!activeSeries) return;
        try {
            await completeSeries(userId, activeSeries.id);
            toast.success('Series completed!');
            setConfirmComplete(false);
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to complete series');
        }
    };

    const handleDeleteSeries = async () => {
        if (!activeSeries) return;
        try {
            await deleteSeries(userId, activeSeries.id);
            toast.success('Series deleted');
            setConfirmDelete(false);
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to delete series');
        }
    };

    const startEditing = () => {
        if (!activeSeries) return;
        setEditForm({
            name: activeSeries.name || '',
            location_id: activeSeries.location_id || null,
            purpose: activeSeries.purpose || '',
            notes: activeSeries.notes || '',
            end_date: activeSeries.end_date || '',
        });
        setEditMode(true);
    };

    const handleSaveEdit = async () => {
        if (!activeSeries) return;
        if (!editForm.name.trim()) {
            toast.error('Series name is required');
            return;
        }
        const rangeProblem = dateRangeProblem(activeSeries.start_date, editForm.end_date || null);
        if (rangeProblem) {
            toast.error(rangeProblem);
            return;
        }
        try {
            await updateSeries(userId, activeSeries.id, editForm);
            toast.success('Series updated!');
            setEditMode(false);
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to update series');
        }
    };

    const handleViewReport = async (seriesId) => {
        try {
            const report = await getSeriesReport(userId, seriesId);
            setSelectedSeriesReport(report);
        } catch (err) {
            toast.error('Could Not Load The Series Report. Please Try Again.');
        }
    };

    const handleReopenSeries = async (seriesId) => {
        try {
            await reopenSeries(userId, seriesId);
            toast.success('Series Reopened');
            setSelectedSeriesReport(null);
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to reopen series');
        }
    };

    if (selectedSeriesReport) {
        return (
            <TripReport
                displayEUR={displayEUR}
                report={selectedSeriesReport}
                onBack={() => setSelectedSeriesReport(null)}
                kind="series"
                onReopen={!activeSeries && selectedSeriesReport.trip?.status === 'completed'
                    ? () => handleReopenSeries(selectedSeriesReport.trip.id)
                    : null}
            />
        );
    }

    const dayLabel = activeSeries ? tripDayLabel(activeSeries.start_date) : '';

    return (
        <div className="sd-panel" style={styles.container}>
            {activeSeries && onOpenLog && <BankrollHeaderAdd label="Add Series Entry" onClick={onOpenLog} />}
            {/* --- ACTIVE SERIES BANNER --- */}
            {activeSeries && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={styles.activeCard}
                >
                    {/* Delete X */}
                    <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        style={styles.deleteX}
                        title="Delete Series"
                        aria-label="Delete Series"
                    >✕</button>

                    <div style={styles.activeHeader}>
                        <div style={styles.activeLed} />
                        <span style={styles.activeLabel}>LIVE SERIES</span>
                    </div>

                    {/* Series Info (view vs edit) */}
                    {!editMode ? (
                        <>
                            <h2 style={styles.activeName}>{activeSeries.name}</h2>
                            <p style={styles.activeMeta}>
                                {activeSeries.location_name && `${activeSeries.location_name} · `}
                                {dayLabel.startsWith('Day') ? 'Started' : 'Starts'} {parseLedgerDay(activeSeries.start_date).toLocaleDateString()}{dayLabel.startsWith('Day') ? ` · ${dayLabel}` : ''}
                                {activeSeries.end_date && ` · Ends ${parseLedgerDay(activeSeries.end_date).toLocaleDateString()}`}
                            </p>
                        </>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '8px 0 12px' }}>
                            <input
                                type="text"
                                value={editForm.name}
                                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                placeholder="Series Name"
                                aria-label="Series Name"
                                style={styles.formInput}
                                autoFocus
                            />
                            <select
                                value={editForm.location_id || ''}
                                onChange={e => setEditForm({ ...editForm, location_id: e.target.value || null })}
                                style={styles.formInput}
                            >
                                <option value="">-- Select Location --</option>
                                {locations.map(loc => (
                                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                                ))}
                            </select>
                            <input
                                type="text"
                                value={editForm.purpose}
                                onChange={e => setEditForm({ ...editForm, purpose: e.target.value })}
                                placeholder="Purpose (e.g. Main Event Run)"
                                aria-label="Purpose"
                                style={styles.formInput}
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: 14, color: '#94a3b8', marginBottom: 4, display: 'block' }}>End Date</label>
                                    <input
                                        type="date"
                                        value={editForm.end_date}
                                        onChange={e => setEditForm({ ...editForm, end_date: e.target.value })}
                                        style={styles.formInput}
                                    />
                                </div>
                            </div>
                            <textarea
                                value={editForm.notes}
                                onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                                placeholder="Notes"
                                aria-label="Notes"
                                style={{ ...styles.formInput, minHeight: 60, resize: 'vertical' }}
                            />
                        </div>
                    )}

                    {/* Running Totals */}
                    {!editMode && (
                        <div style={styles.runningStats}>
                            <div style={styles.runningStat}>
                                <span style={styles.runningStatLabel}>Net P/L</span>
                                <span style={{
                                    ...styles.runningStatValue,
                                    color: (activeSeries.totalNet || 0) >= 0 ? '#10b981' : '#ef4444',
                                }}>
                                    {formatCurrency(activeSeries.totalNet || 0, displayEUR)}
                                </span>
                            </div>
                            <div style={styles.runningStat}>
                                <span style={styles.runningStatLabel}>Sessions</span>
                                <span style={styles.runningStatValue}>{activeSeries.sessionCount || 0}</span>
                            </div>
                            <div style={styles.runningStat}>
                                <span style={styles.runningStatLabel}>Expenses</span>
                                <span style={{ ...styles.runningStatValue, color: '#ef4444' }}>
                                    {formatCurrency(activeSeries.totalExpenses || 0, displayEUR)}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Category Breakdown */}
                    {!editMode && activeSeries.categoryBreakdown && Object.keys(activeSeries.categoryBreakdown || {}).length > 0 && (
                        <div style={styles.breakdownRow}>
                            {Object.entries(activeSeries.categoryBreakdown || {}).map(([cat, data]) => (
                                <span key={cat} style={styles.breakdownTag}>
                                    {CATEGORY_LABELS[cat] || cat}: {formatCurrency(data.net, displayEUR)}
                                </span>
                            ))}
                        </div>
                    )}

                    {!editMode && entriesError && (
                        <div role="alert" style={styles.inlineError}>
                            Could Not Load This Series' Entries.
                            <button type="button" onClick={loadData} style={styles.retryBtn}>Retry</button>
                        </div>
                    )}

                    {/* --- SERIES ENTRIES LIST --- */}
                    {!editMode && seriesEntries.length > 0 && (
                        <div style={styles.entriesSection}>
                            <h4 style={styles.entriesSectionTitle}>Series Entries ({seriesEntries.length})</h4>
                            <div style={styles.entriesScroll}>
                                {seriesEntries.map(entry => {
                                    const net = entry.category === 'expense' ? -Math.abs(entryNet(entry)) : entryNet(entry);
                                    const catLabel = CATEGORY_LABELS[entry.category] || entry.category || 'Entry';
                                    return (
                                        <div key={entry.id} style={styles.entryRow}>
                                            <div style={styles.entryInfo}>
                                                <span style={styles.entryDate}>
                                                    {entry.entry_date ? parseLedgerDay(entry.entry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                                                </span>
                                                <span style={styles.entryCat}>{catLabel}</span>
                                                {entry.stakes && <span style={styles.entryStakes}>{entry.stakes}</span>}
                                            </div>
                                            <div style={styles.entryRight}>
                                                <span style={{ ...styles.entryNet, color: net >= 0 ? '#10b981' : '#ef4444' }}>
                                                    {formatCurrencyWithSign(net, displayEUR)}
                                                </span>
                                                <div style={styles.entryActions}>
                                                    {onEditEntry && (
                                                        <button
                                                            type="button"
                                                            onClick={() => onEditEntry(entry)}
                                                            style={styles.entryEditBtn}
                                                            title="Edit Entry"
                                                            aria-label={`Edit ${catLabel} Entry`}
                                                        >✏</button>
                                                    )}
                                                    {onDeleteEntry && (
                                                        <button
                                                            onClick={async () => {
                                                                if (confirm('Delete this entry?')) {
                                                                    await onDeleteEntry(entry.id);
                                                                }
                                                            }}
                                                            type="button"
                                                            style={styles.entryDeleteBtn}
                                                            title="Delete Entry"
                                                            aria-label={`Delete ${catLabel} Entry`}
                                                        >✕</button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div style={styles.activeActions}>
                        {editMode ? (
                            <>
                                <button onClick={handleSaveEdit} style={styles.completeBtn}>Save Changes</button>
                                <button onClick={() => setEditMode(false)} style={styles.cancelEditBtn}>Cancel</button>
                            </>
                        ) : !confirmComplete ? (
                            <>
                                <button onClick={startEditing} style={styles.editBtn}>Edit Series</button>
                                {onOpenLog && (
                                    <button onClick={onOpenLog} style={styles.addEntryBtn}>＋ Add Entry</button>
                                )}
                                <button onClick={() => setConfirmComplete(true)} style={styles.completeBtn}>
                                    Complete Series
                                </button>
                            </>
                        ) : (
                            <div style={styles.confirmRow}>
                                <span style={styles.confirmText}>Finalize This Series?</span>
                                <button onClick={handleCompleteSeries} style={styles.confirmYes}>Yes, Complete</button>
                                <button onClick={() => setConfirmComplete(false)} style={styles.confirmNo}>Cancel</button>
                            </div>
                        )}
                    </div>

                    {/* Delete Confirmation */}
                    <AnimatePresence>
                        {confirmDelete && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                style={styles.deleteOverlay}
                            >
                                <div style={styles.deletePopup}>
                                    <p style={styles.deletePopupText}>Are You Sure You Want To Delete This Series?</p>
                                    <p style={styles.deletePopupSub}>All Entries Will Be Unlinked From This Series.</p>
                                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                                        <button onClick={handleDeleteSeries} style={styles.deleteConfirmBtn}>Yes, Delete</button>
                                        <button onClick={() => setConfirmDelete(false)} style={styles.deleteCancelBtn}>Cancel</button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}

            {/* --- CREATE SERIES --- */}
            {!activeSeries && !showCreateForm && (
                <BankrollHeaderAdd label="Start A New Series" onClick={() => setShowCreateForm(true)}>
                    <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onClick={() => setShowCreateForm(true)}
                        style={styles.createBtn}
                    >
                        <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>No Active Series</span>
                        <div>
                            <div style={styles.createTitle}>Start A New Series</div>
                            <div style={styles.createSub}>Track Multi-Day Tournament Series, WSOP Runs, And Events</div>
                        </div>
                    </motion.button>
                </BankrollHeaderAdd>
            )}

            <AnimatePresence>
                {showCreateForm && (
                    <motion.form
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        onSubmit={handleCreateSeries}
                        style={styles.createForm}
                    >
                        <h3 style={styles.formTitle}>New Series</h3>

                        <label style={styles.formLabel}>Series Name *</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="text"
                                value={newSeries.name}
                                onChange={e => {
                                    setNewSeries({ ...newSeries, name: e.target.value });
                                    setShowSeriesSuggestions(true);
                                }}
                                onFocus={() => setShowSeriesSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowSeriesSuggestions(false), 200)}
                                placeholder="Type Series Or Tour Name..."
                                style={styles.formInput}
                                autoFocus
                            />
                            {showSeriesSuggestions && (() => {
                                const q = (newSeries.name || '').toLowerCase();
                                const pastNames = [...new Set(completedSeries.map(s => s.name))];
                                const allNames = [...new Set([...pastNames, ...dbSeriesNames])];
                                const filtered = q.length > 0
                                    ? allNames.filter(n => n.toLowerCase().includes(q))
                                    : allNames;
                                if (filtered.length === 0) return null;
                                return (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                                        background: '#101f31', border: '2px solid rgba(255,255,255,0.15)',
                                        borderRadius: 8, maxHeight: 200, overflowY: 'auto', zIndex: 50,
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                                    }}>
                                        {pastNames.length > 0 && filtered.some(n => pastNames.includes(n)) && (
                                            <div style={{ padding: '6px 14px', fontSize: 14, color: '#a1b4c7', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>Your Series</div>
                                        )}
                                        {filtered.filter(n => pastNames.includes(n)).map((name, i) => (
                                            <button key={`p-${i}`} type="button"
                                                onMouseDown={e => { e.preventDefault(); setNewSeries({ ...newSeries, name }); setShowSeriesSuggestions(false); }}
                                                style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.15)', color: '#edf6ff', fontSize: 14, textAlign: 'left', cursor: 'pointer' }}
                                            >{name}</button>
                                        ))}
                                        {dbSeriesNames.length > 0 && filtered.some(n => dbSeriesNames.includes(n) && !pastNames.includes(n)) && (
                                            <div style={{ padding: '6px 14px', fontSize: 14, color: '#a1b4c7', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>Tournament Tours</div>
                                        )}
                                        {filtered.filter(n => !pastNames.includes(n)).map((name, i) => (
                                            <button key={`d-${i}`} type="button"
                                                onMouseDown={e => { e.preventDefault(); setNewSeries({ ...newSeries, name }); setShowSeriesSuggestions(false); }}
                                                style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.15)', color: '#edf6ff', fontSize: 14, textAlign: 'left', cursor: 'pointer' }}
                                            >{name}</button>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>

                        <label style={styles.formLabel}>Location / Venue</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="text"
                                value={newSeries.location_name || ''}
                                onChange={e => {
                                    const val = e.target.value;
                                    const match = locations.find(l => l.name.toLowerCase() === val.toLowerCase());
                                    setNewSeries({ ...newSeries, location_name: val, location_id: match ? match.id : '__new__' });
                                    setShowLocationSuggestions(true);
                                }}
                                onFocus={() => setShowLocationSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowLocationSuggestions(false), 200)}
                                placeholder="Type Venue Name..."
                                style={styles.formInput}
                            />
                            {showLocationSuggestions && (() => {
                                const q = (newSeries.location_name || '').toLowerCase();
                                // User's saved locations
                                const savedFiltered = q.length > 0
                                    ? locations.filter(l => l.name.toLowerCase().includes(q))
                                    : locations;
                                // DB venues (exclude ones already in saved)
                                const savedNames = new Set(locations.map(l => l.name.toLowerCase()));
                                const dbFiltered = q.length > 0
                                    ? dbVenues.filter(v => !savedNames.has(v.name.toLowerCase()) && (v.name.toLowerCase().includes(q) || v.city.toLowerCase().includes(q) || v.state.toLowerCase().includes(q)))
                                    : [];
                                if (savedFiltered.length === 0 && dbFiltered.length === 0) return null;
                                return (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                                        background: '#101f31', border: '2px solid rgba(255,255,255,0.15)',
                                        borderRadius: 8, maxHeight: 220, overflowY: 'auto', zIndex: 50,
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                                    }}>
                                        {savedFiltered.length > 0 && (
                                            <div style={{ padding: '6px 14px', fontSize: 14, color: '#a1b4c7', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>Your Venues</div>
                                        )}
                                        {savedFiltered.map(loc => (
                                            <button key={`s-${loc.id}`} type="button"
                                                onMouseDown={e => { e.preventDefault(); setNewSeries({ ...newSeries, location_id: loc.id, location_name: loc.name }); setShowLocationSuggestions(false); }}
                                                style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.15)', color: '#edf6ff', fontSize: 14, textAlign: 'left', cursor: 'pointer' }}
                                            >{loc.name}</button>
                                        ))}
                                        {dbFiltered.length > 0 && (
                                            <div style={{ padding: '6px 14px', fontSize: 14, color: '#a1b4c7', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>Poker Venues</div>
                                        )}
                                        {dbFiltered.slice(0, 20).map((v, i) => (
                                            <button key={`db-${i}`} type="button"
                                                onMouseDown={e => { e.preventDefault(); setNewSeries({ ...newSeries, location_id: '__new__', location_name: v.name }); setShowLocationSuggestions(false); }}
                                                style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.15)', color: '#edf6ff', fontSize: 14, textAlign: 'left', cursor: 'pointer' }}
                                            >{v.name} <span style={{ fontSize: 14, color: '#9fb4c8' }}>{v.city}, {v.state}</span></button>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>

                        <label style={styles.formLabel}>Start Date</label>
                        <input
                            type="date"
                            value={newSeries.start_date}
                            onChange={e => setNewSeries({ ...newSeries, start_date: e.target.value })}
                            style={styles.formInput}
                        />

                        <label style={styles.formLabel}>Purpose</label>
                        <input
                            type="text"
                            value={newSeries.purpose}
                            onChange={e => setNewSeries({ ...newSeries, purpose: e.target.value })}
                            placeholder="e.g. Main Event Run, Satellites"
                            style={styles.formInput}
                        />

                        <label style={styles.formLabel}>Notes</label>
                        <textarea
                            value={newSeries.notes}
                            onChange={e => setNewSeries({ ...newSeries, notes: e.target.value })}
                            placeholder="Any Notes..."
                            style={{ ...styles.formInput, minHeight: 60, resize: 'vertical' }}
                        />

                        <div style={styles.formActions}>
                            <button type="submit" style={styles.formSubmitBtn}>Start Series</button>
                            <button type="button" onClick={() => setShowCreateForm(false)} style={styles.formCancelBtn}>Cancel</button>
                        </div>
                    </motion.form>
                )}
            </AnimatePresence>

            {/* --- COMPLETED SERIES --- */}
            <div style={styles.historySection}>
                <h3 style={styles.historyTitle}>Completed Series</h3>
                {isLoading ? (
                    <div style={styles.loadingPlaceholder}>Loading Series...</div>
                ) : loadError ? (
                    <div role="alert" style={styles.emptyState}>
                        Could Not Load Your Series.
                        <button type="button" onClick={loadData} style={styles.retryBtn}>Retry</button>
                    </div>
                ) : completedSeries.length === 0 ? (
                    <div style={styles.emptyState}>No Completed Series Yet. Start Your First Series Above!</div>
                ) : (
                    <div style={styles.seriesGrid}>
                        {completedSeries.map(series => (
                            <motion.button type="button"
                                key={series.id}
                                aria-label={`View Report For ${series.name}`}
                                onClick={() => handleViewReport(series.id)}
                                style={styles.seriesCard}
                            >
                                <span style={styles.seriesCardHeader}>
                                    <span style={styles.seriesCardName}>{series.name}</span>
                                    <span style={{
                                        ...styles.seriesCardPL,
                                        color: (series.totalNet || 0) >= 0 ? '#10b981' : '#ef4444',
                                    }}>
                                        {formatCurrency(series.totalNet || 0, displayEUR)}
                                    </span>
                                </span>
                                <span style={styles.seriesCardMeta}>
                                    {series.location_name && <span>{series.location_name}</span>}
                                    <span>
                                        {parseLedgerDay(series.start_date).toLocaleDateString()}
                                        {series.end_date && ` - ${parseLedgerDay(series.end_date).toLocaleDateString()}`}
                                    </span>
                                </span>
                                <span style={styles.seriesCardFooter}>
                                    <span>{series.sessionCount || 0} {series.sessionCount === 1 ? 'Session' : 'Sessions'}</span>
                                    <span style={styles.viewReportLink}>View Report →</span>
                                </span>
                            </motion.button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

const styles = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
    },

    // Active Series
    activeCard: {
        background: GRADIENTS.darkPanel,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 12,
        padding: 20,
        position: 'relative',
    },
    activeHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    activeLed: {
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: '#2374e1',
        boxShadow: '0 0 8px rgba(35, 116, 225, 0.6)',
        animation: 'pulse 2s infinite',
    },
    activeLabel: {
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: 1.5,
        color: '#92cfff',
        textTransform: 'uppercase',
    },
    activeName: {
        fontSize: 22,
        fontWeight: 700,
        color: '#fff',
        margin: '4px 0',
        paddingRight: 36,
        overflowWrap: 'anywhere',
    },
    activeMeta: {
        fontSize: 14,
        color: '#94a3b8',
        margin: '0 0 16px',
    },

    // Running stats
    runningStats: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 112px), 1fr))',
        gap: 12,
        marginBottom: 16,
    },
    runningStat: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 8,
        padding: '10px 8px',
    },
    runningStatLabel: {
        fontSize: 14,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    runningStatValue: {
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
    },

    // Breakdown
    breakdownRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 16,
    },
    breakdownTag: {
        fontSize: 14,
        background: 'rgba(255,255,255,0.15)',
        border: '2px solid rgba(255,255,255,0.1)',
        borderRadius: 4,
        padding: '3px 8px',
        color: '#94a3b8',
    },

    // Entry list
    entriesSection: {
        marginBottom: 16,
    },
    entriesSectionTitle: {
        fontSize: 14,
        fontWeight: 600,
        color: '#94a3b8',
        marginBottom: 8,
        letterSpacing: 0.5,
    },
    entriesScroll: {
        maxHeight: 240,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    entryRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(0,0,0,0.25)',
        borderRadius: 6,
        padding: '8px 10px',
        border: '2px solid rgba(255,255,255,0.15)',
    },
    entryInfo: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        minWidth: 0,
        flex: 1,
    },
    entryDate: {
        fontSize: 14,
        color: '#9aaec3',
        fontWeight: 500,
        whiteSpace: 'nowrap',
    },
    entryCat: {
        fontSize: 14,
        color: '#cbd5e1',
        fontWeight: 500,
    },
    entryStakes: {
        fontSize: 14,
        color: '#9aaec3',
        background: 'rgba(255,255,255,0.15)',
        borderRadius: 3,
        padding: '1px 5px',
    },
    entryRight: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
    },
    entryNet: {
        fontSize: 14,
        fontWeight: 700,
        whiteSpace: 'nowrap',
    },
    entryActions: {
        display: 'flex',
        gap: 4,
    },
    entryEditBtn: {
        background: 'rgba(59,130,246,0.15)',
        border: '2px solid rgba(59,130,246,0.3)',
        borderRadius: 4,
        padding: '2px 6px',
        fontSize: 14,
        cursor: 'pointer',
        color: '#3b82f6',
        lineHeight: 1,
    },
    entryDeleteBtn: {
        background: 'rgba(239,68,68,0.15)',
        border: '2px solid rgba(239,68,68,0.3)',
        borderRadius: 4,
        padding: '2px 6px',
        fontSize: 14,
        cursor: 'pointer',
        color: '#ef4444',
        lineHeight: 1,
    },

    // Actions
    activeActions: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
    },
    completeBtn: {
        background: 'rgba(35, 116, 225, 0.15)',
        color: '#92cfff',
        border: '2px solid rgba(35, 116, 225, 0.3)',
        borderRadius: 8,
        padding: '10px 18px',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
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
    cancelEditBtn: {
        background: 'transparent',
        color: '#94a3b8',
        border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 8,
        padding: '10px 18px',
        fontSize: 14,
        cursor: 'pointer',
    },
    deleteX: {
        position: 'absolute',
        top: 10,
        right: 10,
        width: 28,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255,255,255,0.15)',
        border: '2px solid rgba(255,255,255,0.1)',
        borderRadius: 6,
        color: '#a1b4c7',
        fontSize: 14,
        cursor: 'pointer',
    },
    deleteOverlay: {
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    deletePopup: {
        textAlign: 'center',
        padding: 24,
    },
    deletePopupText: {
        fontSize: 16,
        fontWeight: 600,
        color: '#fff',
        margin: '0 0 6px',
    },
    deletePopupSub: {
        fontSize: 14,
        color: '#94a3b8',
        margin: '0 0 20px',
    },
    deleteConfirmBtn: {
        background: '#ef4444',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        padding: '10px 20px',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    deleteCancelBtn: {
        background: 'transparent',
        color: '#94a3b8',
        border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 8,
        padding: '10px 20px',
        fontSize: 14,
        cursor: 'pointer',
    },
    confirmRow: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
    },
    inlineError: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 10,
        fontSize: 14,
        color: '#fca5a5',
        marginBottom: 16,
    },
    retryBtn: {
        background: 'transparent',
        color: '#edf6ff',
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 8,
        padding: '6px 14px',
        marginLeft: 10,
        fontSize: 14,
        cursor: 'pointer',
    },
    confirmText: {
        fontSize: 14,
        color: '#94a3b8',
    },
    confirmYes: {
        background: '#2374e1',
        color: '#fff',
        border: 'none',
        borderRadius: 6,
        padding: '6px 14px',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    confirmNo: {
        background: 'transparent',
        color: '#94a3b8',
        border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 6,
        padding: '6px 14px',
        fontSize: 14,
        cursor: 'pointer',
    },

    // Create Series
    createBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: GRADIENTS.cyanAction,
        border: '2px dashed rgba(35, 116, 225, 0.3)',
        borderRadius: 12,
        padding: '20px 24px',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
    },
    createTitle: {
        fontSize: 16,
        fontWeight: 600,
        color: '#fff',
    },
    createSub: {
        fontSize: 14,
        color: '#94a3b8',
        marginTop: 2,
    },

    // Form
    createForm: {
        background: 'rgba(35, 116, 225, 0.08)',
        border: '2px solid rgba(35, 116, 225, 0.2)',
        borderRadius: 12,
        padding: 20,
        overflow: 'hidden',
    },
    formTitle: {
        fontSize: 18,
        fontWeight: 600,
        color: '#fff',
        margin: '0 0 16px',
    },
    formLabel: {
        display: 'block',
        fontSize: 14,
        fontWeight: 600,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 6,
        marginTop: 12,
    },
    formInput: {
        width: '100%',
        background: 'rgba(0,0,0,0.2)',
        border: '2px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        padding: '10px 12px',
        color: '#fff',
        fontSize: 14,
        outline: 'none',
        boxSizing: 'border-box',
    },
    formActions: {
        display: 'flex',
        gap: 10,
        marginTop: 20,
    },
    formSubmitBtn: {
        background: GRADIENTS.cyanAction,
        color: '#edf6ff',
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 8,
        padding: '10px 24px',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    formCancelBtn: {
        background: 'transparent',
        color: '#94a3b8',
        border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 8,
        padding: '10px 24px',
        fontSize: 14,
        cursor: 'pointer',
    },

    // History
    historySection: {
        marginTop: 8,
    },
    historyTitle: {
        fontSize: 16,
        fontWeight: 600,
        color: '#fff',
        margin: '0 0 14px',
    },
    loadingPlaceholder: {
        color: '#9aaec3',
        fontSize: 14,
        textAlign: 'center',
        padding: 32,
    },
    emptyState: {
        color: '#9aaec3',
        fontSize: 14,
        textAlign: 'center',
        padding: 32,
        background: 'rgba(0,0,0,0.1)',
        borderRadius: 8,
    },

    // Completed Series Cards
    seriesGrid: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
    },
    seriesCard: {
        width: '100%',
        textAlign: 'left',
        background: GRADIENTS.darkPanel,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 10,
        padding: 16,
        cursor: 'pointer',
        transition: 'border-color 0.2s',
    },
    seriesCardHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        marginBottom: 6,
    },
    seriesCardName: {
        fontSize: 15,
        fontWeight: 600,
        color: '#fff',
        margin: 0,
        minWidth: 0,
        overflowWrap: 'anywhere',
    },
    seriesCardPL: {
        fontSize: 16,
        fontWeight: 700,
    },
    seriesCardMeta: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        fontSize: 14,
        color: '#94a3b8',
        marginBottom: 8,
    },
    seriesCardFooter: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 14,
        color: '#9aaec3',
    },
    viewReportLink: {
        color: '#92cfff',
        fontWeight: 500,
    },
};

export default memo(SeriesTracker);
