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
import { PokerNearMeConsoleIcon, PokerNearMePanelShell } from './PokerNearMeConsole';

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
        <PokerNearMePanelShell
            as="section"
            className="seasonal-cal pnm-console-tool"
            bodyClassName="pnm-console-tool__body"
            aria-labelledby="pnm-seasonal-calendar-title"
        >
            <div className="sc-header">
                <PokerNearMeConsoleIcon name="calendar" className="pnm-console-tool__header-icon" />
                <h2 id="pnm-seasonal-calendar-title">Seasonal Calendar</h2>
                <span className="sc-event-count">{allEvents.length} Events</span>
            </div>

            {/* Filters */}
            <div className="sc-filters">
                <div className="sc-filter-group">
                    <span className="sc-filter-label">Type:</span>
                    {FILTER_OPTIONS.type.map(t => (
                        <button type="button" key={t} className={'sc-filter-chip' + (filterType === t ? ' active' : '')} aria-pressed={filterType === t} onClick={() => setFilterType(t)}>{t}</button>
                    ))}
                </div>
                <div className="sc-filter-group sc-filter-group--secondary">
                    <span className="sc-filter-label">Buy-In:</span>
                    {FILTER_OPTIONS.buyinRange.map(b => (
                        <button type="button" key={b} className={'sc-filter-chip' + (filterBuyin === b ? ' active' : '')} aria-pressed={filterBuyin === b} onClick={() => setFilterBuyin(b)}>{b}</button>
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
                            <button type="button" className="sc-month-header" aria-expanded={isExpanded} onClick={() => setExpandedMonth(isExpanded ? -1 : mi)}>
                                <div className="sc-month-title">
                                    <span>{mo.label}</span>
                                    {eventCount > 0 && <span className="sc-month-badge">{eventCount} Event Days</span>}
                                </div>
                                <PokerNearMeConsoleIcon
                                    name="back"
                                    className={'pnm-console-tool__disclosure' + (isExpanded ? ' is-open' : '')}
                                />
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
                        <button type="button" className="sc-dp-close" aria-label="Close selected day" onClick={() => setSelectedDay(null)}>
                            <PokerNearMeConsoleIcon name="close" />
                        </button>
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
                                    role={activate ? 'button' : undefined}
                                    tabIndex={activate ? 0 : undefined}
                                    onClick={activate || undefined}
                                    onKeyDown={activate ? (e) => {
                                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
                                    } : undefined}
                                >
                                    <span className="sc-event-mark" style={{ backgroundColor: color.bg }} aria-hidden="true" />
                                    <div className="sc-ev-header">
                                        <span className="sc-ev-name">{ev.name || ev.series_name}</span>
                                        {ev.tour_code && (
                                            <span className="sc-ev-tour" style={{ background: color.bg, color: color.text }}>{ev.tour_code}</span>
                                        )}
                                    </div>
                                    <div className="sc-ev-details">
                                        {ev.venue_name && <span>{ev.venue_name}</span>}
                                        {ev.start_date && <span> · {ev.start_date}{ev.end_date ? ` - ${ev.end_date}` : ''}</span>}
                                    </div>
                                    {ev.guaranteed && <div className="sc-ev-gtd">${Number(ev.guaranteed).toLocaleString()} GTD</div>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

        </PokerNearMePanelShell>
    );
}
