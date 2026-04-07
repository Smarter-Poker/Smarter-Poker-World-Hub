/**
 * VenueTournamentCalendar — Inline venue tournament calendar
 * Shows full weekly schedule + dated events scraped from venue websites.
 * Triggered by clicking "Calendar" button on the VenueCard.
 *
 * Features:
 *  - Day-of-week tabs (Mon–Sun) for recurring schedule
 *  - Monthly calendar view for specific dated events
 *  - Full tournament details: buy-in, stack, blinds, guarantee, format
 *  - Source provenance shown (links back to original schedule page)
 */

import { useState, useEffect, useCallback } from 'react';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const DAY_SHORT = { Monday:'Mon', Tuesday:'Tue', Wednesday:'Wed', Thursday:'Thu', Friday:'Fri', Saturday:'Sat', Sunday:'Sun' };
const TODAY_NAME = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];

function formatTime(t) {
    if (!t) return '';
    if (/am|pm/i.test(t)) return t.trim().toUpperCase();
    const m = t.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return t;
    let h = parseInt(m[1]);
    const min = m[2];
    const p = h >= 12 ? 'PM' : 'AM';
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return `${h}:${min} ${p}`;
}

function TournamentRow({ t }) {
    return (
        <div className="vtc-tournament-row">
            {/* Time */}
            <div className="vtc-time">{formatTime(t.start_time)}</div>

            {/* Details */}
            <div className="vtc-details">
                <div className="vtc-name">{t.display_name || t.tournament_name || 'Tournament'}</div>
                <div className="vtc-chips">
                    {t.buy_in_fmt && (
                        <span className="vtc-chip vtc-chip-buyin">{t.buy_in_fmt}</span>
                    )}
                    {t.game_type && t.game_type !== 'NLH' && (
                        <span className="vtc-chip vtc-chip-game">{t.game_type}</span>
                    )}
                    {t.format && (
                        <span className="vtc-chip vtc-chip-format">{t.format}</span>
                    )}
                    {t.guaranteed_fmt && (
                        <span className="vtc-chip vtc-chip-gtd">{t.guaranteed_fmt}</span>
                    )}
                </div>
                <div className="vtc-meta-row">
                    {t.starting_stack && (
                        <span className="vtc-meta">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
                            {t.starting_stack.toLocaleString()} chips
                        </span>
                    )}
                    {t.blind_levels && (
                        <span className="vtc-meta">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            {t.blind_levels}
                        </span>
                    )}
                    {t.rebuy_addon && (
                        <span className="vtc-meta">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/></svg>
                            {t.rebuy_addon}
                        </span>
                    )}
                    {t.late_registration && (
                        <span className="vtc-meta">Late Reg: {t.late_registration}</span>
                    )}
                </div>
            </div>
        </div>
    );
}

