/**
 * LIVE GAMES HUB - Real-time cash game tracker
 * Shows what games are running NOW at poker venues across the US
 */

import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

const GAME_TYPES = [
    { label: 'All Games', value: '' },
    { label: 'No Limit Hold\'em', value: 'NLH' },
    { label: 'Pot Limit Omaha', value: 'PLO' },
];

const POPULAR_STAKES = ['1/2', '1/3', '2/5', '5/10', '10/20'];

const POPULAR_STATES = [
    { name: 'Nevada', abbr: 'NV' },
    { name: 'Texas', abbr: 'TX' },
    { name: 'California', abbr: 'CA' },
    { name: 'Florida', abbr: 'FL' },
];

export default function LiveGames() {
    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedGame, setSelectedGame] = useState('');
    const [selectedStakes, setSelectedStakes] = useState([]);
    const [selectedState, setSelectedState] = useState(null);
    const [userLocation, setUserLocation] = useState(null);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [stats, setStats] = useState({});
    const [lastUpdated, setLastUpdated] = useState(null);
    const [autoRefresh, setAutoRefresh] = useState(true);

    // Fetch games
    const fetchGames = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (selectedGame) params.set('game', selectedGame);
            if (selectedStakes.length > 0) params.set('stakes', selectedStakes.join(','));
            if (selectedState) params.set('state', selectedState.abbr);
            if (userLocation) {
                params.set('lat', userLocation.lat.toString());
                params.set('lng', userLocation.lng.toString());
                params.set('radius', '150');
            }
            params.set('limit', '100');

            const res = await fetch(`/api/poker/live-games?${params}`);
            const data = await res.json();

            if (data.success) {
                setGames(data.games || []);
                setStats(data.stats || {});
                setLastUpdated(new Date(data.timestamp));
            }
        } catch (e) {
            console.error('Fetch live games error:', e);
        }
        setLoading(false);
    }, [selectedGame, selectedStakes, selectedState, userLocation]);

    useEffect(() => {
        fetchGames();
    }, [fetchGames]);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(fetchGames, 30000);
        return () => clearInterval(interval);
    }, [autoRefresh, fetchGames]);

    const requestGpsLocation = () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported');
            return;
        }
        setGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setGpsLoading(false);
            },
            () => {
                alert('Unable to get location');
                setGpsLoading(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    const toggleStakes = (stake) => {
        if (selectedStakes.includes(stake)) {
            setSelectedStakes(selectedStakes.filter(s => s !== stake));
        } else {
            setSelectedStakes([...selectedStakes, stake]);
        }
    };

    const clearFilters = () => {
        setSelectedGame('');
        setSelectedStakes([]);
        setSelectedState(null);
        setUserLocation(null);
    };

    // Group games by venue for the feed
    const gamesByVenue = games.reduce((acc, game) => {
        const key = game.venue.name;
        if (!acc[key]) acc[key] = { venue: game.venue, games: [] };
        acc[key].games.push(game);
        return acc;
    }, {});

    // Hot games section
    const hotGames = games.filter(g => g.status.action.level === 'hot').slice(0, 6);

    return (
        <>
            <Head>
                <title>Live Games | Smarter.Poker</title>
                <meta name="description" content="Real-time cash game tracker - see what games are running NOW at 178 poker venues." />
            </Head>

            <div className="lg-page">
                {/* Space Background */}
                <div className="space-bg"></div>
                <div className="space-overlay"></div>

                <UniversalHeader pageDepth={1} />

                {/* Page Header */}
                <div className="lg-header">
                    <div className="header-content">
                        <h1><span className="white">LIVE</span> <span className="gold">GAMES</span></h1>
                        <span className="subtitle">REAL-TIME CASH GAME TRACKER</span>
                    </div>
                    <div className="header-stats">
                        <div className="live-indicator">
                            <span className="pulse"></span>
                            <span className="live-text">LIVE</span>
                        </div>
                        {lastUpdated && (
                            <span className="last-updated">
                                Updated {lastUpdated.toLocaleTimeString()}
                            </span>
                        )}
                    </div>
                </div>

                {/* Stats Bar */}
                <div className="stats-bar">
                    <div className="stat-item">
                        <span className="stat-value">{stats.totalGames || 0}</span>
                        <span className="stat-label">Games Running</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-value">{stats.totalTables || 0}</span>
                        <span className="stat-label">Total Tables</span>
                    </div>
                    <div className="stat-item hot">
                        <span className="stat-value">{stats.hotGames || 0}</span>
                        <span className="stat-label">Hot Action</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-value">{stats.avgWaitTime || 0}m</span>
                        <span className="stat-label">Avg Wait</span>
                    </div>
                </div>

                {/* Search Section */}
                <div className="lg-search-section">
                    <div className="search-container">
                        <div className="quick-filters">
                            <button className={`btn-gps ${userLocation ? 'active' : ''}`} onClick={requestGpsLocation} disabled={gpsLoading}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polygon points="3 11 22 2 13 21 11 13 3 11"/>
                                </svg>
                                {gpsLoading ? 'Locating...' : userLocation ? 'Near Me' : 'Use GPS'}
                            </button>

                            {POPULAR_STAKES.slice(0, 4).map(stake => (
                                <button
                                    key={stake}
                                    className={`stake-btn ${selectedStakes.includes(stake) ? 'active' : ''}`}
                                    onClick={() => toggleStakes(stake)}
                                >
                                    {stake}
                                </button>
                            ))}

                            <button className={`btn-filters ${showFilters ? 'active' : ''}`} onClick={() => setShowFilters(!showFilters)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
                                    <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
                                    <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
                                </svg>
                                More
                            </button>
                        </div>

                        <div className="refresh-toggle">
                            <label className="toggle-switch">
                                <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
                                <span className="toggle-slider"></span>
                            </label>
                            <span className="toggle-label">Auto-refresh</span>
                            <button className="btn-refresh" onClick={fetchGames}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M23 4v6h-6M1 20v-6h6"/>
                                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Filter Panel */}
                {showFilters && (
                    <div className="filter-panel">
                        <div className="filter-group">
                            <label>Game Type</label>
                            <div className="filter-chips">
                                {GAME_TYPES.map(type => (
                                    <button key={type.value} className={`chip ${selectedGame === type.value ? 'active' : ''}`}
                                        onClick={() => setSelectedGame(type.value)}>
                                        {type.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="filter-group">
                            <label>Stakes</label>
                            <div className="filter-chips">
                                {POPULAR_STAKES.map(stake => (
                                    <button key={stake} className={`chip ${selectedStakes.includes(stake) ? 'active' : ''}`}
                                        onClick={() => toggleStakes(stake)}>
                                        {stake}
                                    </button>
                                ))}
                            </div>
                        </div>
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
                        <div className="filter-actions">
                            <button className="btn-clear" onClick={clearFilters}>Clear All</button>
                            <button className="btn-apply" onClick={() => setShowFilters(false)}>Apply</button>
                        </div>
                    </div>
                )}

                {/* Main Layout */}
                <div className="lg-layout">
                    {/* Left Sidebar */}
                    <aside className="sidebar-left">
                        <div className="sidebar-section">
                            <h3>Filter by State</h3>
                            <div className="state-chips">
                                {POPULAR_STATES.map(state => (
                                    <button key={state.abbr} className={`state-chip ${selectedState?.abbr === state.abbr ? 'active' : ''}`}
                                        onClick={() => setSelectedState(state)}>
                                        <span className="state-abbr">{state.abbr}</span>
                                        <span className="state-name">{state.name}</span>
                                        <span className="state-count">{stats.byState?.[state.abbr] || 0}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="sidebar-section">
                            <h3>By Game Type</h3>
                            <div className="game-breakdown">
                                {Object.entries(stats.byGameType || {}).map(([game, count]) => (
                                    <div key={game} className="game-item" onClick={() => setSelectedGame(game)}>
                                        <span className={`game-badge ${game.toLowerCase()}`}>{game}</span>
                                        <span className="game-count">{count} games</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="sidebar-section">
                            <h3>Stakes Breakdown</h3>
                            <div className="stakes-breakdown">
                                {Object.entries(stats.byStakes || {}).slice(0, 6).map(([stake, count]) => (
                                    <div key={stake} className="stake-item" onClick={() => toggleStakes(stake)}>
                                        <span className="stake-level">{stake}</span>
                                        <div className="stake-bar">
                                            <div className="stake-fill" style={{ width: `${Math.min(100, count * 5)}%` }}></div>
                                        </div>
                                        <span className="stake-count">{count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </aside>

                    {/* Center - Game Feed */}
                    <main className="game-feed">
                        {/* Hot Games Section */}
                        {hotGames.length > 0 && !loading && (
                            <div className="hot-games-section">
                                <h2 className="section-header">
                                    <span className="fire-icon">HOT</span>
                                    Hot Action Right Now
                                </h2>
                                <div className="hot-games-grid">
                                    {hotGames.map((game, i) => (
                                        <HotGameCard key={game.id || i} game={game} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* All Games */}
                        {loading ? (
                            <div className="loading-state">
                                <div className="spinner"></div>
                                <span>Finding live games...</span>
                            </div>
                        ) : games.length === 0 ? (
                            <div className="empty-state">
                                <p>No games found matching your filters</p>
                                <button onClick={clearFilters}>Clear Filters</button>
                            </div>
                        ) : (
                            <div className="venue-list">
                                {Object.values(gamesByVenue).map((venueData, i) => (
                                    <VenueCard key={venueData.venue.name || i} venueData={venueData} />
                                ))}
                            </div>
                        )}
                    </main>

                    {/* Right Sidebar */}
                    <aside className="sidebar-right">
                        <div className="sidebar-section">
                            <h3>Quick Actions</h3>
                            <div className="quick-actions">
                                <a href="/hub/poker-near-me" className="action-card">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                                        <circle cx="12" cy="10" r="3"/>
                                    </svg>
                                    <span>Find Venues</span>
                                </a>
                                <a href="/hub/daily-tournaments" className="action-card">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                                        <line x1="3" y1="6" x2="21" y2="6"/>
                                        <path d="M16 10a4 4 0 0 1-8 0"/>
                                    </svg>
                                    <span>Tournaments</span>
                                </a>
                            </div>
                        </div>

                        <div className="sidebar-section tips-section">
                            <h3>Pro Tips</h3>
                            <div className="tip-card">
                                <span className="tip-icon">1</span>
                                <p>Games marked "Hot" have aggressive action and deep stacks</p>
                            </div>
                            <div className="tip-card">
                                <span className="tip-icon">2</span>
                                <p>Enable GPS to see games sorted by distance from you</p>
                            </div>
                            <div className="tip-card">
                                <span className="tip-icon">3</span>
                                <p>Wait times update every 30 seconds automatically</p>
                            </div>
                        </div>

                        <div className="sidebar-section">
                            <h3>Data Source</h3>
                            <p className="source-info">Showing games from 178 verified venues across 23 states. Wait times are estimates based on typical patterns.</p>
                            <div className="source-badge">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                    <polyline points="22 4 12 14.01 9 11.01"/>
                                </svg>
                                178 Verified Venues
                            </div>
                        </div>
                    </aside>
                </div>

                <style jsx>{`
                    .lg-page {
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
                    .lg-header {
                        padding: 24px 20px;
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        flex-wrap: wrap;
                        gap: 16px;
                    }
                    .header-content h1 {
                        font-size: 28px;
                        font-weight: 700;
                        margin: 0;
                        letter-spacing: 1px;
                    }
                    .header-content .white { color: #fff; }
                    .header-content .gold { color: #d4a853; }
                    .header-content .subtitle {
                        display: block;
                        font-size: 14px;
                        color: rgba(255,255,255,0.5);
                        font-weight: 400;
                        letter-spacing: 1px;
                        margin-top: 4px;
                    }
                    .header-stats {
                        display: flex;
                        align-items: center;
                        gap: 16px;
                    }
                    .live-indicator {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 8px 14px;
                        background: rgba(239, 68, 68, 0.2);
                        border: 1px solid rgba(239, 68, 68, 0.4);
                        border-radius: 20px;
                    }
                    .pulse {
                        width: 8px;
                        height: 8px;
                        background: #ef4444;
                        border-radius: 50%;
                        animation: pulse 1.5s ease-in-out infinite;
                    }
                    @keyframes pulse {
                        0%, 100% { opacity: 1; transform: scale(1); }
                        50% { opacity: 0.5; transform: scale(1.2); }
                    }
                    .live-text {
                        font-size: 12px;
                        font-weight: 700;
                        color: #ef4444;
                        letter-spacing: 1px;
                    }
                    .last-updated {
                        font-size: 12px;
                        color: rgba(255,255,255,0.5);
                    }

                    /* Stats Bar */
                    .stats-bar {
                        display: flex;
                        gap: 12px;
                        padding: 0 20px 20px;
                        overflow-x: auto;
                    }
                    .stat-item {
                        flex: 1;
                        min-width: 80px;
                        padding: 16px;
                        background: rgba(15, 23, 42, 0.6);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 12px;
                        text-align: center;
                    }
                    .stat-item.hot {
                        background: rgba(239, 68, 68, 0.15);
                        border-color: rgba(239, 68, 68, 0.3);
                    }
                    .stat-item.hot .stat-value { color: #ef4444; }
                    .stat-value {
                        display: block;
                        font-size: 24px;
                        font-weight: 700;
                        color: #d4a853;
                    }
                    .stat-label {
                        font-size: 11px;
                        color: rgba(255,255,255,0.5);
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }

                    /* Search Section */
                    .lg-search-section {
                        padding: 0 20px 20px;
                    }
                    .search-container {
                        background: rgba(15, 23, 42, 0.6);
                        backdrop-filter: blur(12px);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 16px;
                        padding: 16px;
                        display: flex;
                        flex-wrap: wrap;
                        gap: 12px;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .quick-filters {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px;
                    }
                    .btn-gps, .btn-filters, .stake-btn {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        padding: 10px 14px;
                        background: rgba(0,0,0,0.3);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 8px;
                        color: rgba(255,255,255,0.8);
                        font-size: 13px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .btn-gps:hover, .btn-filters:hover, .stake-btn:hover {
                        background: rgba(255,255,255,0.1);
                    }
                    .btn-gps.active {
                        background: rgba(34,197,94,0.2);
                        border-color: rgba(34,197,94,0.5);
                        color: #22c55e;
                    }
                    .btn-filters.active, .stake-btn.active {
                        background: rgba(212,168,83,0.2);
                        border-color: rgba(212,168,83,0.5);
                        color: #d4a853;
                    }
                    .refresh-toggle {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    }
                    .toggle-switch {
                        position: relative;
                        width: 40px;
                        height: 22px;
                    }
                    .toggle-switch input { opacity: 0; width: 0; height: 0; }
                    .toggle-slider {
                        position: absolute;
                        cursor: pointer;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(255,255,255,0.15);
                        border-radius: 22px;
                        transition: 0.3s;
                    }
                    .toggle-slider:before {
                        position: absolute;
                        content: "";
                        height: 16px;
                        width: 16px;
                        left: 3px;
                        bottom: 3px;
                        background: #fff;
                        border-radius: 50%;
                        transition: 0.3s;
                    }
                    .toggle-switch input:checked + .toggle-slider { background: #22c55e; }
                    .toggle-switch input:checked + .toggle-slider:before { transform: translateX(18px); }
                    .toggle-label {
                        font-size: 12px;
                        color: rgba(255,255,255,0.6);
                    }
                    .btn-refresh {
                        padding: 8px;
                        background: rgba(0,0,0,0.3);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 8px;
                        color: rgba(255,255,255,0.7);
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .btn-refresh:hover {
                        background: rgba(255,255,255,0.1);
                        color: #fff;
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
                    .filter-actions { display: flex; gap: 12px; }
                    .btn-clear, .btn-apply {
                        flex: 1;
                        padding: 12px;
                        border-radius: 10px;
                        font-size: 14px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .btn-clear {
                        background: rgba(0,0,0,0.3);
                        border: 1px solid rgba(255,255,255,0.15);
                        color: rgba(255,255,255,0.7);
                    }
                    .btn-apply {
                        background: linear-gradient(135deg, #d4a853, #b8860b);
                        border: none;
                        color: #000;
                        font-weight: 600;
                    }

                    /* Layout */
                    .lg-layout {
                        display: flex;
                        flex-direction: column;
                        min-height: calc(100vh - 400px);
                        padding: 0 20px;
                    }
                    .sidebar-left, .sidebar-right { display: none; }
                    .game-feed { flex: 1; }

                    /* Sidebar */
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
                    .state-chip:hover { background: rgba(255,255,255,0.1); }
                    .state-chip.active {
                        background: rgba(212,168,83,0.15);
                        border-color: rgba(212,168,83,0.4);
                    }
                    .state-abbr { font-weight: 600; color: #d4a853; }
                    .state-name { flex: 1; color: rgba(255,255,255,0.7); font-size: 13px; }
                    .state-count { font-size: 12px; color: rgba(255,255,255,0.5); }

                    .game-breakdown { display: flex; flex-direction: column; gap: 10px; }
                    .game-item {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 8px 12px;
                        background: rgba(255,255,255,0.03);
                        border-radius: 6px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .game-item:hover { background: rgba(255,255,255,0.08); }
                    .game-badge {
                        font-size: 12px;
                        font-weight: 600;
                        padding: 4px 10px;
                        border-radius: 4px;
                    }
                    .game-badge.nlh {
                        background: rgba(59, 130, 246, 0.2);
                        color: #60a5fa;
                    }
                    .game-badge.plo {
                        background: rgba(239, 68, 68, 0.2);
                        color: #f87171;
                    }
                    .game-count { font-size: 12px; color: rgba(255,255,255,0.6); }

                    .stakes-breakdown { display: flex; flex-direction: column; gap: 10px; }
                    .stake-item {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        cursor: pointer;
                    }
                    .stake-level {
                        width: 50px;
                        font-size: 13px;
                        font-weight: 500;
                        color: rgba(255,255,255,0.8);
                    }
                    .stake-bar {
                        flex: 1;
                        height: 6px;
                        background: rgba(255,255,255,0.1);
                        border-radius: 3px;
                        overflow: hidden;
                    }
                    .stake-fill {
                        height: 100%;
                        background: linear-gradient(90deg, #d4a853, #f59e0b);
                        border-radius: 3px;
                    }
                    .stake-count {
                        width: 30px;
                        text-align: right;
                        font-size: 12px;
                        color: rgba(255,255,255,0.5);
                    }

                    .quick-actions { display: flex; flex-direction: column; gap: 10px; }
                    .action-card {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        padding: 14px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 10px;
                        color: rgba(255,255,255,0.8);
                        text-decoration: none;
                        transition: all 0.2s;
                    }
                    .action-card:hover {
                        background: rgba(255,255,255,0.1);
                        border-color: rgba(255,255,255,0.2);
                    }

                    .tips-section .tip-card {
                        display: flex;
                        gap: 12px;
                        margin-bottom: 12px;
                    }
                    .tip-icon {
                        width: 24px;
                        height: 24px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: rgba(212,168,83,0.2);
                        border-radius: 50%;
                        font-size: 12px;
                        font-weight: 600;
                        color: #d4a853;
                        flex-shrink: 0;
                    }
                    .tip-card p {
                        font-size: 13px;
                        color: rgba(255,255,255,0.6);
                        margin: 0;
                        line-height: 1.4;
                    }

                    .source-info {
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

                    /* Hot Games Section */
                    .hot-games-section {
                        margin-bottom: 32px;
                    }
                    .section-header {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        font-size: 18px;
                        font-weight: 600;
                        margin: 0 0 16px;
                    }
                    .fire-icon {
                        padding: 6px 12px;
                        background: linear-gradient(135deg, #ef4444, #dc2626);
                        border-radius: 6px;
                        font-size: 12px;
                        font-weight: 700;
                        letter-spacing: 1px;
                    }
                    .hot-games-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                        gap: 14px;
                    }

                    /* Loading / Empty */
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
                    }

                    .venue-list {
                        display: flex;
                        flex-direction: column;
                        gap: 16px;
                    }

                    /* Responsive */
                    @media (min-width: 768px) {
                        .hot-games-grid {
                            grid-template-columns: repeat(2, 1fr);
                        }
                    }

                    @media (min-width: 1024px) {
                        .lg-layout {
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
                        .game-feed { padding: 20px; }
                        .lg-search-section {
                            margin-left: 260px;
                            margin-right: 300px;
                        }
                        .lg-header {
                            margin-left: 260px;
                        }
                        .stats-bar {
                            margin-left: 260px;
                            margin-right: 300px;
                        }
                        .filter-panel {
                            margin-left: calc(260px + 20px);
                            margin-right: calc(300px + 20px);
                        }
                        .hot-games-grid {
                            grid-template-columns: repeat(3, 1fr);
                        }
                    }

                    @media (min-width: 1280px) {
                        .lg-layout {
                            grid-template-columns: 280px 1fr 320px;
                        }
                        .lg-search-section {
                            margin-left: 280px;
                            margin-right: 320px;
                        }
                        .lg-header {
                            margin-left: 280px;
                        }
                        .stats-bar {
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

// Hot Game Card Component
function HotGameCard({ game }) {
    return (
        <div className="hot-card">
            <div className="hot-badge">HOT</div>
            <div className="hot-content">
                <div className="hot-stakes">{game.game.type} {game.game.stakes}</div>
                <div className="hot-venue">{game.venue.name}</div>
                <div className="hot-location">{game.venue.city}, {game.venue.state}</div>
            </div>
            <div className="hot-meta">
                <span className="tables">{game.status.tables} tables</span>
                <span className="wait">{game.status.waitTime}m wait</span>
            </div>

            <style jsx>{`
                .hot-card {
                    position: relative;
                    padding: 16px;
                    background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.1));
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    border-radius: 12px;
                    transition: all 0.2s;
                }
                .hot-card:hover {
                    border-color: rgba(239, 68, 68, 0.5);
                    transform: translateY(-2px);
                }
                .hot-badge {
                    position: absolute;
                    top: -8px;
                    right: 12px;
                    padding: 4px 10px;
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: 700;
                    letter-spacing: 1px;
                }
                .hot-stakes {
                    font-size: 18px;
                    font-weight: 700;
                    color: #fff;
                    margin-bottom: 4px;
                }
                .hot-venue {
                    font-size: 14px;
                    font-weight: 500;
                    color: rgba(255,255,255,0.9);
                }
                .hot-location {
                    font-size: 12px;
                    color: rgba(255,255,255,0.5);
                    margin-bottom: 12px;
                }
                .hot-meta {
                    display: flex;
                    gap: 12px;
                }
                .hot-meta span {
                    font-size: 12px;
                    padding: 4px 10px;
                    background: rgba(0,0,0,0.3);
                    border-radius: 4px;
                    color: rgba(255,255,255,0.7);
                }
            `}</style>
        </div>
    );
}

// Venue Card Component
function VenueCard({ venueData }) {
    const { venue, games } = venueData;
    const [expanded, setExpanded] = useState(false);

    const displayGames = expanded ? games : games.slice(0, 3);
    const hasMore = games.length > 3;

    return (
        <div className="venue-card">
            <div className="venue-header">
                <div className="venue-info">
                    <h3>{venue.name}</h3>
                    <p>{venue.city}, {venue.state} - {venue.type}</p>
                </div>
                <div className="venue-summary">
                    <span className="game-count">{games.length} games</span>
                    {games[0]?.distance && <span className="distance">{games[0].distance} mi</span>}
                </div>
            </div>

            <div className="games-list">
                {displayGames.map((game, i) => (
                    <div key={game.id || i} className={`game-row ${game.status.action.level}`}>
                        <div className="game-info">
                            <span className={`game-type-badge ${game.game.type.toLowerCase()}`}>{game.game.type}</span>
                            <span className="stakes">{game.game.stakes}</span>
                        </div>
                        <div className="game-status">
                            <span className="tables">{game.status.tables} table{game.status.tables > 1 ? 's' : ''}</span>
                            <span className="wait-time">{game.status.waitTime}m wait</span>
                            <span className="action-badge" style={{ color: game.status.action.color }}>
                                {game.status.action.label}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {hasMore && (
                <button className="show-more" onClick={() => setExpanded(!expanded)}>
                    {expanded ? 'Show Less' : `Show ${games.length - 3} More Games`}
                </button>
            )}

            <style jsx>{`
                .venue-card {
                    background: rgba(15, 23, 42, 0.5);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 14px;
                    overflow: hidden;
                    transition: all 0.2s;
                }
                .venue-card:hover {
                    border-color: rgba(255, 255, 255, 0.25);
                }
                .venue-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    padding: 16px 18px;
                    border-bottom: 1px solid rgba(255,255,255,0.08);
                }
                .venue-info h3 {
                    font-size: 17px;
                    font-weight: 600;
                    margin: 0 0 4px;
                    color: #fff;
                }
                .venue-info p {
                    font-size: 13px;
                    color: rgba(255,255,255,0.5);
                    margin: 0;
                }
                .venue-summary {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                    gap: 4px;
                }
                .game-count {
                    font-size: 14px;
                    font-weight: 600;
                    color: #d4a853;
                }
                .distance {
                    font-size: 12px;
                    color: #22c55e;
                    padding: 2px 8px;
                    background: rgba(34,197,94,0.15);
                    border-radius: 4px;
                }
                .games-list {
                    padding: 0;
                }
                .game-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 18px;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    transition: all 0.15s;
                }
                .game-row:last-child { border-bottom: none; }
                .game-row:hover { background: rgba(255,255,255,0.03); }
                .game-row.hot { background: rgba(239, 68, 68, 0.08); }
                .game-info {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .game-type-badge {
                    font-size: 11px;
                    font-weight: 600;
                    padding: 4px 8px;
                    border-radius: 4px;
                }
                .game-type-badge.nlh {
                    background: rgba(59, 130, 246, 0.2);
                    color: #60a5fa;
                }
                .game-type-badge.plo {
                    background: rgba(239, 68, 68, 0.2);
                    color: #f87171;
                }
                .stakes {
                    font-size: 15px;
                    font-weight: 600;
                    color: #fff;
                }
                .game-status {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .tables, .wait-time {
                    font-size: 12px;
                    color: rgba(255,255,255,0.6);
                }
                .action-badge {
                    font-size: 11px;
                    font-weight: 600;
                }
                .show-more {
                    width: 100%;
                    padding: 12px;
                    background: rgba(255,255,255,0.03);
                    border: none;
                    border-top: 1px solid rgba(255,255,255,0.08);
                    color: rgba(255,255,255,0.6);
                    font-size: 13px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .show-more:hover {
                    background: rgba(255,255,255,0.06);
                    color: #d4a853;
                }
            `}</style>
        </div>
    );
}
