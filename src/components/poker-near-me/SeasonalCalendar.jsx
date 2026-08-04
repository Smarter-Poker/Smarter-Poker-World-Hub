/**
 * SeasonalCalendar.jsx — Feature #15: Seasonal Calendar Mode
 * Full-page 12-month calendar showing all series and traveling-tour stops.
 *
 * Note: daily tournaments are recurring weekly rows (day_of_week, no calendar
 * date) so they are not plottable here — DailyTournamentsPanel owns that view.
 * The previously-accepted `dailyTournaments` prop was never read; it has been
 * dropped from the signature (extra props from existing call sites are ignored).
 */
import React, { useState, useMemo } from 'react';

const TOUR_COLORS_MAP = {
    wsop: { bg: '#ffffff', text: '#000' },
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

// BUG FIX: 'YYYY-MM-DD' passed to new Date() is parsed as UTC midnight, which
// getFullYear/getMonth/getDate then shift back a day for every negative-UTC-offset
// (i.e. every US) viewer — series landed one square early on the calendar.
// Appending a time component forces local-time parsing.
function parseLocalDate(dateStr) {
    if (!dateStr) return null;
    const str = String(dateStr).trim();
    const d = /^\d{4}-\d{2}-\d{2}$/.test(str) ? new Date(str + 'T00:00:00') : new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

// BUG FIX: sanitize URLs to block javascript:/data: XSS vectors and to add a
// scheme to scraped hosts like "www.wsop.com/..." which would otherwise become
// a relative in-app href. Mirrors NewSeriesVenueCard.jsx / SeriesCard.js.
function safeHref(url) {
    if (!url || typeof url !== 'string') return null;
    const cleanUrl = url.replace(/[\x00-\x20]/g, '');
    const lower = cleanUrl.toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) return null;
    return lower.startsWith('http://') || lower.startsWith('https://') ? cleanUrl : 'https://' + cleanUrl;
}

const dayKey = (year, month, day) => `${year}-${month}-${day}`;

export default function SeasonalCalendar({ series = [], tours = [], onEventClick }) {
    const today = new Date();
    const [selectedDay, setSelectedDay] = useState(null);
    const [filterType, setFilterType] = useState('All');
    const [filterBuyin, setFilterBuyin] = useState('All');
    const [expandedMonth, setExpandedMonth] = useState(today.getMonth());

    // Build event list combining series + tours
    const allEvents = useMemo(() => {
        let events = [...(series || []).map(s => ({ ...s, eventType: 'series' }))];

        // Map traveling tour stops into the calendar
        (tours || []).forEach(t => {
            if (t.upcoming_series && t.upcoming_series.length > 0) {
                t.upcoming_series.forEach(us => {
                    events.push({
                        ...us,
                        eventType: 'tour_stop',
                        tour_code: t.tour_code || us.tour_code,
                        tour_type: t.tour_type,
                        name: us.name || us.short_name || t.name,
                    });
                });
            }
        });

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
    // BUG FIX: `tours` was missing from the deps. Tours load asynchronously in the
    // parent, so when the prop arrived after first render the memo never recomputed
    // and tour stops were permanently absent from the calendar.
    }, [series, tours, filterType, filterBuyin]);

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

    // PERF: this used to re-scan every event for all 366 days on every render
    // (12 month counts x ~30 days, plus the expanded grid), allocating a Date per
    // event per day — on the order of 100k Date allocations per render, re-run on
    // every filter chip click, month expand and day selection.
    // Bucket each event across its start..end range once instead.
    const eventsByDay = useMemo(() => {
        const map = new Map();
        // Only bucket dates the calendar can actually show (12 months from today).
        const rangeStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const rangeEnd = new Date(today.getFullYear(), today.getMonth() + 12, 0);

        allEvents.forEach(e => {
            if (!e.start_date) return;
            const start = parseLocalDate(e.start_date);
            if (!start) return;
            const end = parseLocalDate(e.end_date) || start;

            let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
            const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
            if (last < rangeStart || cursor > rangeEnd) return;
            if (cursor < rangeStart) cursor = new Date(rangeStart);

            // Guard against malformed rows with an end_date decades out.
            let guard = 0;
            while (cursor <= last && cursor <= rangeEnd && guard < 800) {
                const k = dayKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
                const bucket = map.get(k);
                if (bucket) bucket.push(e);
                else map.set(k, [e]);
                cursor.setDate(cursor.getDate() + 1);
                guard++;
            }
        });
        return map;
    // `today` is recreated every render but only its calendar month matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allEvents]);

    const EMPTY_EVENTS = useMemo(() => [], []);
    const getEventsForDate = (year, month, day) => eventsByDay.get(dayKey(year, month, day)) || EMPTY_EVENTS;

    // Days-with-events per month, precomputed from the same map.
    const monthEventDayCounts = useMemo(() => {
        const counts = new Map();
        eventsByDay.forEach((_events, k) => {
            const [y, m] = k.split('-');
            const mk = `${y}-${m}`;
            counts.set(mk, (counts.get(mk) || 0) + 1);
        });
        return counts;
    }, [eventsByDay]);

    // Get events for selected day
    const selectedEvents = selectedDay
        ? getEventsForDate(selectedDay.year, selectedDay.month, selectedDay.day)
        : [];

    // Count total events per month for quick overview
    const getMonthEventCount = (mo) => monthEventDayCounts.get(`${mo.year}-${mo.month}`) || 0;

    return (
        <div className="seasonal-cal">
            <div className="sc-header">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                    <circle cx="8" cy="14" r="1.5" fill="#22c55e" stroke="none" />
                    <circle cx="12" cy="14" r="1.5" fill="#3b82f6" stroke="none" />
                    <circle cx="16" cy="14" r="1.5" fill="#ffffff" stroke="none" />
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
                {Object.entries(TOUR_COLORS_MAP || {}).filter(([k]) => k !== 'default').map(([code, colors]) => (
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

                                            const hasEvents = dayEvents.length > 0;
                                            const selectDay = () => hasEvents && setSelectedDay({ year: mo.year, month: mo.month, day: dayNum });

                                            return (
                                                <div
                                                    key={dayNum}
                                                    className={'sc-day' + (isToday ? ' today' : '') + (hasEvents ? ' has-events' : '') + (isSelected ? ' selected' : '')}
                                                    // A11Y: these were plain divs with onClick — not focusable,
                                                    // no role, no keyboard activation.
                                                    role={hasEvents ? 'button' : undefined}
                                                    tabIndex={hasEvents ? 0 : undefined}
                                                    aria-pressed={hasEvents ? !!isSelected : undefined}
                                                    aria-label={hasEvents ? `${MONTH_NAMES[mo.month]} ${dayNum}, ${dayEvents.length} event${dayEvents.length > 1 ? 's' : ''}` : undefined}
                                                    onClick={selectDay}
                                                    onKeyDown={hasEvents ? (e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectDay(); }
                                                    } : undefined}
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
                            // UX: these cards carried cursor:pointer and a hover lift but had
                            // no onClick, href or key handler — the discovery-to-action path
                            // dead-ended. Prefer the host's handler, otherwise open the
                            // series' own page in a new tab; if neither exists, render an
                            // inert card rather than faking interactivity.
                            const externalUrl = safeHref(ev.source_url || ev.website || ev.url);
                            const activate = onEventClick
                                ? () => onEventClick(ev)
                                : externalUrl
                                    ? () => { if (typeof window !== 'undefined') window.open(externalUrl, '_blank', 'noopener,noreferrer'); }
                                    : null;
                            return (
                                <div
                                    key={i}
                                    className={'sc-event-card' + (activate ? '' : ' inert')}
                                    style={{ borderLeftColor: color.bg }}
                                    role={activate ? 'button' : undefined}
                                    tabIndex={activate ? 0 : undefined}
                                    onClick={activate || undefined}
                                    onKeyDown={activate ? (e) => {
                                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
                                    } : undefined}
                                >
                                    <div className="sc-ev-header">
                                        <span className="sc-ev-name">{ev.name || ev.series_name}</span>
                                        {ev.tour_code && (
                                            <span className="sc-ev-tour" style={{ background: color.bg, color: color.text }}>{ev.tour_code}</span>
                                        )}
                                    </div>
                                    <div className="sc-ev-details">
                                        {ev.venue_name && <span>{ev.venue_name}</span>}
                                        {ev.start_date && <span> · {ev.start_date}{ev.end_date ? ` — ${ev.end_date}` : ''}</span>}
                                    </div>
                                    {ev.guaranteed && <div className="sc-ev-gtd">${Number(ev.guaranteed).toLocaleString()} GTD</div>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <style>{`
        .seasonal-cal { padding: 0 0 20px; }
        .sc-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .sc-header h2 { font-size: 22px; font-weight: 700; color: #e2e8f0; margin: 0; flex: 1; letter-spacing: -0.3px; }
        .sc-event-count { padding: 4px 12px; border-radius: 20px; background: linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(200,214,229,0.08) 100%); border: 1.5px solid rgba(255,255,255,0.35); color: #ffffff; font-size: 12px; font-weight: 600; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 6px rgba(0,0,0,0.25); }
        .sc-filters { margin-bottom: 12px; }
        .sc-filter-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .sc-filter-label { font-size: 12px; color: rgba(148,163,184,0.6); font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
        .sc-filter-chip { padding: 6px 12px; border-radius: 8px; background: linear-gradient(180deg, rgba(25,35,55,0.9) 0%, rgba(15,23,42,0.95) 100%); border: 1.5px solid rgba(148,163,184,0.15); color: rgba(148,163,184,0.7); font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.25s; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 4px rgba(0,0,0,0.3); }
        .sc-filter-chip:hover { border-color: rgba(148,163,184,0.3); color: #e2e8f0; }
        .sc-filter-chip.active { background: linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(200,214,229,0.08) 100%); border-color: rgba(255,255,255,0.45); color: #ffffff; box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), 0 0 10px rgba(255,255,255,0.1), 0 2px 4px rgba(0,0,0,0.3); }
        .sc-legend { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; padding: 10px 14px; background: linear-gradient(160deg, rgba(18,28,45,0.7) 0%, rgba(10,16,28,0.8) 100%); border: 1.5px solid rgba(148,163,184,0.12); border-radius: 10px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.3); }
        .sc-legend-item { display: flex; align-items: center; gap: 4px; font-size: 11px; color: rgba(148,163,184,0.6); }
        .sc-legend-dot { width: 8px; height: 8px; border-radius: 50%; box-shadow: 0 0 4px currentColor; }
        .sc-months { display: flex; flex-direction: column; gap: 8px; }
        .sc-month { background: linear-gradient(160deg, rgba(18,28,45,0.85) 0%, rgba(10,16,28,0.92) 100%); border: 1.5px solid rgba(148,163,184,0.12); border-radius: 12px; overflow: hidden; transition: all 0.25s; box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(0,0,0,0.35); }
        .sc-month.expanded { border-color: rgba(255,255,255,0.35); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06); }
        .sc-month-header { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; background: none; border: none; color: #e2e8f0; cursor: pointer; transition: background 0.2s; }
        .sc-month-header:hover { background: rgba(148,163,184,0.04); }
        .sc-month-title { display: flex; align-items: center; gap: 10px; }
        .sc-month-title span:first-child { font-size: 16px; font-weight: 600; color: #e2e8f0; }
        .sc-month-badge { padding: 2px 8px; border-radius: 10px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.25); color: #ffffff; font-size: 11px; font-weight: 600; }
        .sc-month-body { padding: 0 16px 16px; }
        .sc-day-headers { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; margin-bottom: 4px; }
        .sc-dh { text-align: center; font-size: 11px; color: rgba(148,163,184,0.5); font-weight: 600; padding: 4px 0; text-transform: uppercase; letter-spacing: 0.3px; }
        .sc-day-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
        .sc-day { position: relative; min-height: 38px; padding: 4px; border-radius: 6px; background: rgba(148,163,184,0.03); display: flex; flex-direction: column; align-items: center; gap: 2px; transition: all 0.2s; border: 1px solid transparent; }
        .sc-day.empty { background: transparent; }
        .sc-day.has-events { cursor: pointer; background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.08); }
        .sc-day.has-events:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.25); }
        .sc-day.today { background: rgba(255,255,255,0.08); border: 1.5px solid rgba(255,255,255,0.3); }
        .sc-day.selected { background: rgba(255,255,255,0.18); border: 1.5px solid rgba(255,255,255,0.5); box-shadow: 0 0 8px rgba(255,255,255,0.1); }
        .sc-day-num { font-size: 12px; color: rgba(148,163,184,0.6); font-weight: 500; }
        .sc-day.today .sc-day-num { color: #ffffff; font-weight: 700; }
        .sc-day-dots { display: flex; gap: 2px; justify-content: center; flex-wrap: wrap; }
        .sc-dot { width: 5px; height: 5px; border-radius: 50%; }
        .sc-dot-more { font-size: 8px; color: rgba(148,163,184,0.5); }
        .sc-day-panel { margin-top: 16px; background: linear-gradient(160deg, rgba(18,28,45,0.92) 0%, rgba(10,16,28,0.96) 100%); border: 2px solid rgba(148,163,184,0.16); border-radius: 14px; padding: 20px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.5); }
        .sc-dp-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .sc-dp-header h3 { font-size: 18px; font-weight: 600; color: #e2e8f0; margin: 0; }
        .sc-dp-close { background: none; border: none; color: rgba(148,163,184,0.5); font-size: 24px; cursor: pointer; transition: color 0.2s; }
        .sc-dp-close:hover { color: #ffffff; }
        .sc-dp-events { display: flex; flex-direction: column; gap: 8px; }
        .sc-event-card { padding: 14px; background: linear-gradient(160deg, rgba(18,28,45,0.7) 0%, rgba(10,16,28,0.85) 100%); border: 1.5px solid rgba(148,163,184,0.12); border-left: 3px solid #ffffff; border-radius: 10px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.3); transition: all 0.25s; cursor: pointer; }
        .sc-event-card:hover { transform: translateY(-1px); border-color: rgba(255,255,255,0.35); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 16px rgba(0,0,0,0.4); }
        .sc-event-card:focus-visible { outline: 2px solid rgba(255,255,255,0.6); outline-offset: 2px; }
        .sc-event-card.inert { cursor: default; }
        .sc-event-card.inert:hover { transform: none; border-color: rgba(148,163,184,0.12); box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.3); }
        .sc-day:focus-visible { outline: 2px solid rgba(255,255,255,0.6); outline-offset: 2px; }
        .sc-ev-header { display: flex; justify-content: space-between; align-items: center; }
        .sc-ev-name { font-size: 14px; font-weight: 600; color: #e2e8f0; }
        .sc-ev-tour { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; }
        .sc-ev-details { font-size: 12px; color: rgba(148,163,184,0.5); margin-top: 4px; }
        .sc-ev-gtd { font-size: 13px; color: #22c55e; font-weight: 600; margin-top: 4px; }
      `}</style>
        </div>
    );
}