function WeeklyView({ weeklySchedule, activeDays }) {
    const [selectedDay, setSelectedDay] = useState(() => {
        // Default to today if it has events, otherwise first active day
        if (activeDays.includes(TODAY_NAME)) return TODAY_NAME;
        return activeDays[0] || 'Monday';
    });

    const dayEvents = (weeklySchedule[selectedDay] || []);

    return (
        <div className="vtc-weekly">
            {/* Day tabs */}
            <div className="vtc-day-tabs">
                {DAYS.map(day => {
                    const hasEvents = (weeklySchedule[day] || []).length > 0;
                    const isToday   = day === TODAY_NAME;
                    const isSelected = day === selectedDay;
                    return (
                        <button
                            key={day}
                            className={`vtc-day-tab ${isSelected ? 'active' : ''} ${isToday ? 'today' : ''} ${!hasEvents ? 'empty' : ''}`}
                            onClick={() => setSelectedDay(day)}
                            title={day}
                        >
                            <span className="vtc-day-short">{DAY_SHORT[day]}</span>
                            {hasEvents && (
                                <span className="vtc-day-count">{weeklySchedule[day].length}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Events for selected day */}
            <div className="vtc-day-events">
                {dayEvents.length === 0 ? (
                    <div className="vtc-empty">No tournaments on {selectedDay}</div>
                ) : (
                    dayEvents.map((t, i) => <TournamentRow key={t.id || i} t={t} />)
                )}
            </div>
        </div>
    );
}

function CalendarView({ calendar, calendarDates }) {
    // Group dates by month
    const byMonth = {};
    calendarDates.forEach(date => {
        const [y, m] = date.split('-');
        const key = `${y}-${m}`;
        if (!byMonth[key]) byMonth[key] = [];
        byMonth[key].push(date);
    });

    const months = Object.keys(byMonth).sort();
    const [expandedDate, setExpandedDate] = useState(calendarDates[0] || null);

    const monthNames = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];

    return (
        <div className="vtc-calendar">
            {months.length === 0 ? (
                <div className="vtc-empty">No upcoming events found</div>
            ) : months.map(monthKey => {
                const [y, m] = monthKey.split('-');
                const monthLabel = `${monthNames[parseInt(m)-1]} ${y}`;
                const dates = byMonth[monthKey];

                return (
                    <div key={monthKey} className="vtc-month">
                        <div className="vtc-month-header">{monthLabel}</div>
                        {dates.map(date => {
                            const events = calendar[date] || [];
                            if (events.length === 0) return null;

                            const d = new Date(date + 'T12:00:00Z');
                            const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
                            const dayNum  = d.getDate();
                            const isExpanded = expandedDate === date;
                            const isToday = date === new Date().toISOString().split('T')[0];

                            return (
                                <div key={date} className="vtc-date-block">
                                    <button
                                        className={`vtc-date-header ${isExpanded ? 'expanded' : ''} ${isToday ? 'today' : ''}`}
                                        onClick={() => setExpandedDate(isExpanded ? null : date)}
                                    >
                                        <span className="vtc-date-label">
                                            <span className="vtc-date-day">{dayName}</span>
                                            <span className="vtc-date-num">{dayNum}</span>
                                        </span>
                                        <span className="vtc-date-summary">
                                            {events.length} tournament{events.length !== 1 ? 's' : ''}
                                            {events[0]?.buy_in_fmt ? ` · from ${events[0].buy_in_fmt}` : ''}
                                        </span>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                                            <polyline points="6 9 12 15 18 9"/>
                                        </svg>
                                    </button>
                                    {isExpanded && (
                                        <div className="vtc-date-events">
                                            {events.map((t, i) => <TournamentRow key={t.id || i} t={t} />)}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}

export default function VenueTournamentCalendar({ venueId, venueName, onClose }) {
    const [data,       setData]       = useState(null);
    const [loading,    setLoading]    = useState(true);
    const [error,      setError]      = useState(null);
    const [view,       setView]       = useState('weekly'); // 'weekly' | 'calendar'

    const fetchCalendar = useCallback(async () => {
        if (!venueId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/poker/venue-tournament-calendar?venue_id=${venueId}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Failed to load');
            setData(json);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [venueId]);

    useEffect(() => { fetchCalendar(); }, [fetchCalendar]);

    return (
        <div className="vtc-container" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="vtc-header">
                <div className="vtc-header-left">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    <span className="vtc-title">Tournament Calendar</span>
                    {data?.stats && (
                        <span className="vtc-subtitle">
                            {data.stats.recurring_entries > 0 && `${data.stats.recurring_entries} weekly`}
                            {data.stats.dated_events > 0 && ` · ${data.stats.dated_events} events`}
                        </span>
                    )}
                </div>
                <div className="vtc-header-right">
                    {/* View toggle */}
                    {data?.has_data && (
                        <div className="vtc-view-toggle">
                            <button className={`vtc-toggle-btn ${view === 'weekly' ? 'active' : ''}`} onClick={() => setView('weekly')}>
                                Weekly
                            </button>
                            <button className={`vtc-toggle-btn ${view === 'calendar' ? 'active' : ''}`} onClick={() => setView('calendar')}>
                                Calendar
                            </button>
                        </div>
                    )}
                    {/* Close */}
                    {onClose && (
                        <button className="vtc-close" onClick={onClose} title="Close">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Stats bar */}
            {data?.stats && data.has_data && (
                <div className="vtc-stats-bar">
                    {data.stats.buy_in_range && (
                        <span className="vtc-stat">
                            Buy-In: {data.stats.buy_in_range.min === data.stats.buy_in_range.max
                                ? `$${data.stats.buy_in_range.min}`
                                : `$${data.stats.buy_in_range.min}–$${data.stats.buy_in_range.max}`
                            }
                        </span>
                    )}
                    {data.stats.max_guaranteed_fmt && (
                        <span className="vtc-stat vtc-stat-gtd">Max: {data.stats.max_guaranteed_fmt}</span>
                    )}
                    {data.stats.active_days > 0 && (
                        <span className="vtc-stat">{data.stats.active_days} days/week</span>
                    )}
                </div>
            )}

            {/* Body */}
            <div className="vtc-body">
                {loading && (
                    <div className="vtc-loading">
                        <div className="vtc-spinner" />
                        <span>Loading schedule...</span>
                    </div>
                )}
                {error && (
                    <div className="vtc-error">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                        <span>Could not load schedule: {error}</span>
                        <button className="vtc-retry" onClick={fetchCalendar}>Retry</button>
                    </div>
                )}
                {!loading && !error && data && !data.has_data && (
                    <div className="vtc-empty-state">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        <p>Schedule not yet available</p>
                        <span>Check back soon — we scrape venue schedules every 3 days</span>
                        {data.venue?.schedule_source_url && (
                            <a href={data.venue.schedule_source_url} target="_blank" rel="noopener noreferrer" className="vtc-source-link">
                                View on source site ↗
                            </a>
                        )}
                    </div>
                )}
                {!loading && !error && data?.has_data && (
                    view === 'weekly'
                        ? <WeeklyView weeklySchedule={data.weekly_schedule} activeDays={data.active_days} />
                        : <CalendarView calendar={data.calendar} calendarDates={data.calendar_dates} />
                )}
            </div>

            {/* Footer — source attribution */}
            {data?.venue?.schedule_source_url && (
                <div className="vtc-footer">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
                    <span>Source: </span>
                    <a href={data.venue.schedule_source_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="vtc-source-link">
                        {(() => { try { return new URL(data.venue.schedule_source_url).hostname; } catch { return 'venue'; }})()}
                    </a>
                    {data.venue.schedule_last_updated && (
                        <span className="vtc-updated"> · Updated {new Date(data.venue.schedule_last_updated).toLocaleDateString()}</span>
                    )}
                </div>
            )}

            <style jsx>{`
                .vtc-container {
                    background: rgba(8,12,20,0.97);
                    border-top: 1px solid rgba(74,222,128,0.2);
                    border-radius: 0 0 12px 12px;
                    margin: 8px -12px -12px;
                    overflow: hidden;
                    animation: vtcSlideIn 0.25s ease-out;
                }
                @keyframes vtcSlideIn {
                    from { opacity:0; transform: translateY(-8px); }
                    to   { opacity:1; transform: translateY(0); }
                }
                .vtc-header {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 10px 12px 8px;
                    background: rgba(74,222,128,0.05);
                    border-bottom: 1px solid rgba(255,255,255,0.06);
                }
                .vtc-header-left { display:flex; align-items:center; gap:6px; }
                .vtc-header-right { display:flex; align-items:center; gap:8px; }
                .vtc-title { font-size:12px; font-weight:700; color:#4ade80; text-transform:uppercase; letter-spacing:0.4px; }
                .vtc-subtitle { font-size:11px; color:rgba(255,255,255,0.35); }
                .vtc-view-toggle { display:flex; border-radius:6px; overflow:hidden; border:1px solid rgba(255,255,255,0.12); }
                .vtc-toggle-btn {
                    padding:3px 9px; font-size:11px; font-weight:600;
                    background:none; border:none; color:rgba(255,255,255,0.4); cursor:pointer;
                    transition: all 0.15s;
                }
                .vtc-toggle-btn.active { background:rgba(74,222,128,0.15); color:#4ade80; }
                .vtc-toggle-btn:hover:not(.active) { color:rgba(255,255,255,0.7); }
                .vtc-close { background:none; border:none; cursor:pointer; color:rgba(255,255,255,0.4); padding:2px; transition:color 0.15s; }
                .vtc-close:hover { color:#ffffff; }

                .vtc-stats-bar {
                    display:flex; gap:12px; padding:6px 12px;
                    background:rgba(0,0,0,0.2);
                    border-bottom:1px solid rgba(255,255,255,0.04);
                }
                .vtc-stat { font-size:10.5px; color:rgba(255,255,255,0.45); font-weight:500; }
                .vtc-stat-gtd { color:#4ade80; }

                .vtc-body { padding:0; }
                .vtc-loading { display:flex; align-items:center; gap:8px; padding:16px 12px; font-size:12px; color:rgba(255,255,255,0.4); }
                .vtc-spinner {
                    width:14px; height:14px; border:2px solid rgba(255,255,255,0.1);
                    border-top-color:#4ade80; border-radius:50%;
                    animation: spin 0.8s linear infinite;
                }
                @keyframes spin { to { transform:rotate(360deg); } }
                .vtc-error { display:flex; align-items:center; gap:6px; padding:12px; font-size:12px; color:#ef4444; }
                .vtc-retry { font-size:11px; color:#4ade80; background:none; border:none; cursor:pointer; text-decoration:underline; margin-left:4px; }

                .vtc-empty-state {
                    display:flex; flex-direction:column; align-items:center; gap:6px;
                    padding:24px 16px; text-align:center;
                }
                .vtc-empty-state p { font-size:13px; color:rgba(255,255,255,0.5); margin:0; font-weight:600; }
                .vtc-empty-state span { font-size:11px; color:rgba(255,255,255,0.25); }
                .vtc-empty { padding:12px; font-size:12px; color:rgba(255,255,255,0.3); text-align:center; }

                /* Weekly view */
                .vtc-day-tabs {
                    display:flex; gap:2px; padding:8px 12px 4px;
                    overflow-x:auto; -webkit-overflow-scrolling:touch;
                }
                .vtc-day-tab {
                    display:flex; flex-direction:column; align-items:center; gap:2px;
                    padding:5px 8px; border-radius:6px; border:1px solid transparent;
                    background:rgba(255,255,255,0.04); cursor:pointer;
                    transition:all 0.15s; flex-shrink:0;
                    color:rgba(255,255,255,0.35); font-size:10px; font-weight:600;
                    text-transform:uppercase;
                }
                .vtc-day-tab.active {
                    background:rgba(74,222,128,0.12);
                    border-color:rgba(74,222,128,0.3);
                    color:#4ade80;
                }
                .vtc-day-tab.today { border-color:rgba(255,255,255,0.2); }
                .vtc-day-tab.empty { opacity:0.35; }
                .vtc-day-tab:hover:not(.empty) { background:rgba(255,255,255,0.08); }
                .vtc-day-short { font-size:10px; font-weight:700; letter-spacing:0.3px; }
                .vtc-day-count {
                    font-size:9px; font-weight:800;
                    background:rgba(74,222,128,0.2); color:#4ade80;
                    border-radius:3px; padding:0 3px; min-width:14px; text-align:center;
                }
                .vtc-day-events { padding:4px 8px 8px; max-height:280px; overflow-y:auto; }

                /* Calendar view */
                .vtc-calendar { max-height:360px; overflow-y:auto; padding:4px 0; }
                .vtc-month { margin-bottom:4px; }
                .vtc-month-header {
                    font-size:10px; font-weight:700; text-transform:uppercase;
                    letter-spacing:0.6px; color:rgba(255,255,255,0.3);
                    padding:8px 12px 4px;
                }
                .vtc-date-block { border-bottom:1px solid rgba(255,255,255,0.04); }
                .vtc-date-header {
                    width:100%; display:flex; align-items:center; gap:8px;
                    padding:8px 12px; cursor:pointer;
                    background:none; border:none; color:#ffffff; text-align:left;
                    transition:background 0.15s;
                }
                .vtc-date-header:hover { background:rgba(255,255,255,0.04); }
                .vtc-date-header.today { background:rgba(74,222,128,0.06); }
                .vtc-date-label { display:flex; flex-direction:column; align-items:center; gap:1px; width:32px; flex-shrink:0; }
                .vtc-date-day { font-size:9px; font-weight:700; color:rgba(255,255,255,0.4); text-transform:uppercase; }
                .vtc-date-num { font-size:16px; font-weight:800; color:#ffffff; line-height:1; }
                .vtc-date-header.today .vtc-date-num { color:#4ade80; }
                .vtc-date-summary { flex:1; font-size:11.5px; color:rgba(255,255,255,0.6); }
                .vtc-date-events { padding:0 8px 8px 52px; border-top:1px solid rgba(255,255,255,0.04); }

                /* Tournament rows */
                .vtc-tournament-row {
                    display:flex; gap:10px; padding:8px 4px;
                    border-bottom:1px solid rgba(255,255,255,0.04);
                }
                .vtc-tournament-row:last-child { border-bottom:none; }
                .vtc-time {
                    font-size:11px; font-weight:800; color:#ffffff;
                    width:52px; flex-shrink:0; padding-top:1px;
                }
                .vtc-details { flex:1; min-width:0; }
                .vtc-name { font-size:12px; font-weight:600; color:#ffffff; margin-bottom:4px; }
                .vtc-chips { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:4px; }
                .vtc-chip {
                    font-size:10px; font-weight:700; padding:2px 6px;
                    border-radius:4px; border:1px solid;
                }
                .vtc-chip-buyin { background:rgba(255,255,255,0.1); color:#ffffff; border-color:rgba(255,255,255,0.2); }
                .vtc-chip-game  { background:rgba(139,92,246,0.1); color:#a78bfa; border-color:rgba(139,92,246,0.2); }
                .vtc-chip-format{ background:rgba(6,182,212,0.1); color:#22d3ee; border-color:rgba(6,182,212,0.2); }
                .vtc-chip-gtd   { background:rgba(74,222,128,0.1); color:#4ade80; border-color:rgba(74,222,128,0.2); }
                .vtc-meta-row { display:flex; flex-wrap:wrap; gap:8px; }
                .vtc-meta { display:flex; align-items:center; gap:3px; font-size:10px; color:rgba(255,255,255,0.35); }

                .vtc-footer {
                    display:flex; align-items:center; gap:4px;
                    padding:6px 12px; font-size:10px; color:rgba(255,255,255,0.25);
                    border-top:1px solid rgba(255,255,255,0.04);
                    background:rgba(0,0,0,0.2);
                }
                .vtc-source-link { color:rgba(74,222,128,0.6); text-decoration:none; }
                .vtc-source-link:hover { color:#4ade80; text-decoration:underline; }
                .vtc-updated { color:rgba(255,255,255,0.2); }
            `}</style>
        </div>
    );
}
