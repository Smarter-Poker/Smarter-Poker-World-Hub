/**
 * SeriesTabPanel — Extracted from poker-near-me.js renderSeries() + renderSeriesCalendar()
 * Series listing with search, state filter, grid/calendar toggle, and paginated grid.
 */
import React from 'react';
import dynamic from 'next/dynamic';

const SeriesCard = dynamic(() => import('./NewSeriesVenueCard'), { ssr: false });

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

const TOUR_COLORS = {
    'WSOP': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227' },
    'WPT': { bg: 'linear-gradient(135deg, #dc2626, #991b1b)', text: '#fff', border: '#dc2626' },
    'WSOPC': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227' },
    'MSPT': { bg: 'linear-gradient(135deg, #1e40af, #1e3a8a)', text: '#fff', border: '#3b82f6' },
    'RGPS': { bg: 'linear-gradient(135deg, #059669, #047857)', text: '#fff', border: '#10b981' },
    'PGT': { bg: 'linear-gradient(135deg, #7c3aed, #5b21b6)', text: '#fff', border: '#8b5cf6' },
    'default': { bg: 'linear-gradient(135deg, #374151, #1f2937)', text: '#fff', border: '#4b5563' }
};

/**
 * Parse a date-only string ('2026-08-01') as a LOCAL date.
 * `new Date('2026-08-01')` is parsed as UTC midnight, which in every US timezone
 * reads back as the PREVIOUS day via getFullYear/getMonth/getDate — shifting every
 * series one day early on the calendar. Building the Date from parts avoids that.
 */
function parseLocalDate(value) {
    if (!value) return null;
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
}

const MONTHS_PER_PAGE = 4;

const EMPTY_DAY = [];

