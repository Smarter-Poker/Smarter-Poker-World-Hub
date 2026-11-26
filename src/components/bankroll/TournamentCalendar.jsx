/**
 * TournamentCalendar — Major Series Event Calendar
 * ═══════════════════════════════════════════════════════════════════════════
 * Monthly calendar view showing upcoming series events (WSOP, WPT, etc.)
 * with budget planner and bankroll health integration.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════
// TOURNAMENT SERIES DATA — 2026 Major Events
// ═══════════════════════════════════════════════════════════════════════════

const SERIES_EVENTS = [
    // WSOP 2026
    { id: 'wsop-main', series: 'WSOP', name: 'Main Event', buyIn: 10000, date: '2026-06-28', endDate: '2026-07-15', location: 'Las Vegas, NV', color: '#6bd5e7', prizePool: '90M+' },
    { id: 'wsop-colossus', series: 'WSOP', name: 'Colossus', buyIn: 400, date: '2026-06-05', endDate: '2026-06-08', location: 'Las Vegas, NV', color: '#6bd5e7', prizePool: '5M+' },
    { id: 'wsop-mil', series: 'WSOP', name: 'The Millionaire Maker', buyIn: 1500, date: '2026-06-12', endDate: '2026-06-15', location: 'Las Vegas, NV', color: '#6bd5e7', prizePool: '12M+' },
    { id: 'wsop-senior', series: 'WSOP', name: 'Seniors Championship', buyIn: 1000, date: '2026-06-20', endDate: '2026-06-22', location: 'Las Vegas, NV', color: '#6bd5e7', prizePool: '5M+' },
    // WPT 2026
    { id: 'wpt-borg', series: 'WPT', name: 'Borgata Open', buyIn: 3500, date: '2026-03-15', endDate: '2026-03-20', location: 'Atlantic City, NJ', color: '#e5383b', prizePool: '3M+' },
    { id: 'wpt-la', series: 'WPT', name: 'WPT Los Angeles', buyIn: 5000, date: '2026-04-10', endDate: '2026-04-15', location: 'Commerce, CA', color: '#e5383b', prizePool: '5M+' },
    { id: 'wpt-champ', series: 'WPT', name: 'WPT Championship', buyIn: 10400, date: '2026-12-10', endDate: '2026-12-17', location: 'Las Vegas, NV', color: '#e5383b', prizePool: '15M+' },
    // Other Series
    { id: 'gg-wsop-online', series: 'GGPoker', name: 'WSOP Online Series', buyIn: 50, date: '2026-07-01', endDate: '2026-08-15', location: 'Online', color: '#1e88e5', prizePool: '100M+' },
    { id: 'mspt-vb', series: 'MSPT', name: 'Venetian $1,100', buyIn: 1100, date: '2026-05-20', endDate: '2026-05-24', location: 'Las Vegas, NV', color: '#7098b3', prizePool: '2M+' },
    { id: 'wynn-mil', series: 'Wynn', name: 'Wynn Millions', buyIn: 10000, date: '2026-04-01', endDate: '2026-04-12', location: 'Las Vegas, NV', color: '#c62828', prizePool: '10M+' },
    { id: 'shrb', series: 'SHRB', name: 'Super High Roller Bowl', buyIn: 300000, date: '2026-05-05', endDate: '2026-05-10', location: 'Las Vegas, NV', color: '#9fe5fb', prizePool: '20M+' },
    { id: 'runup', series: 'PokerStars', name: 'Run It Up Reno', buyIn: 600, date: '2026-09-15', endDate: '2026-09-22', location: 'Reno, NV', color: '#83abc5', prizePool: '1M+' },
];

// These schedule values are civil dates, independent of the viewer's time zone.
function calendarDate(year, month, day) {
    return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDate(date, options) {
    return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });
}

const byStartDate = (a, b) => a.date.localeCompare(b.date);
const fullDate = { month: 'long', day: 'numeric', year: 'numeric' };
// August 1, 2021 was a Sunday, the first column of this calendar.
const weekdays = Array.from({ length: 7 }, (_, index) =>
    formatDate(calendarDate(2021, 7, index + 1), { weekday: 'short' })
);

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function TournamentCalendar({ bankrollTotal = 0 }) {
    const [visibleMonth, setVisibleMonth] = useState(() => new Date());
    const currentMonth = visibleMonth.getMonth();
    const currentYear = visibleMonth.getFullYear();
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [interested, setInterested] = useState(new Set());
    const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'list'

    const detailId = useId();
    const detailTitle = useRef(null);
    const opener = useRef(null);
    const now = new Date();
    const today = calendarDate(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = calendarDate(currentYear, currentMonth, 1);
    const monthKey = monthStart.slice(0, 7);

    const monthEvents = useMemo(() => SERIES_EVENTS.filter(event =>
        event.date.slice(0, 7) <= monthKey && (event.endDate || event.date).slice(0, 7) >= monthKey
    ).sort(byStartDate), [monthKey]);
    const upcomingEvents = useMemo(() => SERIES_EVENTS.filter(event =>
        (event.endDate || event.date) >= today
    ).sort(byStartDate), [today]);

    useEffect(() => {
        if (selectedEvent) detailTitle.current?.focus();
    }, [selectedEvent]);

    const showDetails = (event, trigger) => {
        if (selectedEvent?.id === event.id) {
            setSelectedEvent(null);
        } else {
            opener.current = trigger;
            setSelectedEvent(event);
        }
    };
    const closeDetails = () => {
        setSelectedEvent(null);
        opener.current?.focus();
    };
    const changeView = (mode) => {
        if (mode !== viewMode) setSelectedEvent(null);
        setViewMode(mode);
    };

    // Budget planner
    const interestedEvents = useMemo(() => {
        return SERIES_EVENTS.filter(e => interested.has(e.id));
    }, [interested]);

    const totalBudgetNeeded = interestedEvents.reduce((s, e) => s + e.buyIn, 0);
    const budgetHealth = bankrollTotal > 0 ? Math.min(100, (bankrollTotal / Math.max(totalBudgetNeeded, 1)) * 100) : 0;

    const toggleInterest = (eventId) => {
        setInterested(prev => {
            const next = new Set(prev);
            if (next.has(eventId)) next.delete(eventId);
            else next.add(eventId);
            return next;
        });
    };

    const changeMonth = (offset) => {
        setSelectedEvent(null);
        setVisibleMonth(previous => new Date(previous.getFullYear(), previous.getMonth() + offset, 1));
    };

    // Calendar grid computation
    const calendarDays = useMemo(() => {
        const firstDay = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const days = [];
        for (let i = 0; i < firstDay; i++) days.push(null);
        for (let i = 1; i <= daysInMonth; i++) days.push(i);
        return days;
    }, [currentMonth, currentYear]);

    return (
        <div className="sd-panel">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#e2e8f0', letterSpacing: '-0.3px' }}>Tournament Calendar</div>
                    <div style={{ fontSize: 12, color: '#9aaec3' }}>Major Series Schedules & Budget Planning</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="sd-button" aria-pressed={viewMode === 'calendar'} onClick={() => changeView('calendar')}>Calendar</button>
                    <button type="button" className="sd-button" aria-pressed={viewMode === 'list'} onClick={() => changeView('list')}>List</button>
                </div>
            </div>

            {/* Budget Planner Bar */}
            {interestedEvents.length > 0 && (
                <div style={{
                    background: 'linear-gradient(135deg, rgba(71, 149, 243,0.08), rgba(0,0,0,0.2))',
                    border: '1px solid rgba(71, 149, 243,0.2)', borderRadius: 16, padding: '16px 20px', marginBottom: 20,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#e2e8f0' }}>Budget Planner - {interestedEvents.length} {interestedEvents.length === 1 ? 'Event' : 'Events'}</div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: budgetHealth >= 100 ? '#4ade80' : budgetHealth >= 50 ? '#94e7ff' : '#f45142' }}>
                            ${totalBudgetNeeded.toLocaleString()} Needed
                        </div>
                    </div>
                    <div style={{ height: 6, background: 'rgba(0,0,0,0.4)', borderRadius: 3, overflow: 'hidden' }}>
                        <motion.div
                            initial={{ width: 0 }} animate={{ width: `${Math.min(budgetHealth, 100)}%` }}
                            style={{
                                height: '100%', borderRadius: 3,
                                background: budgetHealth >= 100 ? 'linear-gradient(90deg, #22c55e, #4ade80)' :
                                    budgetHealth >= 50 ? 'linear-gradient(90deg, #61d0e8, #94e7ff)' :
                                        'linear-gradient(90deg, #ef4444, #f87171)',
                            }}
                        />
                    </div>
                    <div style={{ fontSize: 12, color: '#9aaec3', marginTop: 6 }}>
                        Bankroll Covers {budgetHealth.toFixed(0)}% Of Planned Buy-Ins
                    </div>
                </div>
            )}

            {viewMode === 'calendar' ? (
                <>
                    {/* Month Navigation */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
                        background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: '12px 16px',
                        border: '1px solid rgba(255,255,255,0.05)',
                    }}>
                        <button type="button" className="sd-button" aria-label="Previous Month" onClick={() => changeMonth(-1)}>‹</button>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#e2e8f0' }}>{formatDate(monthStart, { month: 'long', year: 'numeric' })}</div>
                        <button type="button" className="sd-button" aria-label="Next Month" onClick={() => changeMonth(1)}>›</button>
                    </div>

                    {/* Calendar Grid */}
                    <div style={{
                        background: 'var(--sd-surface)', border: '1px solid var(--sd-line)',
                        borderRadius: 16, overflow: 'hidden', marginBottom: 24,
                    }}>
                        {/* Day Headers */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            {weekdays.map(d => (
                                <div key={d} style={{ padding: '10px 4px', textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#9aaec3', textTransform: 'uppercase', letterSpacing: 1 }}>{d}</div>
                            ))}
                        </div>
                        {/* Day Cells */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                            {calendarDays.map((day, i) => {
                                const date = day ? calendarDate(currentYear, currentMonth, day) : null;
                                const dayEvents = date ? monthEvents.filter(ev => ev.date <= date && (ev.endDate || ev.date) >= date) : [];
                                const isToday = date === today;
                                return (
                                    <div key={i} style={{
                                        minHeight: 64, padding: '4px', borderRight: (i + 1) % 7 !== 0 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                                        background: isToday ? 'rgba(0,212,255,0.05)' : 'transparent',
                                    }}>
                                        {day && (
                                            <>
                                                <div style={{ fontSize: 12, fontWeight: isToday ? 900 : 600, color: isToday ? '#00d4ff' : '#94a3b8', textAlign: 'right', padding: '2px 4px' }}>{day}</div>
                                                {dayEvents.map(ev => (
                                                    <button
                                                        type="button"
                                                        key={ev.id}
                                                        aria-label={`${ev.name}, ${formatDate(date, fullDate)}`}
                                                        aria-expanded={selectedEvent?.id === ev.id}
                                                        aria-controls={selectedEvent?.id === ev.id ? detailId : undefined}
                                                        onClick={(click) => showDetails(ev, click.currentTarget)}
                                                        style={{
                                                            fontSize: 12, fontWeight: 800, color: '#fff',
                                                            display: 'block', width: '100%', border: 0, background: `${ev.color}80`, borderRadius: 3,
                                                            padding: '2px 4px', marginTop: 2, cursor: 'pointer',
                                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                        }}
                                                    >{ev.series}</button>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            ) : (
                /* List View */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                    {upcomingEvents.length === 0 && <p role="status">No Upcoming Tournaments.</p>}
                    {upcomingEvents.map(ev => (
                        <div key={ev.id} style={{
                            background: 'var(--sd-surface)', border: '1px solid var(--sd-line)', borderRadius: 14,
                            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                        }}>
                            <button
                                type="button"
                                aria-label={`View ${ev.name} Details`}
                                aria-describedby={`${detailId}-${ev.id}-meta ${detailId}-${ev.id}-cost`}
                                aria-expanded={selectedEvent?.id === ev.id}
                                aria-controls={selectedEvent?.id === ev.id ? detailId : undefined}
                                onClick={(click) => showDetails(ev, click.currentTarget)}
                                style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, padding: '6px 2px', border: 0, background: 'transparent', textAlign: 'start', font: 'inherit', cursor: 'pointer' }}
                            >
                                <span aria-hidden="true" style={{
                                    width: 40, height: 40, flexShrink: 0, borderRadius: 10, background: `${ev.color}15`,
                                    border: `1px solid ${ev.color}30`, display: 'grid', placeItems: 'center',
                                    fontSize: 12, fontWeight: 900, color: 'var(--sd-ice, #94e7ff)',
                                }}>{ev.series.substring(0, 3)}</span>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <strong style={{ display: 'block', fontSize: 14, color: '#e2e8f0' }}>{ev.name}</strong>
                                    <span id={`${detailId}-${ev.id}-meta`} style={{ fontSize: 12, color: '#9aaec3' }}>{ev.series} • {ev.location}</span>
                                </span>
                                <span id={`${detailId}-${ev.id}-cost`} style={{ textAlign: 'end' }}>
                                    <strong style={{ display: 'block', fontSize: 14, color: '#fff' }}>${ev.buyIn.toLocaleString()}</strong>
                                    <time dateTime={ev.date} style={{ fontSize: 12, color: '#9aaec3' }}>{formatDate(ev.date, { month: 'short', day: 'numeric' })}</time>
                                </span>
                            </button>
                            <button
                                type="button"
                                className="sd-button"
                                aria-label={`Favorite ${ev.name}`}
                                aria-pressed={interested.has(ev.id)}
                                onClick={() => toggleInterest(ev.id)}
                                style={{ minWidth: 44, minHeight: 44, padding: 0 }}
                            ><span aria-hidden="true">{interested.has(ev.id) ? '★' : '☆'}</span></button>
                        </div>
                    ))}
                </div>
            )}

            {/* Event Detail Panel */}
            {selectedEvent && (
                <motion.section
                    id={detailId}
                    aria-labelledby={`${detailId}-title`}
                    onKeyDown={(key) => { if (key.key === 'Escape') closeDetails(); }}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    style={{
                        background: 'rgba(0,0,0,0.3)', border: `1px solid ${selectedEvent.color}30`,
                        borderRadius: 16, padding: 24, marginBottom: 24,
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                        <div>
                            <h3 id={`${detailId}-title`} ref={detailTitle} tabIndex={-1} style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#e2e8f0' }}>{selectedEvent.name}</h3>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{selectedEvent.series} • {selectedEvent.location}</div>
                        </div>
                        <button type="button" className="sd-button" onClick={closeDetails} aria-label="Close Event Details">Close</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 112px), 1fr))', gap: 12, marginBottom: 16 }}>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 10 }}>
                            <div style={{ fontSize: 12, color: '#9aaec3', fontWeight: 800 }}>Buy-In</div>
                            <strong>${selectedEvent.buyIn.toLocaleString()}</strong>
                        </div>
                        {[['Start Date', selectedEvent.date], ['End Date', selectedEvent.endDate]].filter(([, date]) => date).map(([label, date]) => (
                            <div key={label} style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 10 }}>
                                <div style={{ fontSize: 12, color: '#9aaec3', fontWeight: 800 }}>{label}</div>
                                <time dateTime={date} style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0' }}>{formatDate(date, fullDate)}</time>
                            </div>
                        ))}
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 10 }}>
                            <div style={{ fontSize: 12, color: '#9aaec3', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>Prize Pool</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#4ade80', marginTop: 4 }}>{selectedEvent.prizePool}</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 10 }}>
                            <div style={{ fontSize: 12, color: '#9aaec3', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>% Of Bankroll</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: bankrollTotal > 0 && (selectedEvent.buyIn / bankrollTotal * 100) > 5 ? '#f45142' : '#e2e8f0', marginTop: 4 }}>
                                {bankrollTotal > 0 ? (selectedEvent.buyIn / bankrollTotal * 100).toFixed(1) : '-'}%
                            </div>
                        </div>
                    </div>
                    <button type="button" className="sd-button sd-primary" onClick={() => toggleInterest(selectedEvent.id)}>
                        {interested.has(selectedEvent.id) ? 'Remove From Plan' : 'Add To Bankroll Plan'}
                    </button>
                </motion.section>
            )}

            {/* Event count summary */}
            <div style={{ textAlign: 'center', fontSize: 12, color: '#9aaec3' }}>
                {monthEvents.length} Events In {formatDate(monthStart, { month: 'long' })} • {upcomingEvents.length} Total Upcoming
            </div>
        </div>
    );
}
