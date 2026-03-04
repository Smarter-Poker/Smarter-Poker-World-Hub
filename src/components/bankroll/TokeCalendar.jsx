/**
 * TOKE CALENDAR — Apple Calendar-Style Yearly Planner
 * ═══════════════════════════════════════════════════════════════════
 * Dealers can schedule future events with alerts + sharing.
 * Matches Toke Tracker's Facebook Dark design language.
 * ═══════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    fetchCalendarEvents,
    createCalendarEvent,
    deleteCalendarEvent,
    updateCalendarEvent,
} from '../../lib/bankroll/calendarSelectors';
import toast from '../../stores/toastStore';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function getCalendarDays(year, month) {
    // month is 0-indexed
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
}

export default function TokeCalendar({ userId }) {
    const [events, setEvents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [expandedMonth, setExpandedMonth] = useState(null); // 0-indexed
    const [selectedDate, setSelectedDate] = useState(null); // 'YYYY-MM-DD'
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEventDetail, setShowEventDetail] = useState(null); // event object
    const [addForm, setAddForm] = useState({ title: '', venue_name: '', notes: '', alert_enabled: true });
    const [saving, setSaving] = useState(false);

    const loadEvents = useCallback(async () => {
        if (!userId) return;
        setIsLoading(true);
        try {
            const data = await fetchCalendarEvents(userId);
            setEvents(data);
        } catch (err) {
            console.error('Calendar load error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

    useEffect(() => { loadEvents(); }, [loadEvents]);

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

            // Request notification permission if alert enabled
            if (addForm.alert_enabled && 'Notification' in window && Notification.permission === 'default') {
                await Notification.requestPermission();
            }

            toast.success('Event added to calendar!');
            setShowAddModal(false);
            await loadEvents();
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
        } catch (err) {
            toast.error(err.message || 'Failed to delete event');
        }
    };

    const handleShare = async (ev) => {
        const text = `📅 ${ev.title}${ev.venue_name ? ` @ ${ev.venue_name}` : ''}\n📆 ${new Date(ev.event_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}${ev.notes ? `\n📝 ${ev.notes}` : ''}`;
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

    const monthsInYear = Array.from({ length: 12 }, (_, i) => i);

    return (
        <div style={calStyles.wrapper}>
            {/* Header */}
            <div style={calStyles.header}>
                <div style={calStyles.headerLeft}>
                    <span style={calStyles.calIcon}>📅</span>
                    <div>
                        <div style={calStyles.title}>Event Calendar</div>
                        <div style={calStyles.subtitle}>Schedule Future Gigs & Get Alerts</div>
                    </div>
                </div>
                <div style={calStyles.yearNav}>
                    <button onClick={() => setCurrentYear(y => y - 1)} style={calStyles.navBtn}>‹</button>
                    <span style={calStyles.yearLabel}>{currentYear}</span>
                    <button onClick={() => setCurrentYear(y => y + 1)} style={calStyles.navBtn}>›</button>
                </div>
            </div>

            {/* Events count badge */}
            {events.length > 0 && (
                <div style={calStyles.eventsBadge}>
                    {events.filter(e => e.event_date >= todayStr).length} upcoming event{events.filter(e => e.event_date >= todayStr).length !== 1 ? 's' : ''} this year
                </div>
            )}

            {isLoading ? (
                <div style={calStyles.loading}>Loading calendar...</div>
            ) : (
                /* 12-Month Year Grid */
                <div style={calStyles.yearGrid}>
                    {monthsInYear.map(monthIdx => {
                        const days = getCalendarDays(currentYear, monthIdx);
                        const isExpanded = expandedMonth === monthIdx;
                        const monthEvents = days
                            .filter(d => d !== null)
                            .flatMap(d => {
                                const ds = `${currentYear}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                return eventMap[ds] || [];
                            });
                        const hasEvents = monthEvents.length > 0;

                        return (
                            <div key={monthIdx} style={{ ...calStyles.monthCard, ...(isExpanded ? calStyles.monthCardExpanded : {}) }}>
                                {/* Month header */}
                                <button
                                    style={calStyles.monthHeader}
                                    onClick={() => setExpandedMonth(isExpanded ? null : monthIdx)}
                                >
                                    <span style={{ ...calStyles.monthName, ...(hasEvents ? { color: '#f59e0b' } : {}) }}>
                                        {MONTHS[monthIdx]}
                                    </span>
                                    {hasEvents && (
                                        <span style={calStyles.monthDot}>{monthEvents.length}</span>
                                    )}
                                    <span style={{ ...calStyles.monthChevron, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
                                </button>

                                {/* Mini calendar grid (always visible in condensed form) */}
                                {!isExpanded && (
                                    <div style={calStyles.miniGrid}>
                                        {DAYS_SHORT.map((d, i) => (
                                            <div key={i} style={calStyles.miniDayHeader}>{d}</div>
                                        ))}
                                        {days.map((day, i) => {
                                            if (day === null) return <div key={`blank-${i}`} />;
                                            const ds = `${currentYear}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                            const hasEv = !!eventMap[ds];
                                            const isToday = ds === todayStr;
                                            return (
                                                <div
                                                    key={day}
                                                    onClick={() => handleDateClick(currentYear, monthIdx, day)}
                                                    style={{
                                                        ...calStyles.miniDay,
                                                        ...(isToday ? calStyles.miniDayToday : {}),
                                                        ...(hasEv ? calStyles.miniDayHasEvent : {}),
                                                    }}
                                                    title={hasEv ? eventMap[ds].map(e => e.title).join(', ') : undefined}
                                                >
                                                    {day}
                                                    {hasEv && <div style={calStyles.miniDot} />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Expanded month view */}
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            style={{ overflow: 'hidden' }}
                                        >
                                            {/* Full day-of-week headers */}
                                            <div style={calStyles.fullGrid}>
                                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                                    <div key={d} style={calStyles.fullDayHeader}>{d}</div>
                                                ))}
                                                {days.map((day, i) => {
                                                    if (day === null) return <div key={`blank-${i}`} />;
                                                    const ds = `${currentYear}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                                    const dayEvs = eventMap[ds] || [];
                                                    const isToday = ds === todayStr;
                                                    const isPast = ds < todayStr;
                                                    return (
                                                        <div
                                                            key={day}
                                                            onClick={() => handleDateClick(currentYear, monthIdx, day)}
                                                            style={{
                                                                ...calStyles.fullDay,
                                                                ...(isToday ? calStyles.fullDayToday : {}),
                                                                ...(isPast ? calStyles.fullDayPast : {}),
                                                            }}
                                                        >
                                                            <span style={calStyles.fullDayNum}>{day}</span>
                                                            {dayEvs.map(ev => (
                                                                <div key={ev.id} style={calStyles.eventPill}
                                                                    onClick={e => { e.stopPropagation(); setShowEventDetail(ev); }}
                                                                >
                                                                    {ev.alert_enabled ? '🔔 ' : ''}{ev.title}
                                                                </div>
                                                            ))}
                                                            {!isPast && dayEvs.length === 0 && (
                                                                <div style={calStyles.addHint}>+</div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── ADD EVENT MODAL ── */}
            <AnimatePresence>
                {showAddModal && selectedDate && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={calStyles.overlay}
                        onClick={() => setShowAddModal(false)}
                    >
                        <motion.form
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            style={calStyles.modal}
                            onClick={e => e.stopPropagation()}
                            onSubmit={handleAddEvent}
                        >
                            <h3 style={calStyles.modalTitle}>New Calendar Event</h3>
                            <div style={calStyles.modalDate}>
                                📅 {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </div>

                            <label style={calStyles.label}>Event Title *</label>
                            <input
                                type="text"
                                value={addForm.title}
                                onChange={e => setAddForm({ ...addForm, title: e.target.value })}
                                placeholder="e.g. WSOP Main Event"
                                style={calStyles.input}
                                autoFocus
                            />

                            <label style={{ ...calStyles.label, marginTop: 12 }}>Venue (optional)</label>
                            <input
                                type="text"
                                value={addForm.venue_name}
                                onChange={e => setAddForm({ ...addForm, venue_name: e.target.value })}
                                placeholder="e.g. Horseshoe Casino"
                                style={calStyles.input}
                            />

                            <label style={{ ...calStyles.label, marginTop: 12 }}>Notes (optional)</label>
                            <textarea
                                value={addForm.notes}
                                onChange={e => setAddForm({ ...addForm, notes: e.target.value })}
                                placeholder="Dress code, contact info, etc."
                                style={{ ...calStyles.input, minHeight: 60, resize: 'vertical' }}
                            />

                            {/* Alert Toggle */}
                            <div style={calStyles.alertRow}>
                                <span style={calStyles.alertLabel}>🔔 Day-Of Alert</span>
                                <button
                                    type="button"
                                    onClick={() => setAddForm(f => ({ ...f, alert_enabled: !f.alert_enabled }))}
                                    style={{ ...calStyles.toggleBtn, background: addForm.alert_enabled ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)', border: addForm.alert_enabled ? '2px solid rgba(16,185,129,0.4)' : '2px solid rgba(255,255,255,0.1)', color: addForm.alert_enabled ? '#10b981' : '#64748b' }}
                                >
                                    {addForm.alert_enabled ? 'ON' : 'OFF'}
                                </button>
                            </div>

                            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                                <button type="submit" disabled={saving} style={calStyles.submitBtn}>
                                    {saving ? 'Saving...' : '+ Add Event'}
                                </button>
                                <button type="button" onClick={() => setShowAddModal(false)} style={calStyles.cancelBtn}>Cancel</button>
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
                        style={calStyles.overlay}
                        onClick={() => setShowEventDetail(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            style={{ ...calStyles.modal, border: '2px solid rgba(245,158,11,0.35)' }}
                            onClick={e => e.stopPropagation()}
                        >
                            <h3 style={calStyles.modalTitle}>{showEventDetail.title}</h3>
                            <div style={calStyles.modalDate}>
                                📅 {new Date(showEventDetail.event_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </div>
                            {showEventDetail.venue_name && (
                                <div style={{ color: '#B0B3B8', fontSize: 14, marginTop: 4 }}>
                                    📍 {showEventDetail.venue_name}
                                </div>
                            )}
                            {showEventDetail.notes && (
                                <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 8, padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                                    {showEventDetail.notes}
                                </div>
                            )}
                            <div style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>
                                {showEventDetail.alert_enabled ? '🔔 Alert enabled' : '🔕 No alert'}
                            </div>
                            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                                <button onClick={() => handleShare(showEventDetail)} style={calStyles.shareBtn}>
                                    📤 Share
                                </button>
                                <button onClick={() => handleDeleteEvent(showEventDetail.id)} style={calStyles.deleteBtn}>
                                    🗑 Delete
                                </button>
                                <button onClick={() => setShowEventDetail(null)} style={calStyles.cancelBtn}>Close</button>
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
    navBtn: {
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
        color: '#E4E6EB', borderRadius: 6, width: 28, height: 28, fontSize: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', lineHeight: 1,
    },
    yearLabel: { fontSize: 16, fontWeight: 700, color: '#f59e0b', minWidth: 44, textAlign: 'center' },
    eventsBadge: {
        fontSize: 12, color: '#f59e0b', background: 'rgba(245,158,11,0.08)',
        border: '1px solid rgba(245,158,11,0.2)', borderRadius: 20, padding: '4px 12px',
        display: 'inline-block', marginBottom: 12,
    },
    loading: { padding: 24, textAlign: 'center', color: '#64748b', fontSize: 14 },

    // Year grid — 3 columns on mobile, 4 on wider
    yearGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
    },
    monthCard: {
        background: '#242526', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10, padding: '10px 8px', transition: 'border-color 0.2s',
    },
    monthCardExpanded: {
        border: '1px solid rgba(245,158,11,0.3)',
        gridColumn: '1 / -1', // span full row when expanded
    },
    monthHeader: {
        display: 'flex', alignItems: 'center', gap: 4, width: '100%',
        background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 6,
    },
    monthName: { fontSize: 12, fontWeight: 700, color: '#E4E6EB', letterSpacing: 0.3, flex: 1, textAlign: 'left' },
    monthDot: {
        fontSize: 10, background: '#f59e0b', color: '#000',
        borderRadius: 10, minWidth: 16, height: 16,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
    },
    monthChevron: { fontSize: 12, color: '#64748b', transition: 'transform 0.2s' },

    // Mini calendar
    miniGrid: {
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1,
    },
    miniDayHeader: { fontSize: 8, color: '#64748b', textAlign: 'center', fontWeight: 600, paddingBottom: 2 },
    miniDay: {
        fontSize: 9, color: '#94a3b8', textAlign: 'center', cursor: 'pointer',
        borderRadius: 3, padding: '1px 0', position: 'relative', lineHeight: '14px',
        transition: 'background 0.15s',
    },
    miniDayToday: { background: 'rgba(245,158,11,0.2)', color: '#f59e0b', fontWeight: 700 },
    miniDayHasEvent: { color: '#fff', fontWeight: 700, background: 'rgba(245,158,11,0.12)' },
    miniDot: {
        position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: 3, height: 3, background: '#f59e0b', borderRadius: '50%',
    },

    // Expanded full grid
    fullGrid: {
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginTop: 6,
    },
    fullDayHeader: { fontSize: 11, color: '#64748b', textAlign: 'center', fontWeight: 600, padding: '4px 0' },
    fullDay: {
        fontSize: 11, color: '#94a3b8', textAlign: 'center', borderRadius: 6,
        padding: '4px 2px', minHeight: 44, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        border: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s',
        position: 'relative',
    },
    fullDayToday: { background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b' },
    fullDayPast: { opacity: 0.45 },
    fullDayNum: { fontWeight: 600, lineHeight: 1.3 },
    eventPill: {
        fontSize: 9, background: 'rgba(245,158,11,0.2)', color: '#f59e0b',
        borderRadius: 4, padding: '1px 4px', fontWeight: 600, width: '100%',
        textAlign: 'left', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
    addHint: {
        fontSize: 14, color: 'rgba(255,255,255,0.15)', lineHeight: 1, marginTop: 'auto',
    },

    // Modals
    overlay: {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    },
    modal: {
        background: '#242526', border: '2px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    },
    modalTitle: { fontSize: 20, fontWeight: 700, color: '#E4E6EB', margin: '0 0 8px' },
    modalDate: { fontSize: 14, color: '#f59e0b', fontWeight: 600, marginBottom: 16 },
    label: { fontSize: 13, fontWeight: 600, color: '#B0B3B8', marginBottom: 4, display: 'block' },
    input: {
        width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.5)',
        border: '2px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff',
        fontSize: 14, outline: 'none', boxSizing: 'border-box',
    },
    alertRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
    alertLabel: { fontSize: 14, fontWeight: 600, color: '#E4E6EB' },
    toggleBtn: {
        borderRadius: 8, padding: '6px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
    },
    submitBtn: {
        flex: 1, background: '#f59e0b', color: '#000', border: 'none',
        borderRadius: 10, padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
    },
    shareBtn: {
        flex: 1, background: 'rgba(59,130,246,0.15)', color: '#3b82f6',
        border: '2px solid rgba(59,130,246,0.3)', borderRadius: 10,
        padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    },
    deleteBtn: {
        background: 'rgba(239,68,68,0.15)', color: '#ef4444',
        border: '2px solid rgba(239,68,68,0.3)', borderRadius: 10,
        padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    },
    cancelBtn: {
        background: 'transparent', color: '#94a3b8', border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 10, padding: '10px 16px', fontSize: 13, cursor: 'pointer',
    },
};