function SeriesCalendar({ series, router, openVenueModal }) {
    // PERF: `new Date()` per render anchored the whole month window to a value that
    // changed identity on every parent state change. It only needs to be read once.
    const today = React.useMemo(() => new Date(), []);
    const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
    // IMPROVEMENT: the calendar was hard-locked to 4 months forward from today with no
    // controls, so a series running since last month was invisible and anything past the
    // window (the horizon players book WSOP/WPT travel on) could not be browsed at all.
    const [monthOffset, setMonthOffset] = React.useState(0);
    // The "+N" overflow indicator is now a real control — clicking a day expands the cell.
    const [expandedDay, setExpandedDay] = React.useState(null);

    const months = React.useMemo(() => {
        const out = [];
        for (let m = 0; m < MONTHS_PER_PAGE; m++) {
            const d = new Date(today.getFullYear(), today.getMonth() + monthOffset + m, 1);
            out.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) });
        }
        return out;
    }, [today, monthOffset]);

    // PERF: the calendar used to re-filter the WHOLE series list once per month and then
    // again once per day cell (4 months x up to 31 days = ~124 passes), calling
    // parseLocalDate twice per candidate and allocating two more Dates per comparison —
    // tens of thousands of Date allocations per render on a mobile scroll surface.
    // Parse each series' start/end exactly once...
    const parsedSeries = React.useMemo(() => (
        (Array.isArray(series) ? series : []).reduce((acc, s) => {
            const start = parseLocalDate(s.start_date);
            if (!start) return acc;
            const end = parseLocalDate(s.end_date) || start;
            acc.push({
                s,
                startMs: new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime(),
                endMs: new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime(),
            });
            return acc;
        }, [])
    ), [series]);

    // ...then bucket them into 'YYYY-M-D' -> series[] in ONE pass over the visible window.
    // Each day cell becomes a Map lookup.
    const dayMap = React.useMemo(() => {
        const map = new Map();
        if (months.length === 0) return map;
        const first = months[0];
        const last = months[months.length - 1];
        const windowStart = new Date(first.year, first.month, 1).getTime();
        const windowEnd = new Date(last.year, last.month + 1, 0).getTime();
        parsedSeries.forEach(row => {
            if (row.endMs < windowStart || row.startMs > windowEnd) return;
            const from = new Date(Math.max(row.startMs, windowStart));
            const to = Math.min(row.endMs, windowEnd);
            // setDate() stepping is DST-safe; the loop is bounded by the visible window.
            for (const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
                cur.getTime() <= to;
                cur.setDate(cur.getDate() + 1)) {
                const key = `${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`;
                const bucket = map.get(key);
                if (bucket) bucket.push(row.s); else map.set(key, [row.s]);
            }
        });
        return map;
    }, [parsedSeries, months]);

    const shiftMonths = (delta) => {
        setExpandedDay(null);
        setMonthOffset(prev => Math.max(-24, Math.min(24, prev + delta)));
    };

    return (
        <div className="calendar-view">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <button type="button" className="view-btn" onClick={() => shiftMonths(-MONTHS_PER_PAGE)} aria-label="Show earlier months">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
                    Earlier
                </button>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.75)' }}>
                    {months[0].label} - {months[months.length - 1].label}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                    {monthOffset !== 0 && (
                        <button type="button" className="view-btn" onClick={() => { setExpandedDay(null); setMonthOffset(0); }}>Today</button>
                    )}
                    <button type="button" className="view-btn" onClick={() => shiftMonths(MONTHS_PER_PAGE)} aria-label="Show later months">
                        Later
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                    </button>
                </div>
            </div>
            {months.map((mo, mi) => {
                const daysInMonth = new Date(mo.year, mo.month + 1, 0).getDate();
                const firstDay = new Date(mo.year, mo.month, 1).getDay();

                return (
                    <div key={mi} className="calendar-month">
                        <h3 className="calendar-month-title">{mo.label}</h3>
                        <div className="calendar-grid-header">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                <div key={d} className="cal-header-cell">{d}</div>
                            ))}
                        </div>
                        <div className="calendar-grid-body">
                            {Array.from({ length: firstDay }).map((_, i) => (
                                <div key={'empty-' + i} className="cal-cell empty"></div>
                            ))}
                            {Array.from({ length: daysInMonth }).map((_, di) => {
                                const dayNum = di + 1;
                                const cellKey = `${mo.year}-${mo.month}-${dayNum}`;
                                const daySeries = dayMap.get(cellKey) || EMPTY_DAY;
                                const isToday = cellKey === todayKey;
                                const isExpanded = expandedDay === cellKey;
                                const visibleSeries = isExpanded ? daySeries : daySeries.slice(0, 2);
                                return (
                                    <div key={dayNum} className={'cal-cell' + (isToday ? ' today' : '') + (daySeries.length > 0 ? ' has-events' : '')}>
                                        <span className="cal-day-num">{dayNum}</span>
                                        {visibleSeries.map((s, si) => {
                                            const tourColor = TOUR_COLORS[s.tour_code] || TOUR_COLORS.default;
                                            return (
                                                <div key={s.id || si} className="cal-event"
                                                    style={{ background: tourColor.border, color: tourColor.text === '#000' ? '#000' : '#fff', cursor: s.id ? 'pointer' : 'default' }}
                                                    onClick={() => {
                                                        // No id — navigating to a positional index lands on an unrelated series
                                                        if (!s.id) return;
                                                        const path = '/hub/series/' + s.id;
                                                        if (openVenueModal) openVenueModal(path); else router.push(path);
                                                    }}
                                                    title={s.name}>
                                                    {(s.tour_code || s.short_name || '').slice(0, 5)}
                                                </div>
                                            );
                                        })}
                                        {daySeries.length > 2 && (
                                            <div className="cal-more"
                                                role="button"
                                                tabIndex={0}
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => setExpandedDay(isExpanded ? null : cellKey)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        setExpandedDay(isExpanded ? null : cellKey);
                                                    }
                                                }}
                                                title={isExpanded ? 'Show fewer' : `Show all ${daySeries.length} series`}>
                                                {isExpanded ? 'Less' : `+${daySeries.length - 2}`}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default function SeriesTabPanel({
    series,
    filters,
    setFilters,
    displayCount,
    loadMore,
    seriesViewMode,
    setSeriesViewMode,
    isFavorited,
    toggleFavorite,
    router,
    openVenueModal,
}) {
    const seriesStateVal = filters.hubSeriesState || 'all';
    let filteredSeries = series;
    if (seriesStateVal !== 'all') {
        filteredSeries = filteredSeries.filter(s => s.state === seriesStateVal);
    }

    return (
        <>
            {/* State Filter */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={seriesStateVal}
                    onChange={(e) => setFilters(f => ({ ...f, hubSeriesState: e.target.value }))}
                    className="sort-select" style={{ minWidth: 100 }}>
                    <option value="all">All States</option>
                    {US_STATES.map(st => (
                        <option key={st} value={st}>{st}</option>
                    ))}
                </select>
            </div>
            <div className="results-bar">
                <span className="results-count"><span style={{ color: '#ffffff', fontWeight: 800 }}>{filteredSeries.length}</span> series</span>
                <div className="view-toggle">
                    <button className={'view-btn' + (seriesViewMode === 'grid' ? ' active' : '')} onClick={() => setSeriesViewMode('grid')}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
                        Grid
                    </button>
                    <button className={'view-btn' + (seriesViewMode === 'calendar' ? ' active' : '')} onClick={() => setSeriesViewMode('calendar')}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        Calendar
                    </button>
                </div>
            </div>

            {filteredSeries.length === 0 ? (
                <div className="empty-state">
                    <p>No Matching Series</p>
                    <p style={{ fontSize: 13, opacity: 0.5, marginTop: 4 }}>{seriesStateVal !== 'all' ? 'Try adjusting your filters.' : 'Check back soon for poker series.'}</p>
                    <button onClick={() => setFilters(f => ({ ...f, hubSeriesState: 'all' }))}>Clear Series Filters</button>
                </div>
            ) : seriesViewMode === 'calendar' ? <SeriesCalendar series={filteredSeries} router={router} openVenueModal={openVenueModal} /> : (
                <>
                    <div className="card-grid">
                        {filteredSeries.slice(0, displayCount.series).map((s, i) => (
                            <SeriesCard
                                key={s.id || i}
                                series={s}
                                index={i}
                                isFavorited={s.id ? isFavorited('series', s.id) : false}
                                onFavorite={s.id ? ((e) => toggleFavorite('series', s.id, e)) : undefined}
                                onNavigate={(path) => openVenueModal ? openVenueModal(path) : router.push(path)}
                            />
                        ))}
                    </div>
                    {displayCount.series < filteredSeries.length && (
                        <div className="load-more">
                            <button className="load-more-btn" onClick={() => loadMore('series')}>
                                Load More ({filteredSeries.length - displayCount.series} remaining)
                            </button>
                        </div>
                    )}
                </>
            )}
        </>
    );
}
