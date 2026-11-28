/**
 * TournamentCalendar — Tournament Series Calendar
 * ═══════════════════════════════════════════════════════════════════════════
 * Monthly calendar and list of real tournament series (from /api/poker/series,
 * the same schedule the Poker Near Me series pages use), with a saved bankroll
 * plan. Series dates are civil days and never pass through a time zone.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { localDay } from '../../lib/bankroll/localDates.mjs';
import {
    PLAN_STORAGE_KEY,
    calendarDate,
    eventsInMonth,
    normalizeSchedule,
    planBudget,
    readPlan,
    runsOn,
    scheduleUrl,
    togglePlan,
    upcomingEvents as upcomingFrom,
} from '../../lib/bankroll/tournamentSchedule.mjs';

function formatDate(date, options) {
    return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });
}

const fullDate = { month: 'long', day: 'numeric', year: 'numeric' };
const MAX_CHIPS = 2;
const LIST_PAGE = 25;
// August 1, 2021 was a Sunday, the first column of this calendar.
const weekdays = Array.from({ length: 7 }, (_, index) =>
    formatDate(calendarDate(2021, 7, index + 1), { weekday: 'short' })
);
const buyInText = (ev) => (ev.buyIn == null ? 'Buy-In TBA' : `$${ev.buyIn.toLocaleString()}`);

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function TournamentCalendar({ bankrollTotal = 0 }) {
    const [visibleMonth, setVisibleMonth] = useState(() => new Date());
    const currentMonth = visibleMonth.getMonth();
    const currentYear = visibleMonth.getFullYear();
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [selectedDay, setSelectedDay] = useState(null);
    const [plan, setPlan] = useState([]);
    const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'list'
    const [schedules, setSchedules] = useState({}); // year -> { status, events }
    const [listCount, setListCount] = useState(LIST_PAGE);

    const detailId = useId();
    const detailTitle = useRef(null);
    const opener = useRef(null);
    const today = localDay();
    const todayYear = Number(today.slice(0, 4));
    const monthStart = calendarDate(currentYear, currentMonth, 1);

    // The saved plan survives leaving the page.
    useEffect(() => {
        try { setPlan(readPlan(window.localStorage.getItem(PLAN_STORAGE_KEY))); } catch { /* storage unavailable */ }
    }, []);
    const savePlan = (next) => {
        setPlan(next);
        try { window.localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    };

    const requested = useRef(new Set());
    const loadYear = useCallback((year, force = false) => {
        if (requested.current.has(year) && !force) return;
        requested.current.add(year);
        setSchedules(prev => ({ ...prev, [year]: { status: 'loading', events: prev[year]?.events || [] } }));
        fetch(scheduleUrl(year))
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then(body => {
                if (!body || body.success === false || !Array.isArray(body.data)) throw new Error('Bad response');
                setSchedules(p => ({ ...p, [year]: { status: 'ready', events: normalizeSchedule(body.data) } }));
            })
            .catch(err => {
                console.warn('Could not load tournament schedule:', err);
                requested.current.delete(year);
                setSchedules(p => ({ ...p, [year]: { status: 'error', events: [] } }));
            });
    }, []);

    const neededYears = useMemo(() => (
        viewMode === 'list' ? [todayYear, todayYear + 1] : [currentYear]
    ), [viewMode, todayYear, currentYear]);
    useEffect(() => { neededYears.forEach(y => loadYear(y)); }, [neededYears, loadYear]);

    const statusOf = neededYears.map(y => schedules[y]?.status || 'loading');
    const isLoading = statusOf.includes('loading');
    const hasError = statusOf.includes('error');
    const retry = () => neededYears.forEach(y => { if (schedules[y]?.status === 'error') loadYear(y, true); });

    const eventById = useMemo(() => {
        const map = new Map();
        Object.values(schedules).forEach(sch => sch.events.forEach(ev => map.set(ev.id, ev)));
        return map;
    }, [schedules]);
    const events = useMemo(() => [...eventById.values()].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)), [eventById]);

    const monthEvents = useMemo(() => eventsInMonth(events, currentYear, currentMonth), [events, currentYear, currentMonth]);
    const upcoming = useMemo(() => upcomingFrom(events, today), [events, today]);
    const dayEventsSelected = useMemo(() => (selectedDay ? monthEvents.filter(ev => runsOn(ev, selectedDay)) : []), [selectedDay, monthEvents]);

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

    const planIds = useMemo(() => new Set(plan.map(p => p.id)), [plan]);
    const budget = planBudget(plan, bankrollTotal);
    const totalBudgetNeeded = budget.total;
    const budgetHealth = budget.coverage;
    const toggleInterest = (ev) => savePlan(togglePlan(plan, ev));

    const changeMonth = (offset) => {
        setSelectedEvent(null);
        setSelectedDay(null);
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

    const statusLine = isLoading ? (
        <p role="status" style={{ fontSize: 13, color: '#9aaec3', margin: '0 0 12px' }}>Loading Tournament Schedule...</p>
    ) : hasError ? (
        <div role="alert" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, fontSize: 13, color: '#fca5a5', marginBottom: 12 }}>
            Could Not Load The Tournament Schedule.
            <button type="button" className="sd-button" onClick={retry}>Retry</button>
        </div>
    ) : null;

    const listed = upcoming.slice(0, listCount);

    return (
        <div className="sd-panel">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#e2e8f0', letterSpacing: '-0.3px' }}>Tournament Calendar</div>
                    <div style={{ fontSize: 12, color: '#9aaec3' }}>Live Series Schedules & Budget Planning</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="sd-button" aria-pressed={viewMode === 'calendar'} onClick={() => changeView('calendar')}>Calendar</button>
                    <button type="button" className="sd-button" aria-pressed={viewMode === 'list'} onClick={() => changeView('list')}>List</button>
                </div>
            </div>

            {/* Budget Planner Bar */}
            {plan.length > 0 && (
                <div style={{
                    background: 'linear-gradient(135deg, rgba(71, 149, 243,0.08), rgba(0,0,0,0.2))',
                    border: '1px solid rgba(71, 149, 243,0.2)', borderRadius: 16, padding: '16px 20px', marginBottom: 20,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#e2e8f0' }}>Budget Planner - {plan.length} {plan.length === 1 ? 'Event' : 'Events'}</div>
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
                        {totalBudgetNeeded > 0
                            ? `Bankroll Covers ${budgetHealth.toFixed(0)}% Of Planned Main Event Buy-Ins`
                            : 'No Listed Buy-Ins In Your Plan Yet'}
                        {budget.unknownCount > 0 && ` • ${budget.unknownCount} Without A Listed Buy-In`}
                    </div>
                    <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {plan.map(p => (
                            <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#cbd5e1' }}>
                                <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                                    {p.name} • {formatDate(p.date, { month: 'short', day: 'numeric' })} • {buyInText(p)}
                                </span>
                                <button type="button" className="sd-button" aria-label={`Remove ${p.name} From Plan`} onClick={() => toggleInterest(p)} style={{ minWidth: 44, minHeight: 44, padding: 0 }}>
                                    <span aria-hidden="true">✕</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {statusLine}

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
                                <div key={d} style={{ padding: '10px 2px', textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#9aaec3', textTransform: 'uppercase' }}>{d}</div>
                            ))}
                        </div>
                        {/* Day Cells */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                            {calendarDays.map((day, i) => {
                                const date = day ? calendarDate(currentYear, currentMonth, day) : null;
                                const dayEvents = date ? monthEvents.filter(ev => runsOn(ev, date)) : [];
                                const isToday = date === today;
                                const isSelected = date && date === selectedDay;
                                const extra = dayEvents.length - MAX_CHIPS;
                                return (
                                    <div key={i} style={{
                                        minHeight: 64, padding: '4px 2px', minWidth: 0,
                                        borderRight: (i + 1) % 7 !== 0 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                                        background: isSelected ? 'rgba(71,149,243,0.12)' : isToday ? 'rgba(0,212,255,0.05)' : 'transparent',
                                    }}>
                                        {day && (
                                            <>
                                                <div style={{ fontSize: 12, fontWeight: isToday ? 900 : 600, color: isToday ? '#00d4ff' : '#94a3b8', textAlign: 'right', padding: '2px 4px' }}>{day}</div>
                                                {dayEvents.slice(0, MAX_CHIPS).map(ev => (
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
                                                            padding: '2px 3px', marginTop: 2, cursor: 'pointer',
                                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                        }}
                                                    >{ev.series}</button>
                                                ))}
                                                {extra > 0 && (
                                                    <button
                                                        type="button"
                                                        aria-label={`Show all ${dayEvents.length} series on ${formatDate(date, fullDate)}`}
                                                        aria-pressed={!!isSelected}
                                                        onClick={() => setSelectedDay(isSelected ? null : date)}
                                                        style={{
                                                            fontSize: 12, fontWeight: 800, color: '#94e7ff', display: 'block', width: '100%',
                                                            border: 0, background: 'transparent', padding: '2px 0', marginTop: 2, cursor: 'pointer',
                                                        }}
                                                    >+{extra}</button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {selectedDay && (
                        <section aria-label={`Series on ${formatDate(selectedDay, fullDate)}`} style={{ marginBottom: 24 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <div style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0' }}>{formatDate(selectedDay, fullDate)} • {dayEventsSelected.length} Series</div>
                                <button type="button" className="sd-button" onClick={() => setSelectedDay(null)}>Close</button>
                            </div>
                            <EventList events={dayEventsSelected} planIds={planIds} detailId={detailId} selectedEvent={selectedEvent} onShow={showDetails} onToggle={toggleInterest} />
                        </section>
                    )}
                </>
            ) : (
                /* List View */
                <div style={{ marginBottom: 24 }}>
                    {!isLoading && !hasError && upcoming.length === 0 && <p role="status" style={{ fontSize: 14, color: '#9aaec3' }}>No Upcoming Tournament Series Are Listed Yet.</p>}
                    <EventList events={listed} planIds={planIds} detailId={detailId} selectedEvent={selectedEvent} onShow={showDetails} onToggle={toggleInterest} />
                    {upcoming.length > listed.length && (
                        <button type="button" className="sd-button" style={{ marginTop: 12, width: '100%' }} onClick={() => setListCount(c => c + LIST_PAGE)}>
                            Show More ({upcoming.length - listed.length} Left)
                        </button>
                    )}
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
                        borderRadius: 16, padding: 20, marginBottom: 24,
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                        <div style={{ minWidth: 0 }}>
                            <h3 id={`${detailId}-title`} ref={detailTitle} tabIndex={-1} style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#e2e8f0', overflowWrap: 'anywhere' }}>{selectedEvent.name}</h3>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, overflowWrap: 'anywhere' }}>{selectedEvent.series} • {selectedEvent.location}</div>
                        </div>
                        <button type="button" className="sd-button" onClick={closeDetails} aria-label="Close Event Details">Close</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 112px), 1fr))', gap: 12, marginBottom: 16 }}>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 10 }}>
                            <div style={{ fontSize: 12, color: '#9aaec3', fontWeight: 800 }}>Main Event Buy-In</div>
                            <strong>{selectedEvent.buyIn == null ? 'Not Listed' : `$${selectedEvent.buyIn.toLocaleString()}`}</strong>
                        </div>
                        {[['Start Date', selectedEvent.date], ['End Date', selectedEvent.endDate !== selectedEvent.date ? selectedEvent.endDate : null]].filter(([, date]) => date).map(([label, date]) => (
                            <div key={label} style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 10 }}>
                                <div style={{ fontSize: 12, color: '#9aaec3', fontWeight: 800 }}>{label}</div>
                                <time dateTime={date} style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0' }}>{formatDate(date, fullDate)}</time>
                            </div>
                        ))}
                        {selectedEvent.guaranteed && (
                            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 10 }}>
                                <div style={{ fontSize: 12, color: '#9aaec3', fontWeight: 800 }}>Guaranteed</div>
                                <div style={{ fontSize: 13, fontWeight: 800, color: '#4ade80', marginTop: 4 }}>{selectedEvent.guaranteed}</div>
                            </div>
                        )}
                        {selectedEvent.eventCount && (
                            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 10 }}>
                                <div style={{ fontSize: 12, color: '#9aaec3', fontWeight: 800 }}>Events</div>
                                <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0', marginTop: 4 }}>{selectedEvent.eventCount}</div>
                            </div>
                        )}
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 10 }}>
                            <div style={{ fontSize: 12, color: '#9aaec3', fontWeight: 800 }}>% Of Bankroll</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: bankrollTotal > 0 && selectedEvent.buyIn != null && (selectedEvent.buyIn / bankrollTotal * 100) > 5 ? '#f45142' : '#e2e8f0', marginTop: 4 }}>
                                {bankrollTotal > 0 && selectedEvent.buyIn != null ? `${(selectedEvent.buyIn / bankrollTotal * 100).toFixed(1)}%` : '-'}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        <button type="button" className="sd-button sd-primary" onClick={() => toggleInterest(selectedEvent)}>
                            {planIds.has(selectedEvent.id) ? 'Remove From Plan' : 'Add To Bankroll Plan'}
                        </button>
                        {selectedEvent.sourceUrl && /^https?:\/\//.test(selectedEvent.sourceUrl) && (
                            <a className="sd-button" href={selectedEvent.sourceUrl} target="_blank" rel="noopener noreferrer">Official Schedule</a>
                        )}
                    </div>
                </motion.section>
            )}

            {/* Event count summary */}
            <div style={{ textAlign: 'center', fontSize: 12, color: '#9aaec3' }}>
                {viewMode === 'calendar'
                    ? `${monthEvents.length} Series In ${formatDate(monthStart, { month: 'long' })}`
                    : `${upcoming.length} Upcoming Series`}
            </div>
        </div>
    );
}

