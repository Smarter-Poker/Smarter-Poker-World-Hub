/**
 * TRIP TRACKER COMPONENT
 * ═══════════════════════════════════════════════════════════════
 * Full trip management: create, track active, complete, view history
 * ═══════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    getActiveTrip,
    fetchTrips,
    createTrip,
    updateTrip,
    completeTrip,
    deleteTrip,
    getTripReport,
    fetchLedgerEntries,
} from '../../lib/bankroll/bankrollSelectors';
import { getUserLocations } from '../../lib/bankroll/locationMemory';
import { formatCurrency } from '../../lib/bankroll/currencyUtils';
import toast from '../../stores/toastStore';
import TripReport from './TripReport';
import VenueSelector from './VenueSelector';

const CATEGORY_LABELS = {
    poker_cash: 'Cash Games',
    poker_mtt: 'Tournaments',
    casino_table: 'Casino',
    slots: 'Slots',
    sports: 'Sports Betting',
    expense: 'Expenses',
};

export default function TripTracker({ userId, onOpenLog, onEditEntry, onDeleteEntry, refreshTrigger }) {
    const [activeTrip, setActiveTrip] = useState(null);
    const [completedTrips, setCompletedTrips] = useState([]);
    const [tripEntries, setTripEntries] = useState([]);
    const [locations, setLocations] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [selectedTripReport, setSelectedTripReport] = useState(null);
    const [confirmComplete, setConfirmComplete] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', location_id: null, purpose: '', notes: '' });

    // Create trip form state
    const [newTrip, setNewTrip] = useState({
        name: '',
        location_id: null,
        location_name: '',
        venue_type: 'casino',
        poker_venue_id: null,
        latitude: null,
        longitude: null,
        start_date: new Date().toISOString().split('T')[0],
        purpose: '',
        notes: '',
    });

    const loadData = useCallback(async () => {
        if (!userId) return;
        setIsLoading(true);
        try {
            const [active, trips, locs] = await Promise.all([
                getActiveTrip(userId),
                fetchTrips(userId),
                getUserLocations(userId),
            ]);
            setActiveTrip(active);
            setCompletedTrips(trips.filter(t => t.status === 'completed'));
            setLocations(locs || []);

            // Fetch individual entries for active trip
            if (active && active.id) {
                try {
                    const entries = await fetchLedgerEntries(userId, { tripId: active.id, includeExpenses: true, limit: 100 });
                    setTripEntries(entries || []);
                } catch (entryErr) {
                    console.warn('Could not load trip entries:', entryErr);
                    setTripEntries([]);
                }
            } else {
                setTripEntries([]);
            }
        } catch (err) {
            console.error('Error loading trip data:', err);
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

    useEffect(() => { loadData(); }, [loadData, refreshTrigger]);



    const handleCreateTrip = async (e) => {
        e.preventDefault();
        if (!newTrip.name.trim()) {
            toast.error('Please enter a trip name');
            return;
        }
        try {
            // Handle new location creation with coordinates
            let locationId = newTrip.location_id;
            if (locationId === '__new__' && newTrip.location_name?.trim()) {
                const { getOrCreateLocation } = await import('../../lib/bankroll/locationMemory');
                locationId = await getOrCreateLocation(
                    userId,
                    newTrip.location_name.trim(),
                    newTrip.venue_type || 'casino',
                    newTrip.latitude,
                    newTrip.longitude,
                    newTrip.poker_venue_id
                );
            } else if (locationId === '__new__') {
                locationId = null;
            }

            await createTrip(userId, { ...newTrip, location_id: locationId });
            toast.success('Trip started!');
            setShowCreateForm(false);
            setNewTrip({ name: '', location_id: null, location_name: '', venue_type: 'casino', poker_venue_id: null, latitude: null, longitude: null, start_date: new Date().toISOString().split('T')[0], purpose: '', notes: '' });
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to create trip');
        }
    };

    const handleCompleteTrip = async () => {
        if (!activeTrip) return;
        try {
            await completeTrip(userId, activeTrip.id);
            toast.success('Trip completed!');
            setConfirmComplete(false);
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to complete trip');
        }
    };

    const handleDeleteTrip = async () => {
        if (!activeTrip) return;
        try {
            await deleteTrip(userId, activeTrip.id);
            toast.success('Trip deleted');
            setConfirmDelete(false);
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to delete trip');
        }
    };

    const startEditing = () => {
        if (!activeTrip) return;
        setEditForm({
            name: activeTrip.name || '',
            location_id: activeTrip.location_id || null,
            purpose: activeTrip.purpose || '',
            notes: activeTrip.notes || '',
        });
        setEditMode(true);
    };

    const handleSaveEdit = async () => {
        if (!activeTrip) return;
        if (!editForm.name.trim()) {
            toast.error('Trip name is required');
            return;
        }
        try {
            await updateTrip(userId, activeTrip.id, editForm);
            toast.success('Trip updated!');
            setEditMode(false);
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to update trip');
        }
    };

    const handleViewReport = async (tripId) => {
        try {
            const report = await getTripReport(userId, tripId);
            setSelectedTripReport(report);
        } catch (err) {
            toast.error('Failed to load trip report');
        }
    };

    if (selectedTripReport) {
        return (
            <TripReport
                report={selectedTripReport}
                onBack={() => setSelectedTripReport(null)}
            />
        );
    }

    const daysSinceStart = activeTrip
        ? Math.max(1, Math.ceil((Date.now() - new Date(activeTrip.start_date).getTime()) / (1000 * 60 * 60 * 24)))
        : 0;

    return (
        <div style={styles.container}>
            {/* --- ACTIVE TRIP BANNER --- */}
            {activeTrip && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={styles.activeTripCard}
                >
                    {/* Delete X — upper right corner */}
                    <button
                        onClick={() => setConfirmDelete(true)}
                        style={styles.deleteX}
                        title="Delete Trip"
                    >✕</button>

                    <div style={styles.activeTripHeader}>
                        <div style={styles.activeLed} />
                        <span style={styles.activeLabel}>LIVE TRIP</span>
                    </div>

                    {/* Trip Info (view vs edit) */}
                    {!editMode ? (
                        <>
                            <h2 style={styles.activeTripName}>{activeTrip.name}</h2>
                            <p style={styles.activeTripMeta}>
                                {activeTrip.location_name && `${activeTrip.location_name} · `}
                                Started {new Date(activeTrip.start_date + 'T12:00:00').toLocaleDateString()} · Day {daysSinceStart}
                            </p>
                        </>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '8px 0 12px' }}>
                            <input
                                type="text"
                                value={editForm.name}
                                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                placeholder="Trip Name"
                                style={styles.formInput}
                                autoFocus
                            />
                            <select
                                value={editForm.location_id || ''}
                                onChange={e => setEditForm({ ...editForm, location_id: e.target.value || null })}
                                style={styles.formInput}
                            >
                                <option value="">— Select Location —</option>
                                {locations.map(loc => (
                                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                                ))}
                            </select>
                            <input
                                type="text"
                                value={editForm.purpose}
                                onChange={e => setEditForm({ ...editForm, purpose: e.target.value })}
                                placeholder="Purpose (e.g. WSOP Series)"
                                style={styles.formInput}
                            />
                            <textarea
                                value={editForm.notes}
                                onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                                placeholder="Notes"
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
                                    color: (activeTrip.totalNet || 0) >= 0 ? '#10b981' : '#ef4444',
                                }}>
                                    {formatCurrency(activeTrip.totalNet || 0)}
                                </span>
                            </div>
                            <div style={styles.runningStat}>
                                <span style={styles.runningStatLabel}>Sessions</span>
                                <span style={styles.runningStatValue}>{activeTrip.entryCount || 0}</span>
                            </div>
                            <div style={styles.runningStat}>
                                <span style={styles.runningStatLabel}>Expenses</span>
                                <span style={{ ...styles.runningStatValue, color: '#ef4444' }}>
                                    {formatCurrency(activeTrip.totalExpenses || 0)}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Category Breakdown */}
                    {!editMode && activeTrip.categoryBreakdown && Object.keys(activeTrip.categoryBreakdown).length > 0 && (
                        <div style={styles.breakdownRow}>
                            {Object.entries(activeTrip.categoryBreakdown).map(([cat, data]) => (
                                <span key={cat} style={styles.breakdownTag}>
                                    {CATEGORY_LABELS[cat] || cat}: {formatCurrency(data.net)}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* --- TRIP ENTRIES LIST --- */}
                    {!editMode && tripEntries.length > 0 && (
                        <div style={styles.entriesSection}>
                            <h4 style={styles.entriesSectionTitle}>Trip Entries ({tripEntries.length})</h4>
                            <div style={styles.entriesScroll}>
                                {tripEntries.map(entry => {
                                    const net = (entry.gross_out || 0) - (entry.gross_in || 0);
                                    const catLabel = CATEGORY_LABELS[entry.category] || entry.category || 'Entry';
                                    return (
                                        <div key={entry.id} style={styles.entryRow}>
                                            <div style={styles.entryInfo}>
                                                <span style={styles.entryDate}>
                                                    {entry.entry_date ? new Date(entry.entry_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                                                </span>
                                                <span style={styles.entryCat}>{catLabel}</span>
                                                {entry.stakes && <span style={styles.entryStakes}>{entry.stakes}</span>}
                                            </div>
                                            <div style={styles.entryRight}>
                                                <span style={{ ...styles.entryNet, color: net >= 0 ? '#10b981' : '#ef4444' }}>
                                                    {net >= 0 ? '+' : ''}{formatCurrency(net)}
                                                </span>
                                                <div style={styles.entryActions}>
                                                    {onEditEntry && (
                                                        <button
                                                            onClick={() => onEditEntry(entry)}
                                                            style={styles.entryEditBtn}
                                                            title="Edit Entry"
                                                        >✏</button>
                                                    )}
                                                    {onDeleteEntry && (
                                                        <button
                                                            onClick={async () => {
                                                                if (confirm('Delete this entry?')) {
                                                                    await onDeleteEntry(entry.id);
                                                                }
                                                            }}
                                                            style={styles.entryDeleteBtn}
                                                            title="Delete Entry"
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
                    <div style={styles.activeTripActions}>
                        {editMode ? (
                            <>
                                <button onClick={handleSaveEdit} style={styles.completeBtn}>Save Changes</button>
                                <button onClick={() => setEditMode(false)} style={styles.cancelEditBtn}>Cancel</button>
                            </>
                        ) : !confirmComplete ? (
                            <>
                                <button onClick={startEditing} style={styles.editBtn}>✏ Edit Trip</button>
                                {onOpenLog && (
                                    <button onClick={onOpenLog} style={styles.addEntryBtn}>＋ Add Entry</button>
                                )}
                                <button onClick={() => setConfirmComplete(true)} style={styles.completeBtn}>
                                    ✓ Complete Trip
                                </button>
                            </>
                        ) : (
                            <div style={styles.confirmRow}>
                                <span style={styles.confirmText}>Finalize This Trip?</span>
                                <button onClick={handleCompleteTrip} style={styles.confirmYes}>Yes, Complete</button>
                                <button onClick={() => setConfirmComplete(false)} style={styles.confirmNo}>Cancel</button>
                            </div>
                        )}
                    </div>

                    {/* Delete Confirmation Overlay */}
                    <AnimatePresence>
                        {confirmDelete && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                style={styles.deleteOverlay}
                            >
                                <div style={styles.deletePopup}>
                                    <p style={styles.deletePopupText}>Are You Sure You Want To Delete This Trip?</p>
                                    <p style={styles.deletePopupSub}>All Entries Will Be Unlinked From This Trip.</p>
                                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                                        <button onClick={handleDeleteTrip} style={styles.deleteConfirmBtn}>Yes, Delete</button>
                                        <button onClick={() => setConfirmDelete(false)} style={styles.deleteCancelBtn}>Cancel</button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}

            {/* --- CREATE TRIP --- */}
            {!activeTrip && !showCreateForm && (
                <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => setShowCreateForm(true)}
                    style={styles.createTripBtn}
                >
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>No Active Trip</span>
                    <div>
                        <div style={styles.createTripTitle}>Start A New Trip</div>
                        <div style={styles.createTripSub}>Track All Sessions And Expenses In One Place</div>
                    </div>
                </motion.button>
            )}

            <AnimatePresence>
                {showCreateForm && (
                    <motion.form
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        onSubmit={handleCreateTrip}
                        style={styles.createForm}
                    >
                        <h3 style={styles.formTitle}>New Trip</h3>

                        <label style={styles.formLabel}>Trip Name *</label>
                        <input
                            type="text"
                            value={newTrip.name}
                            onChange={e => setNewTrip({ ...newTrip, name: e.target.value })}
                            placeholder="e.g. Vegas Feb 2026"
                            style={styles.formInput}
                            autoFocus
                        />

                        <label style={styles.formLabel}>Location</label>
                        <VenueSelector
                            value={newTrip.location_name}
                            venueType={newTrip.venue_type}
                            userId={userId}
                            onChange={(name, venueType, pokerVenueId, lat, lng) => {
                                const match = locations.find(l => l.name.toLowerCase() === (name || '').toLowerCase());
                                setNewTrip(prev => ({
                                    ...prev,
                                    location_name: name,
                                    location_id: match ? match.id : (name ? '__new__' : null),
                                    venue_type: venueType,
                                    poker_venue_id: pokerVenueId,
                                    latitude: lat,
                                    longitude: lng,
                                }));
                            }}
                        />

                        <label style={styles.formLabel}>Start Date</label>
                        <input
                            type="date"
                            value={newTrip.start_date}
                            onChange={e => setNewTrip({ ...newTrip, start_date: e.target.value })}
                            style={styles.formInput}
                        />

                        <label style={styles.formLabel}>Purpose</label>
                        <input
                            type="text"
                            value={newTrip.purpose}
                            onChange={e => setNewTrip({ ...newTrip, purpose: e.target.value })}
                            placeholder="e.g. WSOP Series, Weekend Getaway"
                            style={styles.formInput}
                        />

                        <label style={styles.formLabel}>Notes</label>
                        <textarea
                            value={newTrip.notes}
                            onChange={e => setNewTrip({ ...newTrip, notes: e.target.value })}
                            placeholder="Any Notes..."
                            style={{ ...styles.formInput, minHeight: 60, resize: 'vertical' }}
                        />

                        <div style={styles.formActions}>
                            <button type="submit" style={styles.formSubmitBtn}>Start Trip</button>
                            <button type="button" onClick={() => setShowCreateForm(false)} style={styles.formCancelBtn}>Cancel</button>
                        </div>
                    </motion.form>
                )}
            </AnimatePresence>

            {/* --- COMPLETED TRIPS --- */}
            <div style={styles.historySection}>
                <h3 style={styles.historyTitle}>Completed Trips</h3>
                {isLoading ? (
                    <div style={styles.loadingPlaceholder}>Loading Trips...</div>
                ) : completedTrips.length === 0 ? (
                    <div style={styles.emptyState}>No Completed Trips Yet. Start Your First Trip Above!</div>
                ) : (
                    <div style={styles.tripGrid}>
                        {completedTrips.map(trip => (
                            <motion.div
                                key={trip.id}
                                whileHover={{ scale: 1.02 }}
                                onClick={() => handleViewReport(trip.id)}
                                style={styles.tripCard}
                            >
                                <div style={styles.tripCardHeader}>
                                    <h4 style={styles.tripCardName}>{trip.name}</h4>
                                    <span style={{
                                        ...styles.tripCardPL,
                                        color: (trip.totalNet || 0) >= 0 ? '#10b981' : '#ef4444',
                                    }}>
                                        {formatCurrency(trip.totalNet || 0)}
                                    </span>
                                </div>
                                <div style={styles.tripCardMeta}>
                                    {trip.location_name && <span>{trip.location_name}</span>}
                                    <span>{new Date(trip.start_date + 'T12:00:00').toLocaleDateString()}</span>
                                    {trip.end_date && (
                                        <span> — {new Date(trip.end_date + 'T12:00:00').toLocaleDateString()}</span>
                                    )}
                                </div>
                                <div style={styles.tripCardFooter}>
                                    <span>{trip.entryCount || 0} entries</span>
                                    <span style={styles.viewReportLink}>View Report →</span>
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

    // Active Trip
    activeTripCard: {
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(59, 130, 246, 0.08) 100%)',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        borderRadius: 12,
        padding: 20,
        position: 'relative',
    },
    activeTripHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    activeLed: {
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: '#10b981',
        boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)',
        animation: 'pulse 2s infinite',
    },
    activeLabel: {
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1.5,
        color: '#10b981',
        textTransform: 'uppercase',
    },
    activeTripName: {
        fontSize: 22,
        fontWeight: 700,
        color: '#fff',
        margin: '4px 0',
    },
    activeTripMeta: {
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

    // Entry list
    entriesSection: {
        marginBottom: 16,
    },
    entriesSectionTitle: {
        fontSize: 13,
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
        border: '1px solid rgba(255,255,255,0.05)',
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
        fontSize: 12,
        color: '#64748b',
        fontWeight: 500,
        whiteSpace: 'nowrap',
    },
    entryCat: {
        fontSize: 12,
        color: '#cbd5e1',
        fontWeight: 500,
    },
    entryStakes: {
        fontSize: 11,
        color: '#64748b',
        background: 'rgba(255,255,255,0.05)',
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
        fontSize: 13,
        fontWeight: 700,
        whiteSpace: 'nowrap',
    },
    entryActions: {
        display: 'flex',
        gap: 4,
    },
    entryEditBtn: {
        background: 'rgba(59,130,246,0.15)',
        border: '1px solid rgba(59,130,246,0.3)',
        borderRadius: 4,
        padding: '2px 6px',
        fontSize: 12,
        cursor: 'pointer',
        color: '#3b82f6',
        lineHeight: 1,
    },
    entryDeleteBtn: {
        background: 'rgba(239,68,68,0.15)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 4,
        padding: '2px 6px',
        fontSize: 12,
        cursor: 'pointer',
        color: '#ef4444',
        lineHeight: 1,
    },

    // Active trip actions
    activeTripActions: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
    },
    logEntryBtn: {
        background: '#3b82f6',
        color: '#fff',
        border: 'none',
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
        background: '#10b981',
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

    // Create Trip
    createTripBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: 'rgba(59, 130, 246, 0.08)',
        border: '2px dashed rgba(59, 130, 246, 0.3)',
        borderRadius: 12,
        padding: '20px 24px',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
    },
    createTripTitle: {
        fontSize: 16,
        fontWeight: 600,
        color: '#fff',
    },
    createTripSub: {
        fontSize: 13,
        color: '#94a3b8',
        marginTop: 2,
    },

    // Create Form
    createForm: {
        background: 'rgba(30, 58, 95, 0.3)',
        border: '1px solid rgba(59, 130, 246, 0.2)',
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
        background: '#3b82f6',
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

    // Trip Cards
    tripGrid: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
    },
    tripCard: {
        background: 'rgba(30, 58, 95, 0.3)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding: 16,
        cursor: 'pointer',
        transition: 'border-color 0.2s',
    },
    tripCardHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    tripCardName: {
        fontSize: 15,
        fontWeight: 600,
        color: '#fff',
        margin: 0,
    },
    tripCardPL: {
        fontSize: 16,
        fontWeight: 700,
    },
    tripCardMeta: {
        display: 'flex',
        gap: 8,
        fontSize: 12,
        color: '#94a3b8',
        marginBottom: 8,
    },
    tripCardFooter: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 12,
        color: '#64748b',
    },
    viewReportLink: {
        color: '#3b82f6',
        fontWeight: 500,
    },
};
