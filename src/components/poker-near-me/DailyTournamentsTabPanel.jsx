/**
 * DailyTournamentsTabPanel — Extracted from poker-near-me.js renderDailyTournaments()
 * Daily tournament listing with day selector, game type chips, and filters.
 */
import React from 'react';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PAGE_SIZE = 50;

// Guarantees are the number players drive on — never round them UP.
// toFixed(0) turned a $1,500 GTD into "$2K" and a $1.5M GTD into "$2M".
// One decimal is kept whenever the value is not a clean multiple.
function formatMoney(amount) {
    if (!amount) return '';
    const num = Number(amount);
    if (!Number.isFinite(num)) return '';
    if (num >= 1000000) {
        const m = num / 1000000;
        return '$' + (num % 1000000 === 0 ? m.toFixed(0) : m.toFixed(1)) + 'M';
    }
    if (num >= 1000) {
        const k = num / 1000;
        return '$' + (num % 1000 === 0 ? k.toFixed(0) : k.toFixed(1)) + 'K';
    }
    return '$' + num.toLocaleString();
}

// Buy-in can arrive null/empty/non-numeric from the scrapers — never render a bare '$'
function formatBuyIn(amount) {
    if (amount === null || amount === undefined || amount === '') return 'TBD';
    const num = Number(amount);
    if (!Number.isFinite(num)) return 'TBD';
    return '$' + num.toLocaleString();
}

