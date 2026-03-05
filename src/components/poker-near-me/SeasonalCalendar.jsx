/**
 * SeasonalCalendar.jsx — Feature #15: Seasonal Calendar Mode
 * Full-page 12-month calendar showing all series, tours, and daily events.
 */
import React, { useState, useMemo } from 'react';

const TOUR_COLORS_MAP = {
    wsop: { bg: '#d4a853', text: '#000' },
    wpt: { bg: '#ef4444', text: '#fff' },
    mspt: { bg: '#3b82f6', text: '#fff' },
    bestbet: { bg: '#22c55e', text: '#000' },
    ept: { bg: '#8b5cf6', text: '#fff' },
    rgps: { bg: '#f59e0b', text: '#000' },
    hpt: { bg: '#ec4899', text: '#fff' },
    default: { bg: '#6b7280', text: '#fff' },
};

function getColor(tourCode) {
    return TOUR_COLORS_MAP[tourCode?.toLowerCase()] || TOUR_COLORS_MAP.default;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const FILTER_OPTIONS = {
    type: ['All', 'Major', 'Circuit', 'Regional', 'High Roller'],
    buyinRange: ['All', 'Under $300', '$300-$1000', '$1000+'],
};

export default function SeasonalCalendar({ series = [], tours = [], dailyTournaments = [] }) {
    const today = new Date();
    const [selectedDay, setSelectedDay] = useState(null);
    const [filterType, setFilterType] = useState('All');
    const [filterBuyin, setFilterBuyin] = useState('All');
    const [expandedMonth, setExpandedMonth] = useState(today.getMonth());

    // Build event list combining series + tours
    const allEvents = useMemo(() => {
        let events = [...series.map(s => ({ ...s, eventType: 'series' }))];

        // Type filter
        if (filterType !== 'All') {
            const typeKey = filterType.toLowerCase().replace(' ', '_');
            events = events.filter(e => (e.type || e.tour_type || '').toLowerCase().includes(typeKey));
        }

        // Buy-in filter
        if (filterBuyin !== 'All') {
            events = events.filter(e => {
                const buyin = e.buy_in || e.buyin || 0;
                if (filterBuyin === 'Under $300') return buyin < 300;
                if (filterBuyin === '$300-$1000') return buyin >= 300 && buyin <= 1000;
                if (filterBuyin === '$1000+') return buyin > 1000;
                return true;
            });
        }

        return events;
    }, [series, filterType, filterBuyin]);

    // Generate 12 months starting from current month
    const months = useMemo(() => {
        return Array.from({ length: 12 }, (_, i) => {
            const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
            return {
                year: d.getFullYear(),
                month: d.getMonth(),
                label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
                daysInMonth: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),
                firstDay: d.getDay(),
            };
        });
    }, []);

    // Get events for a specific date
    const getEventsForDate = (year, month, day) => {
        const date = new Date(year, month, day);
        return allEvents.filter(e => {
            if (!e.start_date) return false;
            const start = new Date(e.start_date);
            const end = e.end_date ? new Date(e.end_date) : start;
            const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
            const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
            return date >= startDay && date <= endDay;
        });
    };

    // Get events for selected day
    const selectedEvents = selectedDay
        ? getEventsForDate(selectedDay.year, selectedDay.month, selectedDay.day)
        : [];

    // Count total events per month for quick overview
    const getMonthEventCount = (mo) => {
        let count = 0;
        for (let d = 1; d <= mo.daysInMonth; d++) {
            if (getEventsForDate(mo.year, mo.month, d).length > 0) count++;
        }
        return count;
    };

    return (
        <div className="seasonal-cal">
            <div className="sc-header">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                    <circle cx="8" cy="14" r="1.5" fill="#22c55e" stroke="none" />
                    <circle cx="12" cy="14" r="1.5" fill="#3b82f6" stroke="none" />
                    <circle cx="16" cy="14" r="1.5" fill="#d4a853" stroke="none" />
                    <circle cx="8" cy="18" r="1.5" fill="#ef4444" stroke="none" />
                    <circle cx="12" cy="18" r="1.5" fill="#8b5cf6" stroke="none" />
                </svg>
                <h2>Seasonal Calendar</h2>
                <span className="sc-event-count">{allEvents.length} events</span>
            </div>

            {/* Filters */}
            <div className="sc-filters">
                <div className="sc-filter-group">
                    <span className="sc-filter-label">Type:</span>
                    {FILTER_OPTIONS.type.map(t => (
                        <button key={t} className={'sc-filter-chip' + (filterType === t ? ' active' : '')} onClick={() => setFilterType(t)}>{t}</button>
                    ))}
                </div>
                <div className="sc-filter-group" style={{ marginTop: 8 }}>
                    <span className="sc-filter-label">Buy-In:</span>
                    {FILTER_OPTIONS.buyinRange.map(b => (
                        <button key={b} className={'sc-filter-chip' + (filterBuyin === b ? ' active' : '')} onClick={() => setFilterBuyin(b)}>{b}</button>
                    ))}
                </div>
            </div>

            {/* Legend */}
            <div className="sc-legend">
                {Object.entries(TOUR_COLORS_MAP).filter(([k]) => k !== 'default').map(([code, colors]) => (
                    <div key={code} className="sc-legend-item">
                        <div className="sc-legend-dot" style={{ background: colors.bg }} />
                        <span>{code.toUpperCase()}</span>
                    </div>
                ))}
            </div>

            {/* Calendar months */}
            <div className="sc-months">
                {months.map((mo, mi) => {
                    const eventCount = getMonthEventCount(mo);
                    const isExpanded = expandedMonth === mi;

                    return (
                        <div key={mi} className={'sc-month' + (isExpanded ? ' expanded' : '')}>
                            <button className="sc-month-header" onClick={() => setExpandedMonth(isExpanded ? -1 : mi)}>
                                <div className="sc-month-title">
                                    <span>{mo.label}</span>
                                    {eventCount > 0 && <span className="sc-month-badge">{eventCount} event days</span>}
                                </div>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                    style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                            </button>

                            {isExpanded && (
                                <div className="sc-month-body">
                                    <div className="sc-day-headers">
                                        {DAY_HEADERS.map(d => <div key={d} className="sc-dh">{d}</div>)}
                                    </div>
                                    <div className="sc-day-grid">
                                        {/* Empty cells for offset */}
                                        {Array.from({ length: mo.firstDay }).map((_, i) => (
                                            <div key={`e-${i}`} className="sc-day empty" />
                                        ))}
                                        {/* Day cells */}
                                        {Array.from({ length: mo.daysInMonth }).map((_, di) => {
                                            const dayNum = di + 1;
                                            const dayEvents = getEventsForDate(mo.year, mo.month, dayNum);
                                            const isToday = mo.year === today.getFullYear() && mo.month === today.getMonth() && dayNum === today.getDate();
                                            const isSelected = selectedDay && selectedDay.year === mo.year && selectedDay.month === mo.month && selectedDay.day === dayNum;

                                            return (
                                                <div
                                                    key={dayNum}
                                                    className={'sc-day' + (isToday ? ' today' : '') + (dayEvents.length > 0 ? ' has-events' : '') + (isSelected ? ' selected' : '')}
                                                    onClick={() => dayEvents.length > 0 && setSelectedDay({ year: mo.year, month: mo.month, day: dayNum })}
                                                >
                                                    <span className="sc-day-num">{dayNum}</span>
                                                    {dayEvents.length > 0 && (
                                                        <div className="sc-day-dots">
                                                            {dayEvents.slice(0, 3).map((ev, ei) => {
                                                                const color = getColor(ev.tour_code);
                                                                return <div key={ei} className="sc-dot" style={{ background: color.bg }} />;
                                                            })}
                                                            {dayEvents.length > 3 && <span className="sc-dot-more">+{dayEvents.length - 3}</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Selected day events */}
            {selectedDay && selectedEvents.length > 0 && (
                <div className="sc-day-panel">
                    <div className="sc-dp-header">
                        <h3>{MONTH_NAMES[selectedDay.month]} {selectedDay.day}, {selectedDay.year}</h3>
                        <button className="sc-dp-close" onClick={() => setSelectedDay(null)}>×</button>
                    </div>
                    <div className="sc-dp-events">
                        {selectedEvents.map((ev, i) => {
                            const color = getColor(ev.tour_code);
                            return (
                                <div key={i} className="sc-event-card" style={{ borderLeftColor: color.bg }}>
                                    <div className="sc-ev-header">
                                        <span className="sc-ev-name">{ev.name || ev.series_name}</span>
                                        {ev.tour_code && (
                                            <span className="sc-ev-tour" style={{ background: color.bg, color: color.text }}>{ev.tour_code}</span>
                                        )}
                                    </div>
                                    <div className="sc-ev-details">
                                        {ev.venue_name && <span>📍 {ev.venue_name}</span>}
                                        {ev.start_date && <span> · {ev.start_date}{ev.end_date ? ` — ${ev.end_date}` : ''}</span>}
                                    </div>
                                    {ev.guaranteed && <div className="sc-ev-gtd">💰 ${Number(ev.guaranteed).toLocaleString()} GTD</div>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <style jsx>{`
        .seasonal-cal { padding: 0 0 20px; }
        .sc-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .sc-header h2 { font-size: 22px; font-weight: 700; color: #fff; margin: 0; flex: 1; }
        .sc-event-count { padding: 4px 12px; border-radius: 20px; background: rgba(212,168,83,0.1); border: 1px solid rgba(212,168,83,0.3); color: #d4a853; font-size: 12px; font-weight: 600; }
        .sc-filters { margin-bottom: 12px; }
        .sc-filter-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .sc-filter-label { font-size: 12px; color: rgba(255,255,255,0.4); font-weight: 500; }
        .sc-filter-chip { padding: 6px 12px; border-radius: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); font-size: 12px; cursor: pointer; transition: all 0.2s; }
        .sc-filter-chip.active { background: rgba(212,168,83,0.15); border-color: rgba(212,168,83,0.4); color: #d4a853; }
        .sc-legend { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; padding: 10px 14px; background: rgba(255,255,255,0.03); border-radius: 10px; }
        .sc-legend-item { display: flex; align-items: center; gap: 4px; font-size: 11px; color: rgba(255,255,255,0.5); }
        .sc-legend-dot { width: 8px; height: 8px; border-radius: 50%; }
        .sc-months { display: flex; flex-direction: column; gap: 4px; }
        .sc-month { background: rgba(15,23,42,0.5); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; overflow: hidden; transition: all 0.2s; }
        .sc-month.expanded { border-color: rgba(212,168,83,0.2); }
        .sc-month-header { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; background: none; border: none; color: #fff; cursor: pointer; }
        .sc-month-header:hover { background: rgba(255,255,255,0.03); }
        .sc-month-title { display: flex; align-items: center; gap: 10px; }
        .sc-month-title span:first-child { font-size: 16px; font-weight: 600; }
        .sc-month-badge { padding: 2px 8px; border-radius: 10px; background: rgba(212,168,83,0.1); color: #d4a853; font-size: 11px; font-weight: 500; }
        .sc-month-body { padding: 0 16px 16px; }
        .sc-day-headers { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; margin-bottom: 4px; }
        .sc-dh { text-align: center; font-size: 11px; color: rgba(255,255,255,0.3); font-weight: 500; padding: 4px 0; }
        .sc-day-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
        .sc-day { position: relative; min-height: 38px; padding: 4px; border-radius: 6px; background: rgba(255,255,255,0.02); display: flex; flex-direction: column; align-items: center; gap: 2px; transition: all 0.15s; }
        .sc-day.empty { background: transparent; }
        .sc-day.has-events { cursor: pointer; background: rgba(255,255,255,0.04); }
        .sc-day.has-events:hover { background: rgba(212,168,83,0.08); }
        .sc-day.today { background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3); }
        .sc-day.selected { background: rgba(212,168,83,0.15); border: 1px solid rgba(212,168,83,0.4); }
        .sc-day-num { font-size: 12px; color: rgba(255,255,255,0.6); font-weight: 500; }
        .sc-day.today .sc-day-num { color: #3b82f6; font-weight: 700; }
        .sc-day-dots { display: flex; gap: 2px; justify-content: center; flex-wrap: wrap; }
        .sc-dot { width: 5px; height: 5px; border-radius: 50%; }
        .sc-dot-more { font-size: 8px; color: rgba(255,255,255,0.4); }
        .sc-day-panel { margin-top: 16px; background: rgba(15,23,42,0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 20px; }
        .sc-dp-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .sc-dp-header h3 { font-size: 18px; font-weight: 600; color: #fff; margin: 0; }
        .sc-dp-close { background: none; border: none; color: rgba(255,255,255,0.4); font-size: 24px; cursor: pointer; }
        .sc-dp-events { display: flex; flex-direction: column; gap: 8px; }
        .sc-event-card { padding: 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-left: 3px solid #d4a853; border-radius: 10px; }
        .sc-ev-header { display: flex; justify-content: space-between; align-items: center; }
        .sc-ev-name { font-size: 14px; font-weight: 600; color: #fff; }
        .sc-ev-tour { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; }
        .sc-ev-details { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 4px; }
        .sc-ev-gtd { font-size: 13px; color: #22c55e; font-weight: 600; margin-top: 4px; }
      `}</style>
        </div>
    );
}
