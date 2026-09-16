/**
 * TOKE CALENDAR — Apple Calendar-Style Yearly Planner
 * ═══════════════════════════════════════════════════════════════════
 * Dealers can schedule future events with alerts + sharing.
 * Matches Toke Tracker's SmarterPoker Dark design language.
 * ═══════════════════════════════════════════════════════════════════
 */

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    fetchCalendarEvents,
    createCalendarEvent,
    deleteCalendarEvent,
} from '../../lib/bankroll/calendarSelectors';
import toast from '../../stores/toastStore';
import { supabase } from '../../lib/supabase';
import { useHaptics } from '../../hooks/useHaptics';
import { useModalHistory } from '../../hooks/useModalHistory';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// How many months open by default (mobile phase 11). Twelve full 44px grids
// is 3,000px of calendar on a phone that has nothing booked; these are the
// months a dealer is scheduling into, and every month holding an event is
// added to them whatever the number says.
const INITIAL_MONTHS = 3;

function getCalendarDays(year, month) {
    // month is 0-indexed
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
}

function TokeCalendar({ userId, onSheetOpenChange }) {
    const [events, setEvents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [selectedDate, setSelectedDate] = useState(null); // 'YYYY-MM-DD'
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEventDetail, setShowEventDetail] = useState(null); // event object
    const [addForm, setAddForm] = useState({ title: '', venue_name: '', notes: '', alert_enabled: true });
    const [saving, setSaving] = useState(false);
    const [showAllMonths, setShowAllMonths] = useState(false);
    const haptic = useHaptics();

    // Mobile phase 11: the phone back gesture closes a sheet instead of
    // leaving the page, and the page above stops its pull-to-refresh while
    // either sheet is open.
    const closeAddModal = useCallback(() => setShowAddModal(false), []);
    const closeEventDetail = useCallback(() => setShowEventDetail(null), []);
    useModalHistory(showAddModal, closeAddModal);
    useModalHistory(Boolean(showEventDetail), closeEventDetail);
    useEffect(() => {
        onSheetOpenChange?.(showAddModal || Boolean(showEventDetail));
    }, [showAddModal, showEventDetail, onSheetOpenChange]);

    const isMountedRef = useRef(true);
    useEffect(() => {
        return () => { isMountedRef.current = false; };
    }, []);

    const loadEvents = useCallback(async () => {
        if (!userId) return;
        setIsLoading(true);
        try {
            const data = await fetchCalendarEvents(userId);
            if (isMountedRef.current) setEvents(data);
        } catch (err) {
            console.warn('Calendar load error:', err);
        } finally {
            if (isMountedRef.current) setIsLoading(false);
        }
    }, [userId]);

    const realtimeTimerRef = useRef(null);
    const debouncedLoadEvents = useCallback(() => {
        if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
        realtimeTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) loadEvents();
        }, 500);
    }, [loadEvents]);

    useEffect(() => { loadEvents(); }, [loadEvents]);

    // ── Supabase Realtime — debounced auto-refresh ──
    useEffect(() => {
        if (!userId) return;
        const channel = supabase
            .channel(`toke-calendar-${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'toke_calendar_events', filter: `user_id=eq.${userId}` }, debouncedLoadEvents)
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [userId, debouncedLoadEvents]);

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && isMountedRef.current) {
                loadEvents();
            }
        });
        return () => subscription?.unsubscribe();
    }, [loadEvents]);

    // Build a fast lookup: 'YYYY-MM-DD' → [events]
    const eventMap = {};
    events.forEach(ev => {
        eventMap[ev.event_date] = eventMap[ev.event_date] || [];
        eventMap[ev.event_date].push(ev);
    });

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const handleDateClick = (year, month, day) => {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        haptic('light');

        // If events exist, show first event detail; otherwise open add modal
        if (eventMap[dateStr]?.length > 0) {
            setShowEventDetail(eventMap[dateStr][0]);
        } else {
            // Only allow future (or today)
            if (dateStr < todayStr) {
                toast.error('Cannot add events to past dates');
                return;
            }
            setSelectedDate(dateStr);
            setAddForm({ title: '', venue_name: '', notes: '', alert_enabled: true });
            setShowAddModal(true);
        }
    };

    const handleAddEvent = async (e) => {
        e.preventDefault();
        if (!addForm.title.trim()) { toast.error('Event title is required'); return; }
        if (!selectedDate) return;
        setSaving(true);
        try {
            await createCalendarEvent(userId, {
                title: addForm.title.trim(),
                venue_name: addForm.venue_name.trim() || undefined,
                event_date: selectedDate,
                notes: addForm.notes.trim() || undefined,
                alert_enabled: addForm.alert_enabled,
            });

            // Request notification permission if alert enabled safely (fire-and-forget)
            if (addForm.alert_enabled && 'Notification' in window) {
                try {
                    if (Notification.permission === 'default') {
                        const req = Notification.requestPermission();
                        if (req && typeof req.then === 'function') {
                            req.catch(e => console.warn('[App] Handled promise rejection:', e?.message || e)); // prevent unhandled rejections
                        }
                    }
                } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
            }

            toast.success('Event added to calendar!');
            setShowAddModal(false);
            await loadEvents();
            window.dispatchEvent(new CustomEvent('toke-calendar-updated'));
        } catch (err) {
            toast.error(err.message || 'Failed to add event');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteEvent = async (eventId) => {
        if (!confirm('Delete this calendar event?')) return;
        try {
            await deleteCalendarEvent(eventId);
            toast.success('Event deleted');
            setShowEventDetail(null);
            await loadEvents();
            window.dispatchEvent(new CustomEvent('toke-calendar-updated'));
        } catch (err) {
            toast.error(err.message || 'Failed to delete event');
        }
    };

    const handleShare = async (ev) => {
        const text = `${ev.title}${ev.venue_name ? ` @ ${ev.venue_name}` : ''}\n${new Date(ev.event_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}${ev.notes ? `\n${ev.notes}` : ''}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: ev.title, text });
            } else {
                await navigator.clipboard.writeText(text);
                toast.success('Copied to clipboard!');
            }
        } catch {
            // Silently ignore user abort
        }
    };

    // ALWAYS-DISPLAYED (mobile phase 11). Every month used to render a
    // condensed 7-column grid inside a card one third of the phone wide,
    // which made each day a 15px tap target, and the real 44px grid only
    // appeared for the ONE month you expanded. Now there is one grid, always
    // the full one, and the year is bounded the way the Video Library bounds
    // its rows: the months you are likely to want plus every month that has
    // something in it, then a button that shows the rest.
    const monthsInYear = Array.from({ length: 12 }, (_, i) => i);

    const monthHasEvents = (monthIdx) => events.some(ev =>
        ev.event_date?.startsWith(`${currentYear}-${String(monthIdx + 1).padStart(2, '0')}`)
    );

    const firstDefaultMonth = currentYear === today.getFullYear()
        ? Math.min(today.getMonth(), 12 - INITIAL_MONTHS)
        : 0;
    const isDefaultMonth = (monthIdx) =>
        monthIdx >= firstDefaultMonth && monthIdx < firstDefaultMonth + INITIAL_MONTHS;

    const visibleMonths = showAllMonths
        ? monthsInYear
        : monthsInYear.filter(m => isDefaultMonth(m) || monthHasEvents(m));
    const hiddenMonthCount = monthsInYear.length - visibleMonths.length;

    return (
        <div style={calStyles.wrapper}>
            {/* Header */}
            <div style={calStyles.header}>
                <div style={calStyles.headerLeft}>
                    <span style={calStyles.calIcon}></span>
                    <div>
                        <div style={calStyles.title}>Event Calendar</div>
                        <div style={calStyles.subtitle}>Schedule Future Gigs & Get Alerts</div>
                    </div>
                </div>
                <div style={calStyles.yearNav}>
                    <button
                        type="button"
                        onClick={() => setCurrentYear(y => y - 1)}
                        style={calStyles.navBtn}
                        aria-label={`Show ${currentYear - 1}`}
                    >&lsaquo;</button>
                    <span style={calStyles.yearLabel}>{currentYear}</span>
                    <button
                        type="button"
                        onClick={() => setCurrentYear(y => y + 1)}
                        style={calStyles.navBtn}
                        aria-label={`Show ${currentYear + 1}`}
                    >&rsaquo;</button>
                </div>
            </div>

            {/* Events count badge */}
            {events.length > 0 && (
                <div style={calStyles.eventsBadge}>
                    {/* One text node: see the note in DealerVault's header. */}
                    {`${events.filter(e => e.event_date >= todayStr).length} Upcoming Event${events.filter(e => e.event_date >= todayStr).length !== 1 ? 's' : ''} This Year`}
                </div>
            )}

            {isLoading ? (
                <div style={calStyles.loading}>Loading Calendar...</div>
            ) : (
                /* 12-Month Year Grid */
                <>
                <div className="toke-cal-year-grid" style={calStyles.yearGrid}>
                    {visibleMonths.map(monthIdx => {
                        const days = getCalendarDays(currentYear, monthIdx);
                        const monthEvents = days
                            .filter(d => d !== null)
                            .flatMap(d => {
                                const ds = `${currentYear}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                return eventMap[ds] || [];
                            });
                        const hasEvents = monthEvents.length > 0;

                        return (
                            <div key={monthIdx} className="toke-cal-month" style={calStyles.monthCard}>
                                <h4 style={calStyles.monthHeader}>
                                    <span style={{ ...calStyles.monthName, ...(hasEvents ? { color: '#f59e0b' } : {}) }}>
                                        {MONTHS[monthIdx]}
                                    </span>
                                    {hasEvents && (
                                        <span style={calStyles.monthDot}>{monthEvents.length}</span>
                                    )}
                                </h4>

                                {/* One grid, always the full one, 44px days. */}
                                <div className="toke-cal-grid" style={calStyles.fullGrid}>
                                    {DAY_HEADERS.map(d => (
                                        <div key={d} style={calStyles.fullDayHeader}>{d}</div>
                                    ))}
                                    {days.map((day, i) => {
                                        if (day === null) return <div key={`blank-${i}`} />;
                                        const ds = `${currentYear}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                        const dayEvs = eventMap[ds] || [];
                                        const isToday = ds === todayStr;
                                        const isPast = ds < todayStr;
                                        return (
                                            <button
                                                key={day}
                                                type="button"
                                                className="toke-cal-day"
                                                onClick={() => handleDateClick(currentYear, monthIdx, day)}
                                                disabled={isPast && dayEvs.length === 0}
                                                aria-label={`${MONTHS[monthIdx]} ${day}, ${currentYear}${dayEvs.length ? `: ${dayEvs.map(e => e.title).join(', ')}` : ''}`}
                                                style={{
                                                    ...calStyles.fullDay,
                                                    ...(isToday ? calStyles.fullDayToday : {}),
                                                    ...(isPast ? calStyles.fullDayPast : {}),
                                                }}
                                            >
                                                <span style={calStyles.fullDayNum}>{day}</span>
                                                {dayEvs.map(ev => (
                                                    <span key={ev.id} style={calStyles.eventPill}>
                                                        {ev.title}
                                                    </span>
                                                ))}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {(hiddenMonthCount > 0 || showAllMonths) && (
                    <button
                        type="button"
                        className="toke-show-more"
                        style={calStyles.showMoreBtn}
                        onClick={() => { haptic('light'); setShowAllMonths(v => !v); }}
                    >
                        {showAllMonths
                            ? 'Show Fewer Months'
                            : `Show All Twelve Months Of ${currentYear}`}
                    </button>
                )}
                </>
            )}

            {/* ── ADD EVENT MODAL ── */}
            <AnimatePresence>
                {showAddModal && selectedDate && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="bankroll-modal-overlay"
                        style={calStyles.overlay}
                        onClick={closeAddModal}
                    >
                        <motion.form
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bankroll-modal"
                            style={calStyles.modal}
                            onClick={e => e.stopPropagation()}
                            onSubmit={handleAddEvent}
                        >
                            <span className="bankroll-sheet-handle" aria-hidden="true" />
                            <div className="bankroll-modal-header" style={calStyles.modalHeader}>
                                <div>
                                    <h3 style={calStyles.modalTitle}>New Calendar Event</h3>
                                    <div style={calStyles.modalDate}>
                                        {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="bankroll-modal-close sp-icon-btn"
                                    onClick={closeAddModal}
                                    aria-label="Close"
                                    style={calStyles.closeBtn}
                                >&times;</button>
                            </div>

                            <div className="bankroll-modal-body" style={calStyles.modalBody}>
                            <label style={calStyles.label}>Event Title *</label>
                            <input
                                type="text"
                                value={addForm.title}
                                onChange={e => setAddForm({ ...addForm, title: e.target.value })}
                                placeholder="e.g. WSOP Main Event"
                                style={calStyles.input}
                                autoFocus
                            />

                            <label style={{ ...calStyles.label, marginTop: 12 }}>Venue (Optional)</label>
                            <input
                                type="text"
                                value={addForm.venue_name}
                                onChange={e => setAddForm({ ...addForm, venue_name: e.target.value })}
                                placeholder="e.g. Horseshoe Casino"
                                style={calStyles.input}
                            />

                            <label style={{ ...calStyles.label, marginTop: 12 }}>Notes (Optional)</label>
                            <textarea
                                value={addForm.notes}
                                onChange={e => setAddForm({ ...addForm, notes: e.target.value })}
                                placeholder="Dress code, contact info, etc."
                                style={{ ...calStyles.input, minHeight: 60, resize: 'vertical' }}
                            />

                            {/* Alert Toggle */}
                            <div style={calStyles.alertRow}>
                                <span style={calStyles.alertLabel}>Day-Of Alert</span>
                                <button
                                    type="button"
                                    onClick={() => setAddForm(f => ({ ...f, alert_enabled: !f.alert_enabled }))}
                                    style={{ ...calStyles.toggleBtn, background: addForm.alert_enabled ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)', border: addForm.alert_enabled ? '2px solid rgba(16,185,129,0.4)' : '2px solid rgba(255,255,255,0.1)', color: addForm.alert_enabled ? '#10b981' : '#64748b' }}
                                >
                                    {addForm.alert_enabled ? 'ON' : 'OFF'}
                                </button>
                            </div>

                            </div>

                            <div className="bankroll-modal-footer" style={calStyles.modalFooter}>
                                <button type="submit" disabled={saving} style={calStyles.submitBtn}>
                                    {saving ? 'Saving...' : 'Add Event'}
                                </button>
                                <button type="button" onClick={closeAddModal} style={calStyles.cancelBtn}>Cancel</button>
                            </div>
                        </motion.form>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── EVENT DETAIL MODAL ── */}
            <AnimatePresence>
                {showEventDetail && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="bankroll-modal-overlay"
                        style={calStyles.overlay}
                        onClick={closeEventDetail}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bankroll-modal"
                            style={{ ...calStyles.modal, border: '2px solid rgba(245,158,11,0.35)' }}
                            onClick={e => e.stopPropagation()}
                        >
                            <span className="bankroll-sheet-handle" aria-hidden="true" />
                            <div className="bankroll-modal-header" style={calStyles.modalHeader}>
                                <div>
                                    <h3 style={calStyles.modalTitle}>{showEventDetail.title}</h3>
                                    <div style={calStyles.modalDate}>
                                        {new Date(showEventDetail.event_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="bankroll-modal-close sp-icon-btn"
                                    onClick={closeEventDetail}
                                    aria-label="Close"
                                    style={calStyles.closeBtn}
                                >&times;</button>
                            </div>
                            <div className="bankroll-modal-body" style={calStyles.modalBody}>
                            {showEventDetail.venue_name && (
                                <div style={{ color: '#B0B3B8', fontSize: 14, marginTop: 4 }}>
                                    {showEventDetail.venue_name}
                                </div>
                            )}
                            {showEventDetail.notes && (
                                <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 8, padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                                    {showEventDetail.notes}
                                </div>
                            )}
                            <div style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>
                                {showEventDetail.alert_enabled ? 'Alert Enabled' : 'No Alert'}
                            </div>
                            </div>
                            <div className="bankroll-modal-footer" style={calStyles.modalFooter}>
                                <button onClick={() => handleShare(showEventDetail)} style={calStyles.shareBtn}>
                                    Share
                                </button>
                                <button onClick={() => handleDeleteEvent(showEventDetail.id)} style={calStyles.deleteBtn}>
                                    Delete
                                </button>
                                <button onClick={closeEventDetail} style={calStyles.cancelBtn}>Close</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const calStyles = {
    wrapper: { marginTop: 8 },
    header: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14,
    },
    headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
    calIcon: { fontSize: 28 },
    title: { fontSize: 18, fontWeight: 700, color: '#E4E6EB' },
    subtitle: { fontSize: 13, color: '#64748b', marginTop: 1 },
    yearNav: { display: 'flex', alignItems: 'center', gap: 8 },
    // 28x28 was the smallest control on the Venue Intel page (mobile phase 11).
    navBtn: {
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
        color: '#E4E6EB', borderRadius: 6, width: 44, height: 44, minWidth: 44, minHeight: 44,
        fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', lineHeight: 1, touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
    },
    yearLabel: { fontSize: 16, fontWeight: 700, color: '#f59e0b', minWidth: 44, textAlign: 'center' },
    eventsBadge: {
        fontSize: 12, color: '#f59e0b', background: 'rgba(245,158,11,0.08)',
        border: '1px solid rgba(245,158,11,0.2)', borderRadius: 20, padding: '4px 12px',
        display: 'inline-block', marginBottom: 12,
    },
    loading: { padding: 24, textAlign: 'center', color: '#64748b', fontSize: 14 },

    // Year grid: one month per row on a phone (44px days need the width),
    // two or three across on a desktop. The columns come from
    // src/styles/worlds/toke-tracker.css so there is no fourth breakpoint.
    yearGrid: {
        display: 'grid',
        gap: 10,
    },
    monthCard: {
        background: '#242526', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10, padding: '10px 8px',
    },
    monthHeader: {
        display: 'flex', alignItems: 'center', gap: 6, width: '100%',
        margin: '0 0 6px', padding: 0,
    },
    monthName: { fontSize: 14, fontWeight: 700, color: '#E4E6EB', letterSpacing: 0.3, flex: 1, textAlign: 'left' },
    monthDot: {
        fontSize: 12, background: '#f59e0b', color: '#000',
        borderRadius: 10, minWidth: 18, height: 18,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
    },

    // The one day grid. Every day is a 44px button.
    fullGrid: {
        display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 3, marginTop: 6,
    },
    fullDayHeader: { fontSize: 12, color: '#64748b', textAlign: 'center', fontWeight: 600, padding: '4px 0' },
    fullDay: {
        fontSize: 13, color: '#94a3b8', textAlign: 'center', borderRadius: 6,
        padding: '4px 2px', minHeight: 44, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        background: 'none',
        border: '1px solid rgba(255,255,255,0.04)',
        position: 'relative', touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
    },
    fullDayToday: { background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b' },
    fullDayPast: { opacity: 0.45 },
    fullDayNum: { fontWeight: 600, lineHeight: 1.3 },
    eventPill: {
        fontSize: 12, background: 'rgba(245,158,11,0.2)', color: '#f59e0b',
        borderRadius: 4, padding: '1px 4px', fontWeight: 600, width: '100%',
        textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
    showMoreBtn: {
        width: '100%', minHeight: 44, marginTop: 10,
        background: 'rgba(245,158,11,0.08)', color: '#f59e0b',
        border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10,
        fontSize: 13, fontWeight: 700, cursor: 'pointer',
        touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
    },

    // Modals. The `bankroll-modal-*` classes on these elements are what make
    // them bottom sheets at or below 600px (one 600px block owns that switch,
    // in src/styles/worlds/bankroll.css).
    overlay: {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    },
    modal: {
        background: '#242526', border: '2px solid rgba(255,255,255,0.1)', borderRadius: 16,
        padding: 0, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    },
    modalHeader: {
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 12, padding: '20px 20px 8px',
    },
    modalBody: { padding: '0 20px 16px' },
    modalFooter: {
        display: 'flex', gap: 10, padding: '12px 20px 20px',
        background: '#242526', borderTop: '1px solid rgba(255,255,255,0.07)',
    },
    closeBtn: {
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8, color: '#E4E6EB', fontSize: 22, lineHeight: 1, cursor: 'pointer',
    },
    modalTitle: { fontSize: 20, fontWeight: 700, color: '#E4E6EB', margin: '0 0 8px' },
    modalDate: { fontSize: 14, color: '#f59e0b', fontWeight: 600 },
    label: { fontSize: 13, fontWeight: 600, color: '#B0B3B8', marginBottom: 4, display: 'block' },
    input: {
        width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.5)',
        border: '2px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff',
        fontSize: 16, minHeight: 44, outline: 'none', boxSizing: 'border-box',
    },
    alertRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
    alertLabel: { fontSize: 14, fontWeight: 600, color: '#E4E6EB' },
    toggleBtn: {
        borderRadius: 8, padding: '6px 18px', minHeight: 44, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    },
    submitBtn: {
        flex: 1, background: '#f59e0b', color: '#000', border: 'none',
        borderRadius: 10, padding: '12px 20px', minHeight: 44, fontSize: 14, fontWeight: 700, cursor: 'pointer',
    },
    shareBtn: {
        flex: 1, background: 'rgba(59,130,246,0.15)', color: '#3b82f6',
        border: '2px solid rgba(59,130,246,0.3)', borderRadius: 10,
        padding: '10px 16px', minHeight: 44, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    },
    deleteBtn: {
        background: 'rgba(239,68,68,0.15)', color: '#ef4444',
        border: '2px solid rgba(239,68,68,0.3)', borderRadius: 10,
        padding: '10px 16px', minHeight: 44, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    },
    cancelBtn: {
        background: 'transparent', color: '#94a3b8', border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 10, padding: '10px 16px', minHeight: 44, fontSize: 13, cursor: 'pointer',
    },
};

export default memo(TokeCalendar);
