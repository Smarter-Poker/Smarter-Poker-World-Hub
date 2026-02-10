/**
 * SERIES TRACKER COMPONENT
 * ---------------------------------------------------------------
 * Full series management: create, track active, complete, view history
 * Mirrors Trip Tracker structure for multi-day tournament series
 * ---------------------------------------------------------------
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    getActiveSeries,
    fetchSeries,
    createSeries,
    updateSeries,
    completeSeries,
    deleteSeries,
    getSeriesReport,
} from '../../lib/bankroll/bankrollSelectors';
import { getUserLocations } from '../../lib/bankroll/locationMemory';
import { formatCurrency } from '../../lib/bankroll/currencyUtils';
import toast from '../../stores/toastStore';
import TripReport from './TripReport';

const CATEGORY_LABELS = {
    poker_cash: 'Cash Games',
    poker_mtt: 'Tournaments',
    casino_table: 'Casino',
    slots: 'Slots',
    sports: 'Sports Betting',
    expense: 'Expenses',
};

export default function SeriesTracker({ userId, onOpenLog }) {
    const [activeSeries, setActiveSeries] = useState(null);
    const [completedSeries, setCompletedSeries] = useState([]);
    const [locations, setLocations] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [selectedSeriesReport, setSelectedSeriesReport] = useState(null);
    const [confirmComplete, setConfirmComplete] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', location_id: null, purpose: '', notes: '', end_date: '' });

    const [newSeries, setNewSeries] = useState({
        name: '',
        location_id: null,
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        purpose: '',
        notes: '',
    });
    const [showSeriesSuggestions, setShowSeriesSuggestions] = useState(false);
    const [dbSeriesNames, setDbSeriesNames] = useState([]);

    const loadData = useCallback(async () => {
        if (!userId) return;
        setIsLoading(true);
        try {
            const [active, all, locs] = await Promise.all([
                getActiveSeries(userId),
                fetchSeries(userId),
                getUserLocations(userId),
            ]);
            setActiveSeries(active);
            setCompletedSeries(all.filter(s => s.status === 'completed'));
            setLocations(locs || []);

            // Fetch tournament series from Poker Near Me database
            try {
                const seriesRes = await fetch('/api/poker/series?limit=200');
                const seriesData = await seriesRes.json();
                if (seriesData.success && seriesData.data) {
                    // Extract unique tour names (e.g. WSOP, WPT, MSPT) — not venue-specific stops
                    const tourSet = new Set();
                    seriesData.data.forEach(s => {
                        // Use short_name as the tour brand (e.g. "MSPT", "WSOP", "WPT")
                        if (s.short_name) tourSet.add(s.short_name);
                        // Also add the full name for major unique series (e.g. "Venetian DeepStack Championship")
                        if (s.series_type === 'major' && s.name) tourSet.add(s.name);
                    });
                    setDbSeriesNames([...tourSet].sort());
                }
            } catch (seriesErr) {
                console.warn('Could not load tournament series for suggestions:', seriesErr);
            }
        } catch (err) {
            console.error('Error loading series data:', err);
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

    useEffect(() => { loadData(); }, [loadData]);

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

            await createSeries(userId, { ...newSeries, location_id: locationId });
            toast.success('Series started!');
            setShowCreateForm(false);
            setNewSeries({ name: '', location_id: null, start_date: new Date().toISOString().split('T')[0], end_date: '', purpose: '', notes: '' });
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
            toast.error('Failed to load series report');
        }
    };

    if (selectedSeriesReport) {
        return (
            <TripReport
                report={selectedSeriesReport}
                onBack={() => setSelectedSeriesReport(null)}
            />
        );
    }

    const daysSinceStart = activeSeries
        ? Math.max(1, Math.ceil((Date.now() - new Date(activeSeries.start_date).getTime()) / (1000 * 60 * 60 * 24)))
        : 0;

    return (
        <div style={styles.container}>
            {/* --- ACTIVE SERIES BANNER --- */}
            {activeSeries && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={styles.activeCard}
                >
                    {/* Delete X */}
                    <button
                        onClick={() => setConfirmDelete(true)}
                        style={styles.deleteX}
                        title="Delete series"
                    >&#x2715;</button>

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
                                Started {new Date(activeSeries.start_date + 'T12:00:00').toLocaleDateString()} · Day {daysSinceStart}
                                {activeSeries.end_date && ` · Ends ${new Date(activeSeries.end_date + 'T12:00:00').toLocaleDateString()}`}
                            </p>
                        </>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '8px 0 12px' }}>
                            <input
                                type="text"
                                value={editForm.name}
                                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                placeholder=""
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
                                placeholder=""
                                style={styles.formInput}
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, display: 'block' }}>End Date</label>
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
                                placeholder=""
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
                                    {formatCurrency(activeSeries.totalNet || 0)}
                                </span>
                            </div>
                            <div style={styles.runningStat}>
                                <span style={styles.runningStatLabel}>Sessions</span>
                                <span style={styles.runningStatValue}>{activeSeries.entryCount || 0}</span>
                            </div>
                            <div style={styles.runningStat}>
                                <span style={styles.runningStatLabel}>Expenses</span>
                                <span style={{ ...styles.runningStatValue, color: '#ef4444' }}>
                                    {formatCurrency(activeSeries.totalExpenses || 0)}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Category Breakdown */}
                    {!editMode && activeSeries.categoryBreakdown && Object.keys(activeSeries.categoryBreakdown).length > 0 && (
                        <div style={styles.breakdownRow}>
                            {Object.entries(activeSeries.categoryBreakdown).map(([cat, data]) => (
                                <span key={cat} style={styles.breakdownTag}>
                                    {CATEGORY_LABELS[cat] || cat}: {formatCurrency(data.net)}
                                </span>
                            ))}
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
                                <button onClick={() => setConfirmComplete(true)} style={styles.completeBtn}>
                                    Complete Series
                                </button>
                            </>
                        ) : (
                            <div style={styles.confirmRow}>
                                <span style={styles.confirmText}>Finalize this series?</span>
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
                                    <p style={styles.deletePopupText}>Are you sure you want to delete this series?</p>
                                    <p style={styles.deletePopupSub}>All entries will be unlinked from this series.</p>
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
                <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => setShowCreateForm(true)}
                    style={styles.createBtn}
                >
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>No active series</span>
                    <div>
                        <div style={styles.createTitle}>Start a New Series</div>
                        <div style={styles.createSub}>Track multi-day tournament series, WSOP runs, and events</div>
                    </div>
                </motion.button>
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
                                placeholder="Type series or tour name..."
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
                                        background: '#242526', border: '1px solid rgba(255,255,255,0.15)',
                                        borderRadius: 8, maxHeight: 200, overflowY: 'auto', zIndex: 50,
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                                    }}>
                                        {pastNames.length > 0 && filtered.some(n => pastNames.includes(n)) && (
                                            <div style={{ padding: '6px 14px', fontSize: 10, color: '#666', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Your Series</div>
                                        )}
                                        {filtered.filter(n => pastNames.includes(n)).map((name, i) => (
                                            <button key={`p-${i}`} type="button"
                                                onMouseDown={e => { e.preventDefault(); setNewSeries({ ...newSeries, name }); setShowSeriesSuggestions(false); }}
                                                style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#22c55e', fontSize: 13, textAlign: 'left', cursor: 'pointer' }}
                                            >{name}</button>
                                        ))}
                                        {dbSeriesNames.length > 0 && filtered.some(n => dbSeriesNames.includes(n) && !pastNames.includes(n)) && (
                                            <div style={{ padding: '6px 14px', fontSize: 10, color: '#666', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Tournament Tours</div>
                                        )}
                                        {filtered.filter(n => !pastNames.includes(n)).map((name, i) => (
                                            <button key={`d-${i}`} type="button"
                                                onMouseDown={e => { e.preventDefault(); setNewSeries({ ...newSeries, name }); setShowSeriesSuggestions(false); }}
                                                style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#e4e6eb', fontSize: 13, textAlign: 'left', cursor: 'pointer' }}
                                            >{name}</button>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>

                        <label style={styles.formLabel}>Location</label>
                        {newSeries.location_id !== '__new__' ? (
                            <select
                                value={newSeries.location_id || ''}
                                onChange={e => {
                                    if (e.target.value === '__new__') {
                                        setNewSeries({ ...newSeries, location_id: '__new__', location_name: '' });
                                    } else {
                                        const loc = locations.find(l => l.id === e.target.value);
                                        setNewSeries({ ...newSeries, location_id: e.target.value || null, location_name: loc?.name || '' });
                                    }
                                }}
                                style={styles.formInput}
                            >
                                <option value="">-- Select Location --</option>
                                {locations.map(loc => (
                                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                                ))}
                                <option value="__new__">+ New Location</option>
                            </select>
                        ) : (
                            <div style={{ display: 'flex', gap: 6 }}>
                                <input
                                    type="text"
                                    value={newSeries.location_name || ''}
                                    onChange={e => setNewSeries({ ...newSeries, location_name: e.target.value })}
                                    placeholder=""
                                    style={{ ...styles.formInput, flex: 1 }}
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    onClick={() => setNewSeries({ ...newSeries, location_id: null, location_name: '' })}
                                    style={{ ...styles.formInput, flex: 'none', width: 40, cursor: 'pointer', textAlign: 'center', padding: 0 }}
                                >&#x21A9;</button>
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={styles.formLabel}>Start Date</label>
                                <input
                                    type="date"
                                    value={newSeries.start_date}
                                    onChange={e => setNewSeries({ ...newSeries, start_date: e.target.value })}
                                    style={styles.formInput}
                                />
                            </div>
                            <div>
                                <label style={styles.formLabel}>End Date</label>
                                <input
                                    type="date"
                                    value={newSeries.end_date}
                                    onChange={e => setNewSeries({ ...newSeries, end_date: e.target.value })}
                                    style={styles.formInput}
                                />
                            </div>
                        </div>

                        <label style={styles.formLabel}>Purpose</label>
                        <input
                            type="text"
                            value={newSeries.purpose}
                            onChange={e => setNewSeries({ ...newSeries, purpose: e.target.value })}
                            placeholder=""
                            style={styles.formInput}
                        />

                        <label style={styles.formLabel}>Notes</label>
                        <textarea
                            value={newSeries.notes}
                            onChange={e => setNewSeries({ ...newSeries, notes: e.target.value })}
                            placeholder=""
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
                    <div style={styles.loadingPlaceholder}>Loading series...</div>
                ) : completedSeries.length === 0 ? (
                    <div style={styles.emptyState}>No completed series yet. Start your first series above!</div>
                ) : (
                    <div style={styles.seriesGrid}>
                        {completedSeries.map(series => (
                            <motion.div
                                key={series.id}
                                whileHover={{ scale: 1.02 }}
                                onClick={() => handleViewReport(series.id)}
                                style={styles.seriesCard}
                            >
                                <div style={styles.seriesCardHeader}>
                                    <h4 style={styles.seriesCardName}>{series.name}</h4>
                                    <span style={{
                                        ...styles.seriesCardPL,
                                        color: (series.totalNet || 0) >= 0 ? '#10b981' : '#ef4444',
                                    }}>
                                        {formatCurrency(series.totalNet || 0)}
                                    </span>
                                </div>
                                <div style={styles.seriesCardMeta}>
                                    {series.location_name && <span>{series.location_name}</span>}
                                    <span>{new Date(series.start_date + 'T12:00:00').toLocaleDateString()}</span>
                                    {series.end_date && (
                                        <span> -- {new Date(series.end_date + 'T12:00:00').toLocaleDateString()}</span>
                                    )}
                                </div>
                                <div style={styles.seriesCardFooter}>
                                    <span>{series.entryCount || 0} entries</span>
                                    <span style={styles.viewReportLink}>View Report --&gt;</span>
                                </div>
                            </motion.div>
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
        background: 'linear-gradient(135deg, rgba(35, 116, 225, 0.1) 0%, rgba(59, 130, 246, 0.08) 100%)',
        border: '1px solid rgba(35, 116, 225, 0.3)',
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
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1.5,
        color: '#2374e1',
        textTransform: 'uppercase',
    },
    activeName: {
        fontSize: 22,
        fontWeight: 700,
        color: '#fff',
        margin: '4px 0',
    },
    activeMeta: {
        fontSize: 13,
        color: '#94a3b8',
        margin: '0 0 16px',
    },

    // Running stats
    runningStats: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
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
        fontSize: 11,
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
        fontSize: 11,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 4,
        padding: '3px 8px',
        color: '#94a3b8',
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
        color: '#2374e1',
        border: '1px solid rgba(35, 116, 225, 0.3)',
        borderRadius: 8,
        padding: '10px 18px',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
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
    cancelEditBtn: {
        background: 'transparent',
        color: '#94a3b8',
        border: '1px solid rgba(255,255,255,0.15)',
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
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 6,
        color: '#666',
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
        fontSize: 12,
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
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 8,
        padding: '10px 20px',
        fontSize: 14,
        cursor: 'pointer',
    },
    confirmRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    confirmText: {
        fontSize: 13,
        color: '#94a3b8',
    },
    confirmYes: {
        background: '#2374e1',
        color: '#fff',
        border: 'none',
        borderRadius: 6,
        padding: '6px 14px',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
    },
    confirmNo: {
        background: 'transparent',
        color: '#94a3b8',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 6,
        padding: '6px 14px',
        fontSize: 13,
        cursor: 'pointer',
    },

    // Create Series
    createBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: 'rgba(35, 116, 225, 0.08)',
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
        fontSize: 13,
        color: '#94a3b8',
        marginTop: 2,
    },

    // Form
    createForm: {
        background: 'rgba(35, 116, 225, 0.08)',
        border: '1px solid rgba(35, 116, 225, 0.2)',
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
        fontSize: 12,
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
        border: '1px solid rgba(255,255,255,0.1)',
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
        background: '#2374e1',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        padding: '10px 24px',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    formCancelBtn: {
        background: 'transparent',
        color: '#94a3b8',
        border: '1px solid rgba(255,255,255,0.15)',
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
        color: '#64748b',
        fontSize: 14,
        textAlign: 'center',
        padding: 32,
    },
    emptyState: {
        color: '#64748b',
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
        background: 'rgba(35, 116, 225, 0.08)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding: 16,
        cursor: 'pointer',
        transition: 'border-color 0.2s',
    },
    seriesCardHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    seriesCardName: {
        fontSize: 15,
        fontWeight: 600,
        color: '#fff',
        margin: 0,
    },
    seriesCardPL: {
        fontSize: 16,
        fontWeight: 700,
    },
    seriesCardMeta: {
        display: 'flex',
        gap: 8,
        fontSize: 12,
        color: '#94a3b8',
        marginBottom: 8,
    },
    seriesCardFooter: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 12,
        color: '#64748b',
    },
    viewReportLink: {
        color: '#2374e1',
        fontWeight: 500,
    },
};