function EventList({ events, planIds, detailId, selectedEvent, onShow, onToggle }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {events.map(ev => (
                <div key={ev.id} style={{
                    background: 'var(--sd-surface)', border: '1px solid var(--sd-line)', borderRadius: 14,
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', minWidth: 0,
                }}>
                    <button
                        type="button"
                        aria-label={`View ${ev.name} Details`}
                        aria-describedby={`${detailId}-${ev.id}-meta ${detailId}-${ev.id}-cost`}
                        aria-expanded={selectedEvent?.id === ev.id}
                        aria-controls={selectedEvent?.id === ev.id ? detailId : undefined}
                        onClick={(click) => onShow(ev, click.currentTarget)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, padding: '6px 2px', border: 0, background: 'transparent', textAlign: 'start', font: 'inherit', cursor: 'pointer' }}
                    >
                        <span aria-hidden="true" style={{
                            width: 40, height: 40, flexShrink: 0, borderRadius: 10, background: `${ev.color}15`,
                            border: `1px solid ${ev.color}30`, display: 'grid', placeItems: 'center',
                            fontSize: 12, fontWeight: 900, color: 'var(--sd-ice, #94e7ff)', overflow: 'hidden',
                        }}>{ev.series.substring(0, 3)}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <strong style={{ display: 'block', fontSize: 14, color: '#e2e8f0', overflowWrap: 'anywhere' }}>{ev.name}</strong>
                            <span id={`${detailId}-${ev.id}-meta`} style={{ display: 'block', fontSize: 12, color: '#9aaec3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.location}</span>
                        </span>
                        <span id={`${detailId}-${ev.id}-cost`} style={{ textAlign: 'end', flexShrink: 0 }}>
                            <strong style={{ display: 'block', fontSize: 14, color: '#fff' }}>{buyInText(ev)}</strong>
                            <time dateTime={ev.date} style={{ fontSize: 12, color: '#9aaec3' }}>
                                {formatDate(ev.date, { month: 'short', day: 'numeric' })}
                                {ev.endDate !== ev.date && ` - ${formatDate(ev.endDate, { month: 'short', day: 'numeric' })}`}
                            </time>
                        </span>
                    </button>
                    <button
                        type="button"
                        className="sd-button"
                        aria-label={`Add ${ev.name} To Plan`}
                        aria-pressed={planIds.has(ev.id)}
                        onClick={() => onToggle(ev)}
                        style={{ minWidth: 44, minHeight: 44, padding: 0, flexShrink: 0 }}
                    ><span aria-hidden="true">{planIds.has(ev.id) ? '★' : '☆'}</span></button>
                </div>
            ))}
        </div>
    );
}