function formatGameType(raw) {
    if (!raw) return 'NLH';
    const lower = raw.toLowerCase();
    if (lower === 'holdem' || lower === 'hold\'em' || lower === 'texas hold\'em') return 'Hold\'em';
    if (lower === 'nlh' || lower === 'no limit holdem' || lower === 'no limit hold\'em') return 'NLH';
    if (lower === 'plo' || lower === 'omaha') return 'PLO';
    if (lower === 'horse') return 'HORSE';
    if (lower === 'mixed') return 'Mixed';
    if (lower === 'stud') return 'Stud';
    if (lower === 'deepstack' || lower === 'deep stack') return 'Deep Stack';
    return raw.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function DailyTournamentsTabPanel({
    dailyTournaments,
    filters,
    setFilters,
    fetchDailyTournaments,
}) {
    const dtGameType = filters.hubDailyGameType || 'all';
    const dtMinBuyin = filters.hubDailyMinBuyin || '';
    const dtMaxBuyin = filters.hubDailyMaxBuyin || '';
    const dtMinGtd = filters.hubDailyMinGtd || '';
    const dtSort = filters.hubDailySort || 'time';

    // UX FIX: the list used to be hard-capped at 50 with no way to reach the rest,
    // while the counter above advertised the full (unsliced) total.
    const [renderLimit, setRenderLimit] = React.useState(PAGE_SIZE);

    // UX FIX: switching days fires an async fetch with no loading signal, so the panel
    // showed the previous day's rows (silently attributed to the new day) or flashed
    // "No daily tournaments match your filters". Track the pending day locally and show
    // skeletons until fresh data lands (or the safety timeout fires).
    const [pendingDay, setPendingDay] = React.useState(null);
    const pendingTimerRef = React.useRef(null);

    const clearPending = React.useCallback(() => {
        if (pendingTimerRef.current) {
            clearTimeout(pendingTimerRef.current);
            pendingTimerRef.current = null;
        }
        setPendingDay(null);
    }, []);

    // Fresh data arrived — drop the pending flag and start the list from the top again.
    React.useEffect(() => {
        clearPending();
        setRenderLimit(PAGE_SIZE);
    }, [dailyTournaments, clearPending]);

    React.useEffect(() => () => {
        if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    }, []);

    // Filter changes re-slice the list from the top
    React.useEffect(() => {
        setRenderLimit(PAGE_SIZE);
    }, [dtGameType, dtMinBuyin, dtMaxBuyin, dtMinGtd, dtSort]);

    const selectDay = (day) => {
        // Re-tapping the day already on screen refetches the same URL, which the PNM API
        // cache answers with the SAME array instance — React bails out of that state update,
        // so the [dailyTournaments] effect never re-runs and the skeletons would sit there
        // until the 10s safety timeout. Only show them for an actual day change.
        const isNewDay = day !== filters.selectedDay;
        setFilters(f => ({ ...f, selectedDay: day }));
        if (isNewDay) {
            setPendingDay(day);
            if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
            // Safety net: a failed/short-circuited fetch must never strand the skeletons
            pendingTimerRef.current = setTimeout(() => setPendingDay(null), 10000);
        }
        fetchDailyTournaments(day);
    };

    // Apply client-side filters
    let filtered = Array.isArray(dailyTournaments) ? dailyTournaments : [];
    if (dtGameType !== 'all') {
        filtered = filtered.filter(t => {
            const gt = (t.game_type || '').toLowerCase();
            if (dtGameType === 'nlh') return gt.includes('nlh') || gt.includes('hold') || gt.includes('holdem') || gt === 'no limit holdem';
            if (dtGameType === 'plo') return gt.includes('plo') || gt.includes('omaha hi-lo') || gt.includes('pot limit omaha');
            if (dtGameType === 'mixed') return gt.includes('mix') || gt.includes('horse') || gt.includes('dealer');
            if (dtGameType === 'omaha') return gt.includes('omaha') && !gt.includes('hi-lo');
            return true;
        });
    }
    if (dtMinBuyin) filtered = filtered.filter(t => (t.buy_in || 0) >= Number(dtMinBuyin));
    if (dtMaxBuyin) filtered = filtered.filter(t => (t.buy_in || 0) <= Number(dtMaxBuyin));
    if (dtMinGtd) filtered = filtered.filter(t => (t.guaranteed || 0) >= Number(dtMinGtd));

    // Sort
    if (dtSort === 'buyin') filtered = [...filtered].sort((a, b) => (a.buy_in || 0) - (b.buy_in || 0));
    else if (dtSort === 'guaranteed') filtered = [...filtered].sort((a, b) => (b.guaranteed || 0) - (a.guaranteed || 0));

    const shown = filtered.slice(0, renderLimit);

    return (
        <>
            {/* Day selector */}
            <div className="day-selector">
                {DAYS_OF_WEEK.map(day => (
                    <button
                        key={day}
                        className={'day-btn' + (filters.selectedDay === day ? ' active' : '')}
                        onClick={() => selectDay(day)}
                    >
                        {day.slice(0, 3)}
                    </button>
                ))}
            </div>

            {/* Game type chips */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {[{ key: 'all', label: 'All Games' }, { key: 'nlh', label: 'NLH' }, { key: 'plo', label: 'PLO' }, { key: 'mixed', label: 'Mixed' }, { key: 'omaha', label: 'Omaha' }].map(g => (
                    <button key={g.key}
                        onClick={() => setFilters(f => ({ ...f, hubDailyGameType: g.key }))}
                        style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: dtGameType === g.key ? '1px solid #ffffff' : '1px solid rgba(255,255,255,0.15)', background: dtGameType === g.key ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)', color: dtGameType === g.key ? '#ffffff' : 'rgba(255,255,255,0.6)' }}
                    >{g.label}</button>
                ))}
            </div>

            {/* Buy-in range + GTD + Sort */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
                <input type="number" placeholder="Min $" value={dtMinBuyin}
                    onChange={(e) => setFilters(f => ({ ...f, hubDailyMinBuyin: e.target.value }))}
                    style={{ width: 70, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: '#e0e8f0', fontSize: 12, fontFamily: 'inherit' }} />
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>to</span>
                <input type="number" placeholder="Max $" value={dtMaxBuyin}
                    onChange={(e) => setFilters(f => ({ ...f, hubDailyMaxBuyin: e.target.value }))}
                    style={{ width: 70, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: '#e0e8f0', fontSize: 12, fontFamily: 'inherit' }} />
                <input type="number" placeholder="Min GTD" value={dtMinGtd}
                    onChange={(e) => setFilters(f => ({ ...f, hubDailyMinGtd: e.target.value }))}
                    style={{ width: 80, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: '#e0e8f0', fontSize: 12, fontFamily: 'inherit' }} />
                <select value={dtSort}
                    onChange={(e) => setFilters(f => ({ ...f, hubDailySort: e.target.value }))}
                    className="sort-select" style={{ fontSize: 12 }}>
                    <option value="time">Start Time</option>
                    <option value="buyin">Buy-In</option>
                    <option value="guaranteed">Guaranteed</option>
                </select>
            </div>

            {/* Result count */}
            <div className="results-bar" style={{ marginBottom: 8 }}>
                <span className="results-count"><span style={{ color: '#ffffff', fontWeight: 800 }}>{filtered.length}</span> tournament{filtered.length !== 1 ? 's' : ''}</span>
                {!pendingDay && filtered.length > shown.length && (
                    <span className="results-showing">Showing {shown.length} of {filtered.length}</span>
                )}
            </div>

            {pendingDay ? (
                <div className="card-grid daily-grid">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={'skel-' + i} className="entity-card skeleton-card">
                            <div className="skel skel-header"></div>
                            <div className="skel skel-title"></div>
                            <div className="skel skel-text"></div>
                            <div className="skel skel-tags"></div>
                            <div className="skel skel-footer"></div>
                        </div>
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="empty-state">
                    <p>No daily tournaments match your filters for {filters.selectedDay}</p>
                    <button onClick={() => setFilters(f => ({ ...f, hubDailyGameType: 'all', hubDailyMinBuyin: '', hubDailyMaxBuyin: '', hubDailyMinGtd: '' }))}>Clear Daily Filters</button>
                </div>
            ) : (
                <>
                <div className="card-grid daily-grid">
                    {shown.map((t, i) => (
                        <div key={t.id || i} className="entity-card daily-card">
                            <div className="card-header">
                                <span className="time-badge">{t.start_time}</span>
                                <span className="badge game-type">{formatGameType(t.game_type)}</span>
                            </div>
                            <h4>{t.venue_name}</h4>
                            {(t.city || t.state) && <p className="card-location">{[t.city, t.state].filter(Boolean).join(', ')}</p>}
                            <div className="card-tags">
                                <span className="tag buyin">{formatBuyIn(t.buy_in)}</span>
                                {t.guaranteed > 0 && <span className="tag gtd">{formatMoney(t.guaranteed)} GTD</span>}
                                {t.format && <span className="tag format">{t.format}</span>}
                            </div>
                            {t.tournament_name && (
                                <p className="card-detail">{t.tournament_name}</p>
                            )}
                            <div className="card-footer">
                                {t.venueType && t.venueType !== 'Unknown' && <span className="venue-type">{t.venueType.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>}
                                {t.pokerAtlasUrl && (
                                    <a href={t.pokerAtlasUrl} target="_blank" rel="noopener noreferrer" className="action-btn primary">
                                        Info
                                    </a>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                {filtered.length > shown.length && (
                    <div className="load-more">
                        <button className="load-more-btn" onClick={() => setRenderLimit(l => l + PAGE_SIZE)}>
                            Load More ({filtered.length - shown.length} remaining)
                        </button>
                    </div>
                )}
                </>
            )}
        </>
    );
}
