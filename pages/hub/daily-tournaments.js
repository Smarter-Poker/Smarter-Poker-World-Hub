/**
 * DAILY TOURNAMENTS - Find poker tournaments happening today
 * Source of Truth: data/tournament-venues.json (163 confirmed venues)
 */

import Head from 'next/head';
import { useState, useEffect } from 'react';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const POPULAR_STATES = [
    { name: 'Texas', abbr: 'TX' },
    { name: 'California', abbr: 'CA' },
    { name: 'Florida', abbr: 'FL' },
    { name: 'Nevada', abbr: 'NV' },
];

const VENUE_TYPES = [
    { label: 'All Venues', value: '' },
    { label: 'Casinos', value: 'Casino' },
    { label: 'Card Rooms', value: 'Card Room' },
    { label: 'Charity', value: 'Charity' },
];

const BUYIN_RANGES = [
    { label: 'All Buy-ins', min: null, max: null },
    { label: 'Under $50', min: null, max: 50 },
    { label: '$50 - $100', min: 50, max: 100 },
    { label: '$100 - $200', min: 100, max: 200 },
    { label: '$200+', min: 200, max: null },
];

function formatTime(timeStr) {
    if (!timeStr) return '';
    return timeStr.replace(/([AP])M$/i, ' $1M');
}

