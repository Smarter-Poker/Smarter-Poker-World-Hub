/**
 * TOKE TRACKER COMPONENT
 * ═══════════════════════════════════════════════════════════════
 * Dealer income & expense tracking — gigs, downs, 35-min timer
 * Facebook Dark UI — matches TripTracker pattern
 * ═══════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    getActiveGig,
    fetchGigs,
    createGig,
    updateGig,
    completeGig,
    deleteGig,
    createDown,
    endDown,
    createDoubleDown,
    deleteDown,
    updateDownToke,
    getGigReport,
} from '../../lib/bankroll/tokeSelectors';
import { getUserLocations } from '../../lib/bankroll/locationMemory';
import VenueSelector from './VenueSelector';
import toast from '../../stores/toastStore';

// ── Down type metadata ──
const DOWN_TYPES = [
    { id: 'cash', label: 'Cash Game', color: '#3b82f6', icon: '♠' },
    { id: 'tournament', label: 'Tournament', color: '#f59e0b', icon: '🏆' },
    { id: 'break', label: 'On Break', color: '#8b5cf6', icon: '☕' },
    { id: 'brush', label: 'Brush', color: '#10b981', icon: '🧹' },
];

const DOWN_TYPE_LABELS = {
    cash: 'Cash Game',
    tournament: 'Tournament',
    break: 'On Break',
    brush: 'Brush',
};

const DOWN_TYPE_COLORS = {
    cash: '#3b82f6',
    tournament: '#f59e0b',
    break: '#8b5cf6',
    brush: '#10b981',
};

// 35 minutes in milliseconds
const DOWN_TIMER_MS = 35 * 60 * 1000;

export default function TokeTracker({ userId, refreshTrigger }) {
    const [activeGig, setActiveGig] = useState(null);
    const [completedGigs, setCompletedGigs] = useState([]);
    const [locations, setLocations] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [showAddDown, setShowAddDown] = useState(false);
    const [confirmComplete, setConfirmComplete] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [selectedReport, setSelectedReport] = useState(null);
    const [editForm, setEditForm] = useState({ venue_name: '', venue_address: '', hourly_rate: '', notes: '' });

    // Down form state
    const [downForm, setDownForm] = useState({
        down_type: 'cash',
        tournament_name: '',
        table_number: '',
        game_type: '',
    });

    // Toke edit state  
    const [editingTokeId, setEditingTokeId] = useState(null);
    const [tokeEditValue, setTokeEditValue] = useState('');

    // Timer for 35-min down reminder
    const downTimerRef = useRef(null);
    const [timerActive, setTimerActive] = useState(false);
    const [timerSecondsLeft, setTimerSecondsLeft] = useState(0);
    const timerTickRef = useRef(null);

    // Create event form state
    const [newGig, setNewGig] = useState({
        venue_name: '',
        venue_address: '',
        location_id: null,
        venue_type: 'casino',
        poker_venue_id: null,
        latitude: null,
        longitude: null,
        start_date: new Date().toISOString().split('T')[0],
        hourly_rate: '',
        notes: '',
    });

    // ── Load data ──
    const loadData = useCallback(async () => {
        if (!userId) return;
        setIsLoading(true);
        try {
            const [active, gigs, locs] = await Promise.all([
                getActiveGig(userId),
                fetchGigs(userId),
                getUserLocations(userId),
            ]);
            setActiveGig(active);
            setCompletedGigs(gigs.filter(g => g.status === 'completed'));
            setLocations(locs || []);

            // If there's an active down, restart the timer
            if (active?.downs?.length > 0) {
                const lastDown = active.downs[active.downs.length - 1];
                if (!lastDown.ended_at) {
                    const elapsed = Date.now() - new Date(lastDown.started_at).getTime();
                    const remaining = DOWN_TIMER_MS - elapsed;
                    if (remaining > 0) {
                        startDownTimer(remaining, lastDown);
                    }
                }
            }
        } catch (err) {
            console.error('Error loading toke data:', err);
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

    useEffect(() => { loadData(); }, [loadData, refreshTrigger]);

    // ── Cleanup timers on unmount ──
    useEffect(() => {
        return () => {
            if (downTimerRef.current) clearTimeout(downTimerRef.current);
            if (timerTickRef.current) clearInterval(timerTickRef.current);
        };
    }, []);

    // ── 35-min Down Timer ──
    const startDownTimer = useCallback((durationMs, lastDown) => {
        // Clear any existing timer
        if (downTimerRef.current) clearTimeout(downTimerRef.current);
        if (timerTickRef.current) clearInterval(timerTickRef.current);

        const endsAt = Date.now() + durationMs;
        setTimerActive(true);
        setTimerSecondsLeft(Math.ceil(durationMs / 1000));

        // Tick every second for countdown display
        timerTickRef.current = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
            setTimerSecondsLeft(remaining);
            if (remaining <= 0) {
                clearInterval(timerTickRef.current);
                timerTickRef.current = null;
            }
        }, 1000);

        // Fire notification after duration
        downTimerRef.current = setTimeout(() => {
            setTimerActive(false);
            fireDownNotification(lastDown);
        }, durationMs);
    }, []);

    const fireDownNotification = useCallback((lastDown) => {
        const downLabel = DOWN_TYPE_LABELS[lastDown.down_type] || 'dealing';
        let message = '';
        let title = '⏰ Down Timer';

        if (lastDown.down_type === 'break') {
            title = '☕ Break Check';
            message = 'Are you still on break?';
        } else if (lastDown.down_type === 'brush') {
            title = '🧹 Brush Check';
            message = 'Are you still brushing?';
        } else {
            const tableInfo = lastDown.table_number ? ` (Table ${lastDown.table_number})` : '';
            title = '♠ Down Check';
            message = `Still dealing the same table${tableInfo}?`;
        }

        // Browser Notification API
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification(title, {
                body: message + '\nTap to respond.',
                icon: '/icons/icon-192x192.png',
                tag: 'toke-down-timer',
                requireInteraction: true,
            });
            notification.onclick = () => {
                notification.close();
                window.focus();
                // Show the double-down prompt
                handleDoubleDownPrompt(lastDown);
            };
        } else {
            // Fallback: in-app toast
            handleDoubleDownPrompt(lastDown);
        }
    }, []);

    const [showDoubleDownPrompt, setShowDoubleDownPrompt] = useState(false);
    const [promptDown, setPromptDown] = useState(null);

    const handleDoubleDownPrompt = useCallback((lastDown) => {
        setPromptDown(lastDown);
        setShowDoubleDownPrompt(true);
    }, []);

    const handleDoubleDownYes = async () => {
        if (!promptDown || !activeGig) return;
        try {
            await createDoubleDown(userId, activeGig.id, promptDown);
            toast.success('Double down created!');
            setShowDoubleDownPrompt(false);
            setPromptDown(null);
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to create double down');
        }
    };

    const handleDoubleDownNo = () => {
        setShowDoubleDownPrompt(false);
        setPromptDown(null);
        setShowAddDown(true);
    };

    // ── Request notification permission ──
    const requestNotificationPermission = useCallback(async () => {
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    }, []);

    // ── GIG CRUD Handlers ──
    const handleCreateGig = async (e) => {
        e.preventDefault();
        if (!newGig.venue_name.trim()) {
            toast.error('Please select or enter a venue');
            return;
        }
        try {
            await createGig(userId, {
                ...newGig,
                hourly_rate: parseFloat(newGig.hourly_rate) || 0,
            });
            toast.success('Event started!');
            setShowCreateForm(false);
            setNewGig({ venue_name: '', venue_address: '', location_id: null, venue_type: 'casino', poker_venue_id: null, latitude: null, longitude: null, start_date: new Date().toISOString().split('T')[0], hourly_rate: '', notes: '' });
            await requestNotificationPermission();
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to create gig');
        }
    };

    const handleCompleteGig = async () => {
        if (!activeGig) return;
        try {
            await completeGig(userId, activeGig.id);
            toast.success('Event completed!');
            setConfirmComplete(false);
            if (downTimerRef.current) clearTimeout(downTimerRef.current);
            if (timerTickRef.current) clearInterval(timerTickRef.current);
            setTimerActive(false);
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to complete gig');
        }
    };

    const handleDeleteGig = async () => {
        if (!activeGig) return;
        try {
            await deleteGig(userId, activeGig.id);
            toast.success('Event deleted');
            setConfirmDelete(false);
            if (downTimerRef.current) clearTimeout(downTimerRef.current);
            if (timerTickRef.current) clearInterval(timerTickRef.current);
            setTimerActive(false);
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to delete gig');
        }
    };

    const startEditing = () => {
        if (!activeGig) return;
        setEditForm({
            venue_name: activeGig.venue_name || '',
            venue_address: activeGig.venue_address || '',
            hourly_rate: activeGig.hourly_rate || '',
            notes: activeGig.notes || '',
        });
        setEditMode(true);
    };

    const handleSaveEdit = async () => {
        if (!activeGig) return;
        if (!editForm.venue_name.trim()) {
            toast.error('Venue name is required');
            return;
        }
        try {
            await updateGig(userId, activeGig.id, {
                ...editForm,
                hourly_rate: parseFloat(editForm.hourly_rate) || 0,
            });
            toast.success('Event updated!');
            setEditMode(false);
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to update gig');
        }
    };

    // ── DOWN Handlers ──
    const handleAddDown = async () => {
        if (!activeGig) return;
        try {
            const down = await createDown(userId, activeGig.id, {
                down_type: downForm.down_type,
                tournament_name: downForm.down_type === 'tournament' ? downForm.tournament_name : null,
                table_number: downForm.table_number || null,
                game_type: downForm.game_type || null,
            });
            toast.success(`${DOWN_TYPE_LABELS[downForm.down_type]} down started!`);
            setShowAddDown(false);
            setDownForm({ down_type: 'cash', tournament_name: '', table_number: '', game_type: '' });

            // Start 35-min timer
            startDownTimer(DOWN_TIMER_MS, down);

            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to add down');
        }
    };

    const handleEndDown = async (downId) => {
        try {
            await endDown(downId);
            toast.success('Down ended');
            if (downTimerRef.current) clearTimeout(downTimerRef.current);
            if (timerTickRef.current) clearInterval(timerTickRef.current);
            setTimerActive(false);
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to end down');
        }
    };

    const handleDeleteDown = async (downId) => {
        try {
            await deleteDown(downId);
            toast.success('Down deleted');
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to delete down');
        }
    };

    const handleSaveToke = async (downId) => {
        try {
            await updateDownToke(downId, parseFloat(tokeEditValue) || 0);
            toast.success('Toke saved');
            setEditingTokeId(null);
            setTokeEditValue('');
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to save toke');
        }
    };

    // ── Report View ──
    const handleViewReport = async (gigId) => {
        try {
            const report = await getGigReport(userId, gigId);
            setSelectedReport(report);
        } catch (err) {
            toast.error('Failed to load event report');
        }
    };

    // ── Format helpers ──
    const formatDuration = (ms) => {
        const totalMinutes = Math.floor(ms / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    };

    const formatTimerDisplay = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const formatCurrency = (amount) => {
        return `$${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // ── Report Subview ──
    if (selectedReport) {
        const { gig, stats } = selectedReport;
        return (
            <div style={styles.container}>
                <button onClick={() => setSelectedReport(null)} style={styles.backBtn}>← Back To Events</button>
                <div style={styles.reportCard}>
                    <h2 style={styles.reportTitle}>{gig.venue_name}</h2>
                    {gig.venue_address && <p style={styles.reportAddress}>{gig.venue_address}</p>}
                    <p style={styles.reportDates}>
                        {new Date(gig.start_date + 'T12:00:00').toLocaleDateString()}
                        {gig.end_date && ` — ${new Date(gig.end_date + 'T12:00:00').toLocaleDateString()}`}
                        {' · '}{stats.durationDays} day{stats.durationDays !== 1 ? 's' : ''}
                    </p>

                    <div style={styles.reportStatsGrid}>
                        <div style={styles.reportStat}>
                            <span style={styles.reportStatLabel}>Total Earnings</span>
                            <span style={{ ...styles.reportStatValue, color: '#10b981' }}>{formatCurrency(stats.totalEarnings)}</span>
                        </div>
                        <div style={styles.reportStat}>
                            <span style={styles.reportStatLabel}>Total Tokes</span>
                            <span style={{ ...styles.reportStatValue, color: '#f59e0b' }}>{formatCurrency(stats.totalTokes)}</span>
                        </div>
                        <div style={styles.reportStat}>
                            <span style={styles.reportStatLabel}>Hourly Pay</span>
                            <span style={styles.reportStatValue}>{formatCurrency(stats.hourlyPay)}</span>
                        </div>
                        <div style={styles.reportStat}>
                            <span style={styles.reportStatLabel}>Hours Worked</span>
                            <span style={styles.reportStatValue}>{stats.totalHoursWorked.toFixed(1)}h</span>
                        </div>
                        <div style={styles.reportStat}>
                            <span style={styles.reportStatLabel}>Avg Toke/Down</span>
                            <span style={styles.reportStatValue}>{formatCurrency(stats.avgTokePerDown)}</span>
                        </div>
                        <div style={styles.reportStat}>
                            <span style={styles.reportStatLabel}>Per Day</span>
                            <span style={styles.reportStatValue}>{formatCurrency(stats.perDay)}</span>
                        </div>
                    </div>

                    <div style={styles.reportBreakdown}>
                        <h4 style={styles.reportBreakdownTitle}>Down Breakdown</h4>
                        <div style={styles.reportBreakdownGrid}>
                            <span style={styles.breakdownItem}>♠ Cash: {stats.cashDownCount}</span>
                            <span style={styles.breakdownItem}>🏆 Tournament: {stats.tournamentDownCount}</span>
                            <span style={styles.breakdownItem}>🧹 Brush: {stats.brushDownCount}</span>
                            <span style={styles.breakdownItem}>☕ Breaks: {stats.breakCount}</span>
                            <span style={styles.breakdownItem}>⏫ Double Downs: {stats.doubleDownCount}</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const daysSinceStart = activeGig
        ? Math.max(1, Math.ceil((Date.now() - new Date(activeGig.start_date).getTime()) / (1000 * 60 * 60 * 24)))
        : 0;

    const currentDown = activeGig?.downs?.length
        ? activeGig.downs[activeGig.downs.length - 1]
        : null;
    const isDownActive = currentDown && !currentDown.ended_at;

    return (
        <div style={styles.container}>
            {/* ── ACTIVE GIG BANNER ── */}
            {activeGig && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={styles.activeGigCard}
                >
                    {/* Delete X */}
                    <button onClick={() => setConfirmDelete(true)} style={styles.deleteX} title="Delete Event">✕</button>

                    <div style={styles.activeHeader}>
                        <div style={styles.activeLed} />
                        <span style={styles.activeLabel}>LIVE EVENT</span>
                    </div>

                    {/* Gig Info (view vs edit) */}
                    {!editMode ? (
                        <>
                            <h2 style={styles.activeGigName}>{activeGig.venue_name}</h2>
                            {activeGig.venue_address && (
                                <p style={styles.activeGigAddress}>{activeGig.venue_address}</p>
                            )}
                            <p style={styles.activeGigMeta}>
                                Started {new Date(activeGig.start_date + 'T12:00:00').toLocaleDateString()} · Day {daysSinceStart}
                                {activeGig.hourly_rate > 0 && ` · $${activeGig.hourly_rate}/hr`}
                            </p>
                        </>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '8px 0 12px' }}>
                            <label style={styles.formLabel}>Venue / Location</label>
                            <VenueSelector
                                value={editForm.venue_name}
                                venueType={editForm.venue_type || 'casino'}
                                userId={userId}
                                onChange={(name, venueType, pokerVenueId) => {
                                    const match = locations.find(l => l.name.toLowerCase() === (name || '').toLowerCase());
                                    setEditForm(prev => ({
                                        ...prev,
                                        venue_name: name,
                                        venue_address: match?.state || prev.venue_address,
                                    }));
                                }}
                            />
                            <input
                                type="number" value={editForm.hourly_rate}
                                onChange={e => setEditForm({ ...editForm, hourly_rate: e.target.value })}
                                style={styles.formInput} step="0.01"
                            />
                            <textarea
                                value={editForm.notes}
                                onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                                style={{ ...styles.formInput, minHeight: 60, resize: 'vertical' }}
                            />
                        </div>
                    )}

                    {/* Running Totals */}
                    {!editMode && (
                        <div style={styles.runningStats}>
                            <div style={styles.runningStat}>
                                <span style={styles.runningStatLabel}>Total Tokes</span>
                                <span style={{ ...styles.runningStatValue, color: '#f59e0b' }}>
                                    {formatCurrency(activeGig.totalTokes || 0)}
                                </span>
                            </div>
                            <div style={styles.runningStat}>
                                <span style={styles.runningStatLabel}>Downs</span>
                                <span style={styles.runningStatValue}>{activeGig.totalDowns || 0}</span>
                            </div>
                            <div style={styles.runningStat}>
                                <span style={styles.runningStatLabel}>Hours</span>
                                <span style={styles.runningStatValue}>
                                    {(activeGig.totalHoursWorked || 0).toFixed(1)}h
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Active Down Timer */}
                    {!editMode && timerActive && isDownActive && (
                        <div style={styles.timerBanner}>
                            <div style={styles.timerIcon}>⏱</div>
                            <div style={styles.timerInfo}>
                                <span style={styles.timerLabel}>
                                    {DOWN_TYPE_LABELS[currentDown.down_type]} Down
                                    {currentDown.table_number && ` · Table ${currentDown.table_number}`}
                                </span>
                                <span style={styles.timerCountdown}>
                                    {formatTimerDisplay(timerSecondsLeft)}
                                </span>
                            </div>
                            <button onClick={() => handleEndDown(currentDown.id)} style={styles.endDownBtn}>
                                End
                            </button>
                        </div>
                    )}

                    {/* Down List */}
                    {!editMode && activeGig.downs && activeGig.downs.length > 0 && (
                        <div style={styles.downsSection}>
                            <h4 style={styles.downsSectionTitle}>Downs ({activeGig.downs.length})</h4>
                            <div style={styles.downsScroll} data-scrollable>
                                {[...activeGig.downs].reverse().map(down => {
                                    const isOpen = !down.ended_at;
                                    const duration = isOpen
                                        ? Date.now() - new Date(down.started_at).getTime()
                                        : new Date(down.ended_at).getTime() - new Date(down.started_at).getTime();
                                    const typeColor = DOWN_TYPE_COLORS[down.down_type] || '#64748b';

                                    return (
                                        <div key={down.id} style={{
                                            ...styles.downRow,
                                            borderLeft: `3px solid ${typeColor}`,
                                        }}>
                                            <div style={styles.downInfo}>
                                                <span style={{ ...styles.downTypeBadge, background: `${typeColor}22`, color: typeColor, border: `1px solid ${typeColor}44` }}>
                                                    {DOWN_TYPE_LABELS[down.down_type]}
                                                    {down.is_double_down && ' ⏫'}
                                                </span>
                                                {down.tournament_name && <span style={styles.downDetail}>{down.tournament_name}</span>}
                                                {down.table_number && <span style={styles.downDetail}>T{down.table_number}</span>}
                                                <span style={styles.downTime}>
                                                    {new Date(down.started_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                                    {' · '}{formatDuration(duration)}
                                                </span>
                                            </div>
                                            <div style={styles.downRight}>
                                                {/* Toke amount (editable) */}
                                                {down.down_type !== 'break' && (
                                                    editingTokeId === down.id ? (
                                                        <div style={styles.tokeEditRow}>
                                                            <input
                                                                type="number" value={tokeEditValue}
                                                                onChange={e => setTokeEditValue(e.target.value)}
                                                                placeholder="$0" style={styles.tokeInput}
                                                                autoFocus step="0.01"
                                                            />
                                                            <button onClick={() => handleSaveToke(down.id)} style={styles.tokeSaveBtn}>✓</button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => { setEditingTokeId(down.id); setTokeEditValue(down.toke_amount || ''); }}
                                                            style={{ ...styles.tokeDisplay, color: (down.toke_amount || 0) > 0 ? '#f59e0b' : '#64748b' }}
                                                            title="Edit Toke"
                                                        >
                                                            {(down.toke_amount || 0) > 0 ? formatCurrency(down.toke_amount) : '+ Toke'}
                                                        </button>
                                                    )
                                                )}
                                                {isOpen && (
                                                    <button onClick={() => handleEndDown(down.id)} style={styles.endDownSmallBtn}>End</button>
                                                )}
                                                <button
                                                    onClick={() => { if (confirm('Delete this down?')) handleDeleteDown(down.id); }}
                                                    style={styles.downDeleteBtn}
                                                >✕</button>
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
                                <button onClick={startEditing} style={styles.editBtn}>✏ Edit</button>
                                <button onClick={() => setShowAddDown(true)} style={styles.addDownBtn}>＋ Add Down</button>
                                <button onClick={() => setConfirmComplete(true)} style={styles.completeBtn}>✓ Complete Event</button>
                            </>
                        ) : (
                            <div style={styles.confirmRow}>
                                <span style={styles.confirmText}>Finalize This Event?</span>
                                <button onClick={handleCompleteGig} style={styles.confirmYes}>Yes, Complete</button>
                                <button onClick={() => setConfirmComplete(false)} style={styles.confirmNo}>Cancel</button>
                            </div>
                        )}
                    </div>

                    {/* Delete Confirmation */}
                    <AnimatePresence>
                        {confirmDelete && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={styles.deleteOverlay}>
                                <div style={styles.deletePopup}>
                                    <p style={styles.deletePopupText}>Delete This Event And All Downs?</p>
                                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                                        <button onClick={handleDeleteGig} style={styles.deleteConfirmBtn}>Yes, Delete</button>
                                        <button onClick={() => setConfirmDelete(false)} style={styles.deleteCancelBtn}>Cancel</button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}

            {/* ── CREATE EVENT ── */}
            {!activeGig && !showCreateForm && (
                <motion.button
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    onClick={() => setShowCreateForm(true)}
                    style={styles.createGigBtn}
                >
                    <div>
                        <div style={styles.createGigTitle}>Start A New Event</div>
                        <div style={styles.createGigSub}>Track Downs, Tokes, And Income</div>
                    </div>
                </motion.button>
            )}

            <AnimatePresence>
                {showCreateForm && (
                    <motion.form
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        onSubmit={handleCreateGig}
                        style={styles.createForm}
                    >
                        <h3 style={styles.formTitle}>New Event</h3>

                        <label style={styles.formLabel}>Venue / Location</label>
                        <VenueSelector
                            value={newGig.venue_name}
                            venueType={newGig.venue_type}
                            userId={userId}
                            onChange={(name, venueType, pokerVenueId, lat, lng) => {
                                const match = locations.find(l => l.name.toLowerCase() === (name || '').toLowerCase());
                                setNewGig(prev => ({
                                    ...prev,
                                    venue_name: name,
                                    location_id: match ? match.id : (name ? '__new__' : null),
                                    venue_type: venueType,
                                    poker_venue_id: pokerVenueId,
                                    latitude: lat,
                                    longitude: lng,
                                    venue_address: match?.state || '',
                                }));
                            }}
                        />

                        <label style={styles.formLabel}>Start Date</label>
                        <input
                            type="date" value={newGig.start_date}
                            onChange={e => setNewGig({ ...newGig, start_date: e.target.value })}
                            style={styles.formInput}
                        />

                        <label style={styles.formLabel}>Hourly Pay Rate</label>
                        <input
                            type="number" value={newGig.hourly_rate}
                            onChange={e => setNewGig({ ...newGig, hourly_rate: e.target.value })}
                            placeholder="e.g. 15.00" step="0.01" style={styles.formInput}
                        />

                        <label style={styles.formLabel}>Notes</label>
                        <textarea
                            value={newGig.notes}
                            onChange={e => setNewGig({ ...newGig, notes: e.target.value })}
                            placeholder="Any notes..." style={{ ...styles.formInput, minHeight: 60, resize: 'vertical' }}
                        />

                        <div style={styles.formActions}>
                            <button type="submit" style={styles.formSubmitBtn}>Start Event</button>
                            <button type="button" onClick={() => setShowCreateForm(false)} style={styles.formCancelBtn}>Cancel</button>
                        </div>
                    </motion.form>
                )}
            </AnimatePresence>

            {/* ── ADD DOWN MODAL ── */}
            <AnimatePresence>
                {showAddDown && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={styles.modalOverlay}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                            style={styles.modalCard}
                        >
                            <h3 style={styles.modalTitle}>Add Down</h3>

                            {/* Down Type Selector */}
                            <div style={styles.downTypeGrid}>
                                {DOWN_TYPES.map(dt => (
                                    <button
                                        key={dt.id}
                                        onClick={() => setDownForm({ ...downForm, down_type: dt.id })}
                                        style={{
                                            ...styles.downTypeBtn,
                                            background: downForm.down_type === dt.id ? `${dt.color}22` : 'rgba(255,255,255,0.05)',
                                            border: `2px solid ${downForm.down_type === dt.id ? dt.color : 'rgba(255,255,255,0.1)'}`,
                                            color: downForm.down_type === dt.id ? dt.color : '#8A8D91',
                                        }}
                                    >
                                        <span style={{ fontSize: 20 }}>{dt.icon}</span>
                                        <span style={{ fontSize: 12, fontWeight: 600 }}>{dt.label}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Tournament Name (only for tournament) */}
                            {downForm.down_type === 'tournament' && (
                                <>
                                    <label style={styles.formLabel}>Tournament Name</label>
                                    <input
                                        type="text" value={downForm.tournament_name}
                                        onChange={e => setDownForm({ ...downForm, tournament_name: e.target.value })}
                                        placeholder="e.g. $1,000 NLH Freezeout" style={styles.formInput}
                                    />
                                </>
                            )}

                            {/* Game Type (for cash) */}
                            {downForm.down_type === 'cash' && (
                                <>
                                    <label style={styles.formLabel}>Game Type (Optional)</label>
                                    <input
                                        type="text" value={downForm.game_type}
                                        onChange={e => setDownForm({ ...downForm, game_type: e.target.value })}
                                        placeholder="e.g. 1/3 NLH, 2/5 PLO" style={styles.formInput}
                                    />
                                </>
                            )}

                            {/* Table Number (optional for both cash/tournament) */}
                            {(downForm.down_type === 'cash' || downForm.down_type === 'tournament') && (
                                <>
                                    <label style={styles.formLabel}>Table Number (Optional)</label>
                                    <input
                                        type="text" value={downForm.table_number}
                                        onChange={e => setDownForm({ ...downForm, table_number: e.target.value })}
                                        placeholder="e.g. 42" style={styles.formInput}
                                    />
                                </>
                            )}

                            <div style={styles.formActions}>
                                <button onClick={handleAddDown} style={styles.formSubmitBtn}>Start Down</button>
                                <button onClick={() => setShowAddDown(false)} style={styles.formCancelBtn}>Cancel</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── DOUBLE DOWN PROMPT ── */}
            <AnimatePresence>
                {showDoubleDownPrompt && promptDown && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={styles.modalOverlay}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                            style={styles.promptCard}
                        >
                            <div style={styles.promptIcon}>⏰</div>
                            <h3 style={styles.promptTitle}>
                                {promptDown.down_type === 'break' ? 'Still On Break?' :
                                    promptDown.down_type === 'brush' ? 'Still Brushing?' :
                                        'Still Dealing The Same Table?'}
                            </h3>
                            <p style={styles.promptSub}>
                                {promptDown.down_type === 'break' ? 'Your break has been going 35 minutes.' :
                                    promptDown.down_type === 'brush' ? 'Your brush down has been 35 minutes.' :
                                        `Your ${DOWN_TYPE_LABELS[promptDown.down_type].toLowerCase()} down${promptDown.table_number ? ` (Table ${promptDown.table_number})` : ''} hit 35 minutes.`}
                            </p>
                            <div style={styles.promptActions}>
                                <button onClick={handleDoubleDownYes} style={styles.promptYesBtn}>
                                    Yes, Double Down ⏫
                                </button>
                                <button onClick={handleDoubleDownNo} style={styles.promptNoBtn}>
                                    No, New Down
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── COMPLETED EVENTS ── */}
            <div style={styles.historySection}>
                <h3 style={styles.historyTitle}>Completed Events</h3>
                {isLoading ? (
                    <div style={styles.loadingPlaceholder}>Loading Events...</div>
                ) : completedGigs.length === 0 ? (
                    <div style={styles.emptyState}>No Completed Events Yet. Start Your First Event Above!</div>
                ) : (
                    <div style={styles.gigGrid}>
                        {completedGigs.map(gig => (
                            <motion.div
                                key={gig.id}
                                whileHover={{ scale: 1.02 }}
                                onClick={() => handleViewReport(gig.id)}
                                style={styles.gigCard}
                            >
                                <div style={styles.gigCardHeader}>
                                    <h4 style={styles.gigCardName}>{gig.venue_name}</h4>
                                    <span style={{ ...styles.gigCardTokes, color: '#f59e0b' }}>
                                        {formatCurrency(gig.totalTokes || 0)}
                                    </span>
                                </div>
                                <div style={styles.gigCardMeta}>
                                    <span>{new Date(gig.start_date + 'T12:00:00').toLocaleDateString()}</span>
                                    {gig.end_date && <span> — {new Date(gig.end_date + 'T12:00:00').toLocaleDateString()}</span>}
                                </div>
                                <div style={styles.gigCardFooter}>
                                    <span>{gig.totalDowns || 0} downs · {(gig.totalHoursWorked || 0).toFixed(1)}h</span>
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

// ═══════════════════════════════════════════════════════════════
// STYLES — Facebook Dark (matches TripTracker)
// ═══════════════════════════════════════════════════════════════
const styles = {
    container: { display: 'flex', flexDirection: 'column', gap: 20 },

    // Active Gig
    activeGigCard: {
        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(59, 130, 246, 0.08) 100%)',
        border: '2px solid rgba(245, 158, 11, 0.3)',
        borderRadius: 12, padding: 20, position: 'relative',
    },
    activeHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
    activeLed: {
        width: 8, height: 8, borderRadius: '50%', background: '#f59e0b',
        boxShadow: '0 0 8px rgba(245, 158, 11, 0.6)', animation: 'pulse 2s infinite',
    },
    activeLabel: { fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: '#f59e0b', textTransform: 'uppercase' },
    activeGigName: { fontSize: 22, fontWeight: 700, color: '#fff', margin: '4px 0' },
    activeGigAddress: { fontSize: 13, color: '#8A8D91', margin: '0 0 4px', fontStyle: 'italic' },
    activeGigMeta: { fontSize: 14, color: '#94a3b8', margin: '0 0 16px' },

    // Running stats
    runningStats: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 },
    runningStat: { display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '10px 8px' },
    runningStatLabel: { fontSize: 14, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    runningStatValue: { fontSize: 18, fontWeight: 700, color: '#fff' },

    // Timer
    timerBanner: {
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'rgba(245, 158, 11, 0.1)', border: '2px solid rgba(245, 158, 11, 0.3)',
        borderRadius: 10, padding: '10px 14px', marginBottom: 16,
    },
    timerIcon: { fontSize: 24 },
    timerInfo: { flex: 1, display: 'flex', flexDirection: 'column' },
    timerLabel: { fontSize: 13, fontWeight: 600, color: '#E4E6EB' },
    timerCountdown: { fontSize: 20, fontWeight: 800, color: '#f59e0b', fontFamily: 'monospace' },
    endDownBtn: {
        background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '2px solid rgba(239,68,68,0.3)',
        borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    },

    // Downs list
    downsSection: { marginBottom: 16 },
    downsSectionTitle: { fontSize: 14, fontWeight: 600, color: '#94a3b8', marginBottom: 8, letterSpacing: 0.5 },
    downsScroll: { maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 },
    downRow: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: '8px 10px',
    },
    downInfo: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0, flex: 1 },
    downTypeBadge: { fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap' },
    downDetail: { fontSize: 12, color: '#94a3b8' },
    downTime: { fontSize: 11, color: '#64748b' },
    downRight: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
    tokeDisplay: { background: 'none', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '2px 4px' },
    tokeEditRow: { display: 'flex', alignItems: 'center', gap: 4 },
    tokeInput: {
        width: 70, padding: '4px 6px', background: '#242526', border: '1px solid #3A3B3C',
        borderRadius: 4, color: '#fff', fontSize: 13, textAlign: 'right',
    },
    tokeSaveBtn: {
        background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)',
        borderRadius: 4, padding: '4px 8px', fontSize: 13, cursor: 'pointer', fontWeight: 700,
    },
    endDownSmallBtn: {
        background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
    },
    downDeleteBtn: {
        background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 4, padding: '2px 6px', fontSize: 12, cursor: 'pointer', color: '#ef4444', lineHeight: 1,
    },

    // Actions
    activeActions: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    editBtn: {
        background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '2px solid rgba(59, 130, 246, 0.3)',
        borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    },
    addDownBtn: {
        background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '2px solid rgba(245, 158, 11, 0.3)',
        borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    },
    completeBtn: {
        background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '2px solid rgba(16, 185, 129, 0.3)',
        borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    },
    cancelEditBtn: {
        background: 'transparent', color: '#94a3b8', border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 8, padding: '10px 18px', fontSize: 14, cursor: 'pointer',
    },
    confirmRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    confirmText: { fontSize: 14, fontWeight: 600, color: '#E4E6EB' },
    confirmYes: {
        background: '#10b981', color: '#fff', border: 'none',
        borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    },
    confirmNo: {
        background: 'transparent', color: '#94a3b8', border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer',
    },

    // Delete
    deleteX: {
        position: 'absolute', top: 10, right: 10, width: 28, height: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.1)',
        borderRadius: 6, color: '#8a8d91', fontSize: 14, cursor: 'pointer',
    },
    deleteOverlay: {
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)',
        borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
    },
    deletePopup: { textAlign: 'center', padding: 20 },
    deletePopupText: { fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 16 },
    deleteConfirmBtn: {
        background: '#ef4444', color: '#fff', border: 'none',
        borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
    },
    deleteCancelBtn: {
        background: 'transparent', color: '#94a3b8', border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 8, padding: '10px 20px', fontSize: 14, cursor: 'pointer',
    },

    // Create Gig
    createGigBtn: {
        background: 'rgba(255,255,255,0.04)', border: '2px dashed rgba(255,255,255,0.12)',
        borderRadius: 12, padding: '24px 20px', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', width: '100%',
    },
    createGigTitle: { fontSize: 18, fontWeight: 700, color: '#fff' },
    createGigSub: { fontSize: 13, color: '#8A8D91' },

    // Form
    createForm: {
        background: 'rgba(36,37,38,0.95)', border: '2px solid rgba(255,255,255,0.1)',
        borderRadius: 12, padding: 20, overflow: 'hidden',
    },
    formTitle: { fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 0 16px' },
    formLabel: { fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 4, display: 'block', marginTop: 12 },
    formInput: {
        width: '100%', padding: '10px 12px', background: '#3A3B3C', border: '2px solid rgba(255,255,255,0.1)',
        borderRadius: 8, color: '#E4E6EB', fontSize: 14, outline: 'none', boxSizing: 'border-box',
    },
    formActions: { display: 'flex', gap: 10, marginTop: 16 },
    formSubmitBtn: {
        background: '#f59e0b', color: '#000', border: 'none',
        borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', flex: 1,
    },
    formCancelBtn: {
        background: 'transparent', color: '#94a3b8', border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 8, padding: '10px 24px', fontSize: 14, cursor: 'pointer',
    },

    // Modal
    modalOverlay: {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    },
    modalCard: {
        background: '#242526', border: '2px solid #3A3B3C', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    },
    modalTitle: { fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 16px' },

    // Down type grid
    downTypeGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 },
    downTypeBtn: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        padding: '14px 10px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
    },

    // Double down prompt
    promptCard: {
        background: '#242526', border: '2px solid rgba(245,158,11,0.4)', borderRadius: 16, padding: 28,
        width: '100%', maxWidth: 380, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    },
    promptIcon: { fontSize: 48, marginBottom: 12 },
    promptTitle: { fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 8px' },
    promptSub: { fontSize: 14, color: '#94a3b8', margin: '0 0 20px' },
    promptActions: { display: 'flex', flexDirection: 'column', gap: 10 },
    promptYesBtn: {
        background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '2px solid rgba(245,158,11,0.4)',
        borderRadius: 10, padding: '12px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
    },
    promptNoBtn: {
        background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '2px solid rgba(59,130,246,0.3)',
        borderRadius: 10, padding: '12px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
    },

    // History
    historySection: { marginTop: 8 },
    historyTitle: { fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 12 },
    loadingPlaceholder: { padding: 20, textAlign: 'center', color: '#64748b', fontSize: 14 },
    emptyState: { padding: 24, textAlign: 'center', color: '#64748b', fontSize: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '2px solid rgba(255,255,255,0.06)' },
    gigGrid: { display: 'flex', flexDirection: 'column', gap: 10 },
    gigCard: {
        background: 'rgba(36,37,38,0.8)', border: '2px solid rgba(255,255,255,0.08)',
        borderRadius: 10, padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.15s',
    },
    gigCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    gigCardName: { fontSize: 16, fontWeight: 600, color: '#E4E6EB', margin: 0 },
    gigCardTokes: { fontSize: 16, fontWeight: 700 },
    gigCardMeta: { fontSize: 13, color: '#64748b', marginBottom: 6 },
    gigCardFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#64748b' },
    viewReportLink: { color: '#3b82f6', fontWeight: 600 },

    // Report
    backBtn: {
        background: 'none', border: 'none', color: '#3b82f6', fontSize: 14,
        fontWeight: 600, cursor: 'pointer', padding: '4px 0', marginBottom: 8,
    },
    reportCard: {
        background: 'rgba(36,37,38,0.95)', border: '2px solid rgba(255,255,255,0.1)',
        borderRadius: 12, padding: 24,
    },
    reportTitle: { fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 4px' },
    reportAddress: { fontSize: 13, color: '#8A8D91', margin: '0 0 4px', fontStyle: 'italic' },
    reportDates: { fontSize: 14, color: '#64748b', margin: '0 0 20px' },
    reportStatsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 },
    reportStat: { display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '10px 8px' },
    reportStatLabel: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    reportStatValue: { fontSize: 18, fontWeight: 700, color: '#fff' },
    reportBreakdown: { background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 16 },
    reportBreakdownTitle: { fontSize: 14, fontWeight: 600, color: '#E4E6EB', margin: '0 0 10px' },
    reportBreakdownGrid: { display: 'flex', flexWrap: 'wrap', gap: 8 },
    breakdownItem: { fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 10px', color: '#94a3b8' },
};
