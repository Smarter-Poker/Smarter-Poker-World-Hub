/**
 * DailyTournamentsTabPanel — Extracted from poker-near-me.js renderDailyTournaments()
 * Daily tournament listing with day selector, game type chips, and filters.
 */
import React from 'react';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatMoney(amount) {
    if (!amount) return '';
    if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(0) + 'M';
    if (amount >= 1000) return '$' + (amount / 1000).toFixed(0) + 'K';
    return '$' + amount.toLocaleString();
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

    // Apply client-side filters
    let filtered = dailyTournaments;
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

    return (
        <>
            {/* Day selector */}
            <div className="day-selector">
                {DAYS_OF_WEEK.map(day => (
                    <button
                        key={day}
                        className={'day-btn' + (filters.selectedDay === day ? ' active' : '')}
                        onClick={() => {
                            setFilters(f => ({ ...f, selectedDay: day }));
                            fetchDailyTournaments(day);
                        }}
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
            </div>

            {filtered.length === 0 ? (
                <div className="empty-state">
                    <p>No daily tournaments match your filters for {filters.selectedDay}</p>
                    <button onClick={() => setFilters(f => ({ ...f, hubDailyGameType: 'all', hubDailyMinBuyin: '', hubDailyMaxBuyin: '', hubDailyMinGtd: '' }))}>Clear Daily Filters</button>
                </div>
            ) : (
                <div className="card-grid daily-grid">
                    {filtered.slice(0, 50).map((t, i) => (
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
            )}
        </>
    );
}