function formatMoney(amount) {
    if (!amount) return '';
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toLocaleString()}`;
}

export default function DailyTournaments() {
    const [tournaments, setTournaments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDay, setSelectedDay] = useState(DAYS[new Date().getDay()]);
    const [selectedState, setSelectedState] = useState(null);
    const [selectedType, setSelectedType] = useState('');
    const [selectedBuyin, setSelectedBuyin] = useState(BUYIN_RANGES[0]);
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [stats, setStats] = useState({});

    useEffect(() => {
        fetchTournaments();
    }, [selectedDay, selectedState, selectedType, selectedBuyin]);

    const fetchTournaments = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ day: selectedDay });
            if (selectedState) params.set('state', selectedState.abbr);
            if (selectedType) params.set('type', selectedType);
            if (selectedBuyin.min) params.set('minBuyin', selectedBuyin.min.toString());
            if (selectedBuyin.max) params.set('maxBuyin', selectedBuyin.max.toString());
            if (searchQuery) params.set('venue', searchQuery);

            const res = await fetch(`/api/poker/daily-tournaments?${params}`);
            const data = await res.json();

            if (data.success) {
                setTournaments(data.tournaments || []);
                setStats(data.stats || {});
            } else {
                setTournaments([]);
            }
        } catch (e) {
            console.error('Fetch tournaments error:', e);
            setTournaments([]);
        }
        setLoading(false);
    };

    const handleSearch = (e) => {
        e.preventDefault();
        fetchTournaments();
    };

    const clearFilters = () => {
        setSelectedState(null);
        setSelectedType('');
        setSelectedBuyin(BUYIN_RANGES[0]);
        setSearchQuery('');
    };

    // Group tournaments by time slot
    const morningTournaments = tournaments.filter(t => {
        const time = parseTimeToMinutes(t.start_time);
        return time < 720; // Before 12pm
    });
    const afternoonTournaments = tournaments.filter(t => {
        const time = parseTimeToMinutes(t.start_time);
        return time >= 720 && time < 1020; // 12pm - 5pm
    });
    const eveningTournaments = tournaments.filter(t => {
        const time = parseTimeToMinutes(t.start_time);
        return time >= 1020; // 5pm+
    });

    function parseTimeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
        if (!match) return 0;
        let hours = parseInt(match[1]);
        const minutes = parseInt(match[2] || '0');
        const period = (match[3] || '').toUpperCase();
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        return hours * 60 + minutes;
    }

    return (
        <>
            <Head>
                <title>Daily Tournaments | Smarter.Poker</title>
                <meta name="description" content="Find poker tournaments happening today at 163 verified venues across the US." />
            </Head>

            <div className="dt-page">
                {/* Space Background */}
                <div className="space-bg"></div>
                <div className="space-overlay"></div>

                <UniversalHeader pageDepth={1} />

                {/* Page Header */}
                <div className="dt-header">
                    <h1><span className="white">DAILY</span> <span className="gold">TOURNAMENTS</span></h1>
                    <span className="subtitle">163 VERIFIED VENUES WITH TOURNAMENTS</span>
                </div>

                {/* Day Selector */}
                <div className="day-selector">
                    <div className="day-tabs">
                        {DAYS.map(day => (
                            <button
                                key={day}
                                className={`day-tab ${selectedDay === day ? 'active' : ''}`}
                                onClick={() => setSelectedDay(day)}
                            >
                                <span className="day-short">{day.substring(0, 3)}</span>
                                <span className="day-full">{day}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Search Section */}
                <div className="dt-search-section">
                    <div className="search-container">
                        <form className="search-form" onSubmit={handleSearch}>
                            <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                            </svg>
                            <input
                                type="text"
                                placeholder="Search venue name"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </form>

                        <div className="search-controls">
                            <button className={`btn-filters ${showFilters ? 'active' : ''}`} onClick={() => setShowFilters(!showFilters)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
                                    <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
                                    <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
                                </svg>
                                Filters
                            </button>

                            {stats.total > 0 && (
                                <div className="stats-display">
                                    <span className="stat">{stats.total} tournaments</span>
                                    {stats.avgBuyin > 0 && <span className="stat">Avg ${stats.avgBuyin}</span>}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Filter Panel */}
                {showFilters && (
                    <div className="filter-panel">
                        <div className="filter-group">
                            <label>State</label>
                            <div className="filter-chips">
                                <button className={`chip ${!selectedState ? 'active' : ''}`} onClick={() => setSelectedState(null)}>All States</button>
                                {POPULAR_STATES.map(state => (
                                    <button key={state.abbr} className={`chip ${selectedState?.abbr === state.abbr ? 'active' : ''}`}
                                        onClick={() => setSelectedState(state)}>
                                        {state.abbr}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="filter-group">
                            <label>Venue Type</label>
                            <div className="filter-chips">
                                {VENUE_TYPES.map(type => (
                                    <button key={type.value} className={`chip ${selectedType === type.value ? 'active' : ''}`}
                                        onClick={() => setSelectedType(type.value)}>
                                        {type.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="filter-group">
                            <label>Buy-in Range</label>
                            <div className="filter-chips">
                                {BUYIN_RANGES.map((range, i) => (
                                    <button key={i} className={`chip ${selectedBuyin.label === range.label ? 'active' : ''}`}
                                        onClick={() => setSelectedBuyin(range)}>
                                        {range.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="filter-actions">
                            <button className="btn-clear" onClick={clearFilters}>Clear All</button>
                            <button className="btn-apply" onClick={() => { fetchTournaments(); setShowFilters(false); }}>Apply Filters</button>
                        </div>
                    </div>
                )}

                {/* Main Layout */}
                <div className="dt-layout">
                    {/* Left Sidebar */}
                    <aside className="sidebar-left">
                        <div className="sidebar-section">
                            <h3>Popular States</h3>
                            <div className="state-chips">
                                {POPULAR_STATES.map(state => (
                                    <button key={state.abbr} className={`state-chip ${selectedState?.abbr === state.abbr ? 'active' : ''}`}
                                        onClick={() => setSelectedState(state)}>
                                        <span className="state-abbr">{state.abbr}</span>
                                        <span className="state-name">{state.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="sidebar-section source-info">
                            <h3>Data Source</h3>
                            <p>Tournament schedules from PokerAtlas for 163 verified venues with confirmed daily tournaments.</p>
                            <div className="source-badge">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                    <polyline points="22 4 12 14.01 9 11.01"/>
                                </svg>
                                Verified Source
                            </div>
                        </div>

                        <div className="sidebar-section venue-type-breakdown">
                            <h3>Venue Types</h3>
                            <div className="type-list">
                                <div className="type-item">
                                    <span>Casinos</span>
                                    <span className="count">60</span>
                                </div>
                                <div className="type-item">
                                    <span>Card Rooms</span>
                                    <span className="count">76</span>
                                </div>
                                <div className="type-item">
                                    <span>Charity</span>
                                    <span className="count">27</span>
                                </div>
                            </div>
                        </div>
                    </aside>

                    {/* Center - Tournament Cards */}
                    <main className="tournament-feed">
                        {loading ? (
                            <div className="loading-state">
                                <div className="spinner"></div>
                                <span>Finding tournaments...</span>
                            </div>
                        ) : tournaments.length === 0 ? (
                            <div className="empty-state">
                                <p>No tournaments found for {selectedDay}</p>
                                <button onClick={clearFilters}>Clear Filters</button>
                            </div>
                        ) : (
                            <div className="tournament-sections">
                                {morningTournaments.length > 0 && (
                                    <div className="time-section">
                                        <h2 className="time-header">
                                            <span className="time-icon">AM</span>
                                            Morning Tournaments
                                            <span className="time-count">{morningTournaments.length}</span>
                                        </h2>
                                        <div className="tournament-list">
                                            {morningTournaments.map((t, i) => (
                                                <TournamentCard key={t.id || i} tournament={t} />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {afternoonTournaments.length > 0 && (
                                    <div className="time-section">
                                        <h2 className="time-header">
                                            <span className="time-icon afternoon">PM</span>
                                            Afternoon Tournaments
                                            <span className="time-count">{afternoonTournaments.length}</span>
                                        </h2>
                                        <div className="tournament-list">
                                            {afternoonTournaments.map((t, i) => (
                                                <TournamentCard key={t.id || i} tournament={t} />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {eveningTournaments.length > 0 && (
                                    <div className="time-section">
                                        <h2 className="time-header">
                                            <span className="time-icon evening">EVE</span>
                                            Evening Tournaments
                                            <span className="time-count">{eveningTournaments.length}</span>
                                        </h2>
                                        <div className="tournament-list">
                                            {eveningTournaments.map((t, i) => (
                                                <TournamentCard key={t.id || i} tournament={t} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </main>

                    {/* Right Sidebar - Quick Stats */}
                    <aside className="sidebar-right">
                        <div className="sidebar-section">
                            <h3>Today's Highlights</h3>
                            <div className="highlight-cards">
                                <div className="highlight-card">
                                    <span className="highlight-label">Total Tournaments</span>
                                    <span className="highlight-value">{stats.total || 0}</span>
                                </div>
                                <div className="highlight-card">
                                    <span className="highlight-label">Average Buy-in</span>
                                    <span className="highlight-value">${stats.avgBuyin || 0}</span>
                                </div>
                            </div>
                        </div>

                        <div className="sidebar-section">
                            <h3>By Game Type</h3>
                            <div className="game-breakdown">
                                {stats.byGameType && Object.entries(stats.byGameType).map(([game, count]) => (
                                    <div key={game} className="game-item">
                                        <span className="game-name">{game}</span>
                                        <span className="game-count">{count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="sidebar-section quick-links">
                            <h3>Quick Links</h3>
                            <a href="/hub/poker-near-me" className="quick-link">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                                    <circle cx="12" cy="10" r="3"/>
                                </svg>
                                Find Poker Rooms
                            </a>
                        </div>
                    </aside>
                </div>

                <style jsx>{`
                    .dt-page {
                        min-height: 100vh;
                        position: relative;
                        color: #fff;
                        font-family: 'Inter', -apple-system, sans-serif;
                        overflow-x: hidden;
                    }

                    /* Space Background */
                    .space-bg {
                        position: fixed;
                        inset: 0;
                        background:
                            radial-gradient(ellipse at 20% 20%, rgba(59, 130, 246, 0.15) 0%, transparent 50%),
                            radial-gradient(ellipse at 80% 80%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
                            radial-gradient(ellipse at 50% 50%, rgba(6, 182, 212, 0.08) 0%, transparent 60%),
                            linear-gradient(180deg, #030712 0%, #0a1628 30%, #0f172a 50%, #0a1628 70%, #030712 100%);
                        z-index: -2;
                    }
                    .space-overlay {
                        position: fixed;
                        inset: 0;
                        background: linear-gradient(180deg, rgba(3,7,18,0.3) 0%, transparent 20%, transparent 80%, rgba(3,7,18,0.5) 100%);
                        z-index: -1;
                    }

                    /* Header */
                    .dt-header {
                        padding: 24px 20px;
                        display: flex;
                        align-items: baseline;
                        gap: 16px;
                        flex-wrap: wrap;
                    }
                    .dt-header h1 {
                        font-size: 28px;
                        font-weight: 700;
                        margin: 0;
                        letter-spacing: 1px;
                    }
                    .dt-header .white { color: #fff; }
                    .dt-header .gold { color: #d4a853; }
                    .dt-header .subtitle {
                        font-size: 14px;
                        color: rgba(255,255,255,0.5);
                        font-weight: 400;
                        letter-spacing: 1px;
                    }

                    /* Day Selector */
                    .day-selector {
                        padding: 0 20px 16px;
                        overflow-x: auto;
                    }
                    .day-tabs {
                        display: flex;
                        gap: 4px;
                        min-width: min-content;
                    }
                    .day-tab {
                        padding: 10px 16px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 8px;
                        color: rgba(255,255,255,0.7);
                        font-size: 14px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s;
                        white-space: nowrap;
                    }
                    .day-tab:hover {
                        background: rgba(255,255,255,0.1);
                    }
                    .day-tab.active {
                        background: linear-gradient(135deg, #d4a853, #b8860b);
                        border-color: transparent;
                        color: #000;
                    }
                    .day-full { display: none; }
                    @media (min-width: 768px) {
                        .day-short { display: none; }
                        .day-full { display: inline; }
                    }

                    /* Search Section */
                    .dt-search-section {
                        padding: 0 20px 20px;
                    }
                    .search-container {
                        background: rgba(15, 23, 42, 0.6);
                        backdrop-filter: blur(12px);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 16px;
                        padding: 16px;
                    }
                    .search-form {
                        position: relative;
                        margin-bottom: 12px;
                    }
                    .search-icon {
                        position: absolute;
                        left: 16px;
                        top: 50%;
                        transform: translateY(-50%);
                        color: rgba(255,255,255,0.4);
                    }
                    .search-form input {
                        width: 100%;
                        padding: 14px 16px 14px 48px;
                        background: rgba(0,0,0,0.3);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 12px;
                        color: #fff;
                        font-size: 15px;
                        outline: none;
                        transition: all 0.2s;
                    }
                    .search-form input:focus {
                        border-color: rgba(212,168,83,0.5);
                        box-shadow: 0 0 0 3px rgba(212,168,83,0.1);
                    }
                    .search-form input::placeholder { color: rgba(255,255,255,0.4); }

                    .search-controls {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                    }
                    .btn-filters {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 12px 16px;
                        background: rgba(0,0,0,0.3);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 10px;
                        color: rgba(255,255,255,0.8);
                        font-size: 14px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .btn-filters:hover {
                        background: rgba(255,255,255,0.1);
                    }
                    .btn-filters.active {
                        background: rgba(212,168,83,0.2);
                        border-color: rgba(212,168,83,0.5);
                        color: #d4a853;
                    }

                    .stats-display {
                        display: flex;
                        gap: 16px;
                        margin-left: auto;
                    }
                    .stats-display .stat {
                        font-size: 13px;
                        color: rgba(255,255,255,0.6);
                    }

                    /* Filter Panel */
                    .filter-panel {
                        margin: 0 20px 20px;
                        padding: 16px;
                        background: rgba(15, 23, 42, 0.8);
                        backdrop-filter: blur(12px);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 12px;
                    }
                    .filter-group { margin-bottom: 16px; }
                    .filter-group label {
                        display: block;
                        font-size: 11px;
                        color: rgba(255,255,255,0.5);
                        margin-bottom: 8px;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                    }
                    .filter-chips { display: flex; flex-wrap: wrap; gap: 8px; }
                    .chip {
                        padding: 8px 14px;
                        background: rgba(0,0,0,0.3);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 20px;
                        color: rgba(255,255,255,0.7);
                        font-size: 13px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .chip:hover { background: rgba(255,255,255,0.1); }
                    .chip.active {
                        background: rgba(212,168,83,0.2);
                        border-color: rgba(212,168,83,0.5);
                        color: #d4a853;
                    }
                    .filter-actions {
                        display: flex;
                        gap: 12px;
                    }
                    .btn-clear {
                        flex: 1;
                        padding: 12px;
                        background: rgba(0,0,0,0.3);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 10px;
                        color: rgba(255,255,255,0.7);
                        font-size: 14px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .btn-clear:hover { background: rgba(255,255,255,0.1); }
                    .btn-apply {
                        flex: 2;
                        padding: 12px;
                        background: linear-gradient(135deg, #d4a853, #b8860b);
                        border: none;
                        border-radius: 10px;
                        color: #000;
                        font-size: 14px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .btn-apply:hover {
                        transform: translateY(-1px);
                        box-shadow: 0 4px 12px rgba(212,168,83,0.3);
                    }

                    /* Layout */
                    .dt-layout {
                        display: flex;
                        flex-direction: column;
                        min-height: calc(100vh - 350px);
                        padding: 0 20px;
                    }
                    .sidebar-left, .sidebar-right { display: none; }
                    .tournament-feed { flex: 1; }

                    /* Sidebar Sections */
                    .sidebar-section {
                        padding: 20px;
                        border-bottom: 1px solid rgba(255,255,255,0.08);
                    }
                    .sidebar-section h3 {
                        font-size: 11px;
                        font-weight: 600;
                        color: rgba(255,255,255,0.5);
                        text-transform: uppercase;
                        letter-spacing: 1px;
                        margin: 0 0 14px;
                    }

                    .state-chips { display: flex; flex-direction: column; gap: 8px; }
                    .state-chip {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 10px 14px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 8px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .state-chip:hover {
                        background: rgba(255,255,255,0.1);
                    }
                    .state-chip.active {
                        background: rgba(212,168,83,0.15);
                        border-color: rgba(212,168,83,0.4);
                    }
                    .state-abbr {
                        font-weight: 600;
                        color: #d4a853;
                    }
                    .state-chip.active .state-abbr { color: #d4a853; }
                    .state-name { color: rgba(255,255,255,0.7); font-size: 13px; }

                    .source-info p {
                        font-size: 13px;
                        color: rgba(255,255,255,0.6);
                        line-height: 1.5;
                        margin: 0 0 12px;
                    }
                    .source-badge {
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                        padding: 8px 12px;
                        background: rgba(34,197,94,0.15);
                        border: 1px solid rgba(34,197,94,0.3);
                        border-radius: 6px;
                        font-size: 12px;
                        color: #22c55e;
                    }

                    .type-list { display: flex; flex-direction: column; gap: 10px; }
                    .type-item {
                        display: flex;
                        justify-content: space-between;
                        font-size: 13px;
                        color: rgba(255,255,255,0.7);
                    }
                    .type-item .count {
                        color: #d4a853;
                        font-weight: 600;
                    }

                    /* Loading / Empty State */
                    .loading-state, .empty-state {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 80px 20px;
                        color: rgba(255,255,255,0.5);
                    }
                    .spinner {
                        width: 40px;
                        height: 40px;
                        border: 3px solid rgba(255,255,255,0.1);
                        border-top-color: #d4a853;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin-bottom: 16px;
                    }
                    @keyframes spin { to { transform: rotate(360deg); } }
                    .empty-state button {
                        margin-top: 16px;
                        padding: 12px 24px;
                        background: rgba(212,168,83,0.2);
                        border: 1px solid rgba(212,168,83,0.4);
                        border-radius: 8px;
                        color: #d4a853;
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    /* Time Sections */
                    .tournament-sections { display: flex; flex-direction: column; gap: 32px; }
                    .time-section { }
                    .time-header {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        font-size: 16px;
                        font-weight: 600;
                        margin: 0 0 16px;
                        padding-bottom: 12px;
                        border-bottom: 1px solid rgba(255,255,255,0.1);
                    }
                    .time-icon {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        width: 36px;
                        height: 24px;
                        background: rgba(59,130,246,0.2);
                        border: 1px solid rgba(59,130,246,0.4);
                        border-radius: 4px;
                        font-size: 11px;
                        font-weight: 700;
                        color: #3b82f6;
                    }
                    .time-icon.afternoon {
                        background: rgba(245,158,11,0.2);
                        border-color: rgba(245,158,11,0.4);
                        color: #f59e0b;
                    }
                    .time-icon.evening {
                        background: rgba(139,92,246,0.2);
                        border-color: rgba(139,92,246,0.4);
                        color: #8b5cf6;
                    }
                    .time-count {
                        margin-left: auto;
                        font-size: 13px;
                        font-weight: 500;
                        color: rgba(255,255,255,0.5);
                    }

                    .tournament-list {
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                    }

                    /* Right Sidebar */
                    .highlight-cards { display: flex; flex-direction: column; gap: 10px; }
                    .highlight-card {
                        padding: 14px;
                        background: rgba(255,255,255,0.05);
                        border-radius: 10px;
                    }
                    .highlight-label {
                        display: block;
                        font-size: 11px;
                        color: rgba(255,255,255,0.5);
                        text-transform: uppercase;
                        margin-bottom: 6px;
                    }
                    .highlight-value {
                        font-size: 24px;
                        font-weight: 700;
                        color: #d4a853;
                    }

                    .game-breakdown { display: flex; flex-direction: column; gap: 10px; }
                    .game-item {
                        display: flex;
                        justify-content: space-between;
                        padding: 8px 12px;
                        background: rgba(255,255,255,0.03);
                        border-radius: 6px;
                    }
                    .game-name { font-size: 13px; color: rgba(255,255,255,0.8); }
                    .game-count { font-size: 13px; color: #d4a853; font-weight: 600; }

                    .quick-links { display: flex; flex-direction: column; gap: 10px; }
                    .quick-link {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 12px 14px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 8px;
                        color: rgba(255,255,255,0.8);
                        text-decoration: none;
                        font-size: 13px;
                        transition: all 0.2s;
                    }
                    .quick-link:hover {
                        background: rgba(255,255,255,0.1);
                        border-color: rgba(255,255,255,0.2);
                    }

                    /* Responsive */
                    @media (min-width: 768px) {
                        .tournament-list {
                            display: grid;
                            grid-template-columns: repeat(2, 1fr);
                            gap: 14px;
                        }
                    }

                    @media (min-width: 1024px) {
                        .dt-layout {
                            display: grid;
                            grid-template-columns: 260px 1fr 300px;
                            gap: 0;
                            padding: 0;
                        }
                        .sidebar-left {
                            display: flex;
                            flex-direction: column;
                            border-right: 1px solid rgba(255,255,255,0.08);
                            background: rgba(0,0,0,0.2);
                            backdrop-filter: blur(8px);
                        }
                        .sidebar-right {
                            display: block;
                            border-left: 1px solid rgba(255,255,255,0.08);
                            background: rgba(0,0,0,0.2);
                            backdrop-filter: blur(8px);
                        }
                        .tournament-feed { padding: 20px; }
                        .tournament-list { grid-template-columns: 1fr; }
                        .dt-search-section {
                            padding: 0 20px 20px;
                            margin-left: 260px;
                            margin-right: 300px;
                        }
                        .dt-header {
                            margin-left: 260px;
                        }
                        .day-selector {
                            margin-left: 260px;
                            margin-right: 300px;
                        }
                        .filter-panel {
                            margin-left: calc(260px + 20px);
                            margin-right: calc(300px + 20px);
                        }
                    }

                    @media (min-width: 1280px) {
                        .dt-layout {
                            grid-template-columns: 280px 1fr 320px;
                        }
                        .tournament-list {
                            grid-template-columns: repeat(2, 1fr);
                        }
                        .dt-search-section {
                            margin-left: 280px;
                            margin-right: 320px;
                        }
                        .dt-header {
                            margin-left: 280px;
                        }
                        .day-selector {
                            margin-left: 280px;
                            margin-right: 320px;
                        }
                        .filter-panel {
                            margin-left: calc(280px + 20px);
                            margin-right: calc(320px + 20px);
                        }
                    }
                `}</style>
            </div>
        </>
    );
}

// Tournament Card Component
function TournamentCard({ tournament }) {
    const t = tournament;

    return (
        <div className="tournament-card">
            <div className="card-header">
                <span className="card-time">{formatTime(t.start_time)}</span>
                <span className="card-buyin">${t.buy_in}</span>
            </div>
            <h4 className="card-venue">{t.venue_name}</h4>
            <p className="card-location">{t.city}, {t.state}</p>
            <div className="card-tags">
                <span className={`tag game-type ${t.game_type?.toLowerCase()}`}>{t.game_type || 'NLH'}</span>
                {t.format && <span className="tag format">{t.format}</span>}
                {t.guaranteed && <span className="tag guaranteed">{formatMoney(t.guaranteed)} GTD</span>}
                <span className="tag venue-type">{t.venueType}</span>
            </div>
            {t.pokerAtlasUrl && (
                <a href={t.pokerAtlasUrl} target="_blank" rel="noopener noreferrer" className="card-link">
                    View on PokerAtlas
                </a>
            )}

            <style jsx>{`
                .tournament-card {
                    padding: 16px 18px;
                    background: rgba(15, 23, 42, 0.5);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 12px;
                    transition: all 0.2s ease;
                }
                .tournament-card:hover {
                    border-color: rgba(255, 255, 255, 0.25);
                    background: rgba(15, 23, 42, 0.7);
                }
                .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                }
                .card-time {
                    font-size: 13px;
                    font-weight: 600;
                    color: #22c55e;
                    padding: 4px 10px;
                    background: rgba(34, 197, 94, 0.15);
                    border-radius: 4px;
                }
                .card-buyin {
                    font-size: 18px;
                    font-weight: 700;
                    color: #d4a853;
                }
                .card-venue {
                    font-size: 16px;
                    font-weight: 600;
                    margin: 0 0 4px;
                    color: #fff;
                }
                .card-location {
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.5);
                    margin: 0 0 12px;
                }
                .card-tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    margin-bottom: 12px;
                }
                .tag {
                    font-size: 11px;
                    padding: 4px 8px;
                    background: rgba(255, 255, 255, 0.08);
                    border-radius: 4px;
                    color: rgba(255, 255, 255, 0.7);
                }
                .tag.game-type.nlh {
                    background: rgba(59, 130, 246, 0.2);
                    color: #60a5fa;
                }
                .tag.game-type.plo {
                    background: rgba(239, 68, 68, 0.2);
                    color: #f87171;
                }
                .tag.format {
                    background: rgba(139, 92, 246, 0.2);
                    color: #a78bfa;
                }
                .tag.guaranteed {
                    background: rgba(34, 197, 94, 0.2);
                    color: #4ade80;
                }
                .card-link {
                    display: block;
                    text-align: center;
                    padding: 8px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    color: rgba(255, 255, 255, 0.7);
                    text-decoration: none;
                    font-size: 12px;
                    transition: all 0.2s;
                }
                .card-link:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: #fff;
                }
            `}</style>
        </div>
    );
}
