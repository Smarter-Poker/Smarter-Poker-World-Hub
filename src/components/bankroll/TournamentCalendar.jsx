/**
 * TournamentCalendar — Major Series Event Calendar
 * ═══════════════════════════════════════════════════════════════════════════
 * Monthly calendar view showing upcoming series events (WSOP, WPT, etc.)
 * with budget planner and bankroll health integration.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════
// TOURNAMENT SERIES DATA — 2026 Major Events
// ═══════════════════════════════════════════════════════════════════════════

const SERIES_EVENTS = [
    // WSOP 2026
    { id: 'wsop-main', series: 'WSOP', name: 'Main Event', buyIn: 10000, date: '2026-06-28', endDate: '2026-07-15', location: 'Las Vegas, NV', color: '#d4a843', prizePool: '90M+' },
    { id: 'wsop-colossus', series: 'WSOP', name: 'Colossus', buyIn: 400, date: '2026-06-05', endDate: '2026-06-08', location: 'Las Vegas, NV', color: '#d4a843', prizePool: '5M+' },
    { id: 'wsop-mil', series: 'WSOP', name: 'The Millionaire Maker', buyIn: 1500, date: '2026-06-12', endDate: '2026-06-15', location: 'Las Vegas, NV', color: '#d4a843', prizePool: '12M+' },
    { id: 'wsop-senior', series: 'WSOP', name: 'Seniors Championship', buyIn: 1000, date: '2026-06-20', endDate: '2026-06-22', location: 'Las Vegas, NV', color: '#d4a843', prizePool: '5M+' },
    // WPT 2026
    { id: 'wpt-borg', series: 'WPT', name: 'Borgata Open', buyIn: 3500, date: '2026-03-15', endDate: '2026-03-20', location: 'Atlantic City, NJ', color: '#e5383b', prizePool: '3M+' },
    { id: 'wpt-la', series: 'WPT', name: 'WPT Los Angeles', buyIn: 5000, date: '2026-04-10', endDate: '2026-04-15', location: 'Commerce, CA', color: '#e5383b', prizePool: '5M+' },
    { id: 'wpt-champ', series: 'WPT', name: 'WPT Championship', buyIn: 10400, date: '2026-12-10', endDate: '2026-12-17', location: 'Las Vegas, NV', color: '#e5383b', prizePool: '15M+' },
    // Other Series
    { id: 'gg-wsop-online', series: 'GGPoker', name: 'WSOP Online Series', buyIn: 50, date: '2026-07-01', endDate: '2026-08-15', location: 'Online', color: '#1e88e5', prizePool: '100M+' },
    { id: 'mspt-vb', series: 'MSPT', name: 'Venetian $1,100', buyIn: 1100, date: '2026-05-20', endDate: '2026-05-24', location: 'Las Vegas, NV', color: '#8e24aa', prizePool: '2M+' },
    { id: 'wynn-mil', series: 'Wynn', name: 'Wynn Millions', buyIn: 10000, date: '2026-04-01', endDate: '2026-04-12', location: 'Las Vegas, NV', color: '#c62828', prizePool: '10M+' },
    { id: 'shrb', series: 'SHRB', name: 'Super High Roller Bowl', buyIn: 300000, date: '2026-05-05', endDate: '2026-05-10', location: 'Las Vegas, NV', color: '#ffd700', prizePool: '20M+' },
    { id: 'runup', series: 'PokerStars', name: 'Run It Up Reno', buyIn: 600, date: '2026-09-15', endDate: '2026-09-22', location: 'Reno, NV', color: '#d63384', prizePool: '1M+' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function TournamentCalendar({ bankrollTotal = 0 }) {
    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [interested, setInterested] = useState(new Set());
    const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'list'

    // Events for current month
    const monthEvents = useMemo(() => {
        return SERIES_EVENTS.filter(e => {
            const d = new Date(e.date);
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        }).sort((a, b) => new Date(a.date) - new Date(b.date));
    }, [currentMonth, currentYear]);

    // All upcoming events
    const upcomingEvents = useMemo(() => {
        const now = new Date();
        return SERIES_EVENTS.filter(e => new Date(e.endDate || e.date) >= now)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    }, []);

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

    const prevMonth = () => {
        if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
        else setCurrentMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
        else setCurrentMonth(m => m + 1);
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

    const getEventsForDay = (day) => {
        if (!day) return [];
        return monthEvents.filter(e => {
            const startDay = new Date(e.date).getDate();
            const endDay = e.endDate ? new Date(e.endDate).getDate() : startDay;
            const eventMonth = new Date(e.date).getMonth();
            return eventMonth === currentMonth && day >= startDay && day <= endDay;
        });
    };

    return (
        <div style={{ padding: '0 0 40px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#e2e8f0', letterSpacing: '-0.3px' }}>Tournament Calendar</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Major series schedules & budget planning</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setViewMode('calendar')} style={{ background: viewMode === 'calendar' ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${viewMode === 'calendar' ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'}`, color: viewMode === 'calendar' ? '#00d4ff' : '#64748b', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Calendar</button>
                    <button onClick={() => setViewMode('list')} style={{ background: viewMode === 'list' ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${viewMode === 'list' ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'}`, color: viewMode === 'list' ? '#00d4ff' : '#64748b', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>List</button>
                </div>
            </div>

            {/* Budget Planner Bar */}
            {interestedEvents.length > 0 && (
                <div style={{
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(0,0,0,0.2))',
                    border: '1px solid rgba(99,102,241,0.2)', borderRadius: 16, padding: '16px 20px', marginBottom: 20,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#e2e8f0' }}>Budget Planner — {interestedEvents.length} Events</div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: budgetHealth >= 100 ? '#4ade80' : budgetHealth >= 50 ? '#fbbf24' : '#f87171' }}>
                            ${totalBudgetNeeded.toLocaleString()} needed
                        </div>
                    </div>
                    <div style={{ height: 6, background: 'rgba(0,0,0,0.4)', borderRadius: 3, overflow: 'hidden' }}>
                        <motion.div
                            initial={{ width: 0 }} animate={{ width: `${Math.min(budgetHealth, 100)}%` }}
                            style={{
                                height: '100%', borderRadius: 3,
                                background: budgetHealth >= 100 ? 'linear-gradient(90deg, #22c55e, #4ade80)' :
                                    budgetHealth >= 50 ? 'linear-gradient(90deg, #eab308, #fbbf24)' :
                                        'linear-gradient(90deg, #ef4444, #f87171)',
                            }}
                        />
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>
                        Bankroll covers {budgetHealth.toFixed(0)}% of planned buy-ins
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
                        <button onClick={prevMonth} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 16 }}>‹</button>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#e2e8f0' }}>{MONTHS[currentMonth]} {currentYear}</div>
                        <button onClick={nextMonth} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 16 }}>›</button>
                    </div>

                    {/* Calendar Grid */}
                    <div style={{
                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 16, overflow: 'hidden', marginBottom: 24,
                    }}>
                        {/* Day Headers */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                <div key={d} style={{ padding: '10px 4px', textAlign: 'center', fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>{d}</div>
                            ))}
                        </div>
                        {/* Day Cells */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                            {calendarDays.map((day, i) => {
                                const dayEvents = getEventsForDay(day);
                                const isToday = day && new Date().getDate() === day && new Date().getMonth() === currentMonth && new Date().getFullYear() === currentYear;
                                return (
                                    <div key={i} style={{
                                        minHeight: 64, padding: '4px', borderRight: (i + 1) % 7 !== 0 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                                        background: isToday ? 'rgba(0,212,255,0.05)' : 'transparent',
                                    }}>
                                        {day && (
                                            <>
                                                <div style={{ fontSize: 11, fontWeight: isToday ? 900 : 600, color: isToday ? '#00d4ff' : '#94a3b8', textAlign: 'right', padding: '2px 4px' }}>{day}</div>
                                                {dayEvents.map(ev => (
                                                    <div
                                                        key={ev.id}
                                                        onClick={() => setSelectedEvent(selectedEvent?.id === ev.id ? null : ev)}
                                                        style={{
                                                            fontSize: 8, fontWeight: 800, color: '#fff',
                                                            background: `${ev.color}80`, borderRadius: 3,
                                                            padding: '2px 4px', marginTop: 2, cursor: 'pointer',
                                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                        }}
                                                    >{ev.series}</div>
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
                    {upcomingEvents.map(ev => (
                        <div key={ev.id} style={{
                            background: 'rgba(255,255,255,0.02)', border: `1px solid ${interested.has(ev.id) ? `${ev.color}40` : 'rgba(255,255,255,0.06)'}`,
                            borderRadius: 14, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            cursor: 'pointer',
                        }} onClick={() => setSelectedEvent(selectedEvent?.id === ev.id ? null : ev)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <div style={{
                                    width: 40, height: 40, borderRadius: 10, background: `${ev.color}15`,
                                    border: `1px solid ${ev.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 12, fontWeight: 900, color: ev.color,
                                }}>{ev.series.substring(0, 3)}</div>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0' }}>{ev.name}</div>
                                    <div style={{ fontSize: 11, color: '#64748b' }}>{ev.series} • {ev.location}</div>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 900, color: '#fff' }}>${ev.buyIn.toLocaleString()}</div>
                                    <div style={{ fontSize: 10, color: '#64748b' }}>{new Date(ev.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleInterest(ev.id); }}
                                    style={{
                                        background: interested.has(ev.id) ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)',
                                        border: `1px solid ${interested.has(ev.id) ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
                                        borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
                                        color: interested.has(ev.id) ? '#4ade80' : '#64748b', fontSize: 14,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                >{interested.has(ev.id) ? '★' : '☆'}</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Event Detail Panel */}
            {selectedEvent && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    style={{
                        background: 'rgba(0,0,0,0.3)', border: `1px solid ${selectedEvent.color}30`,
                        borderRadius: 16, padding: 24, marginBottom: 24,
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                        <div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: '#e2e8f0' }}>{selectedEvent.name}</div>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{selectedEvent.series} • {selectedEvent.location}</div>
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: selectedEvent.color }}>${selectedEvent.buyIn.toLocaleString()}</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 10 }}>
                            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>Start Date</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0', marginTop: 4 }}>
                                {new Date(selectedEvent.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                            </div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 10 }}>
                            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>Prize Pool</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#4ade80', marginTop: 4 }}>{selectedEvent.prizePool}</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 10 }}>
                            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>% of Bankroll</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: bankrollTotal > 0 && (selectedEvent.buyIn / bankrollTotal * 100) > 5 ? '#f87171' : '#e2e8f0', marginTop: 4 }}>
                                {bankrollTotal > 0 ? (selectedEvent.buyIn / bankrollTotal * 100).toFixed(1) : '—'}%
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => toggleInterest(selectedEvent.id)}
                        style={{
                            width: '100%', padding: '12px', borderRadius: 10,
                            background: interested.has(selectedEvent.id) ? 'rgba(239,68,68,0.1)' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                            border: interested.has(selectedEvent.id) ? '1px solid rgba(239,68,68,0.2)' : 'none',
                            color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
                        }}
                    >{interested.has(selectedEvent.id) ? '✕ Remove from Plan' : '★ Add to Bankroll Plan'}</button>
                </motion.div>
            )}

            {/* Event count summary */}
            <div style={{ textAlign: 'center', fontSize: 11, color: '#64748b' }}>
                {monthEvents.length} events in {MONTHS[currentMonth]} • {upcomingEvents.length} total upcoming
            </div>
        </div>
    );
}
