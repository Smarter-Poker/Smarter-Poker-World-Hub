/**
 * POKER NEAR ME - Find Poker Rooms Near You
 * Mobile-first design matching the Smarter.Poker design system
 */

import Head from 'next/head';
import { useState, useEffect } from 'react';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

const POPULAR_CITIES = [
    { name: 'Las Vegas', state: 'NV' },
    { name: 'Los Angeles', state: 'CA' },
    { name: 'Miami', state: 'FL' },
    { name: 'Atlantic City', state: 'NJ' },
    { name: 'Austin', state: 'TX' },
];

const VENUE_TYPE_LABELS = {
    casino: 'Casino',
    card_room: 'Card Room',
    poker_club: 'Poker Club',
    home_game: 'Home Game'
};

function getTrustLevel(score) {
    if (score >= 4.5) return { label: 'High', color: '#22c55e' };
    if (score >= 4.0) return { label: 'Fresh', color: '#3b82f6' };
    if (score >= 3.0) return { label: 'Moderate', color: '#f59e0b' };
    return { label: 'Low', color: '#ef4444' };
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMoney(amount) {
    if (!amount) return '';
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(0)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toLocaleString()}`;
}

export default function PokerNearMe() {
    const [venues, setVenues] = useState([]);
    const [series, setSeries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [userLocation, setUserLocation] = useState(null);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [selectedCity, setSelectedCity] = useState(null);
    const [showMap, setShowMap] = useState(false);
    const [nearestDistance, setNearestDistance] = useState(null);

    const [filters, setFilters] = useState({
        venueType: 'all',
        hasNLH: false,
        hasPLO: false,
        hasMixed: false,
    });

    useEffect(() => {
        fetchData();
    }, [selectedCity, userLocation]);

    const requestGpsLocation = () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            return;
        }
        setGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setGpsLoading(false);
            },
            (err) => {
                alert('Unable to get your location. Please enable location services.');
                setGpsLoading(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    const fetchData = async () => {
        setLoading(true);
        await Promise.all([fetchVenues(), fetchSeries()]);
        setLoading(false);
    };

    const fetchVenues = async () => {
        try {
            const params = new URLSearchParams({ limit: '200' });
            if (selectedCity) {
                params.set('city', selectedCity.name);
                params.set('state', selectedCity.state);
            }
            if (userLocation) {
                params.set('lat', userLocation.lat.toString());
                params.set('lng', userLocation.lng.toString());
                params.set('radius', '500');
            }
            if (searchQuery) {
                params.set('search', searchQuery);
            }

            const res = await fetch(`/api/poker/venues?${params}`);
            const { data } = await res.json();
            let filteredData = data || [];

            if (filters.venueType !== 'all') {
                filteredData = filteredData.filter(v => v.venue_type === filters.venueType);
            }
            if (filters.hasNLH) {
                filteredData = filteredData.filter(v => v.games_offered?.includes('NLH'));
            }
            if (filters.hasPLO) {
                filteredData = filteredData.filter(v => v.games_offered?.includes('PLO'));
            }
            if (filters.hasMixed) {
                filteredData = filteredData.filter(v => v.games_offered?.includes('Mixed'));
            }

            setVenues(filteredData);
            if (filteredData.length > 0 && filteredData[0].distance_mi) {
                setNearestDistance(filteredData[0].distance_mi);
            }
        } catch (e) {
            console.error('Fetch venues error:', e);
            setVenues([]);
        }
    };

    const fetchSeries = async () => {
        try {
            const params = new URLSearchParams({ upcoming: 'true', limit: '20' });
            const res = await fetch(`/api/poker/series?${params}`);
            const { data } = await res.json();
            setSeries(data || []);
        } catch (e) {
            console.error('Fetch series error:', e);
            setSeries([]);
        }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        fetchVenues();
    };

    const handleCityClick = (city) => {
        setSelectedCity(city);
        setUserLocation(null);
    };

    const clearFilters = () => {
        setSelectedCity(null);
        setUserLocation(null);
        setSearchQuery('');
        setFilters({ venueType: 'all', hasNLH: false, hasPLO: false, hasMixed: false });
    };

    return (
        <>
            <Head>
                <title>Poker Near Me | Smarter.Poker</title>
                <meta name="description" content="Find poker rooms, casinos, and card clubs near you." />
            </Head>

            <div className="pnm-page">
                <UniversalHeader pageDepth={1} />

                {/* Page Header */}
                <div className="pnm-header">
                    <h1><span className="highlight">POKER</span> NEAR <span className="highlight">ME</span></h1>
                    <span className="subtitle">FIND POKER ROOMS NEAR YOU</span>
                </div>

                {/* Search Bar */}
                <div className="pnm-search-section">
                    <form className="search-form" onSubmit={handleSearch}>
                        <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                        </svg>
                        <input
                            type="text"
                            placeholder="Search city, casino or keyword"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </form>

                    <div className="search-row">
                        <button className={`btn-control ${userLocation ? 'active-gps' : ''}`} onClick={requestGpsLocation} disabled={gpsLoading}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="3 11 22 2 13 21 11 13 3 11"/>
                            </svg>
                            {gpsLoading ? 'Getting Location...' : 'Use GPS'}
                        </button>
                        <button className={`btn-control ${showFilters ? 'active' : ''}`} onClick={() => setShowFilters(!showFilters)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
                                <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
                                <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
                            </svg>
                            Filters
                        </button>
                    </div>

                    {(userLocation || nearestDistance) && (
                        <div className="distance-row">
                            <div className="distance-info">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polygon points="3 11 22 2 13 21 11 13 3 11"/>
                                </svg>
                                <span>~ {nearestDistance || '0'} miles away</span>
                            </div>
                            <div className="map-toggle">
                                <label className="toggle-switch">
                                    <input type="checkbox" checked={showMap} onChange={(e) => setShowMap(e.target.checked)} />
                                    <span className="toggle-slider"></span>
                                </label>
                                <span>Map</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Filter Panel */}
                {showFilters && (
                    <div className="filter-panel">
                        <div className="filter-group">
                            <label>Venue Type</label>
                            <div className="filter-chips">
                                {['all', 'casino', 'card_room', 'poker_club'].map(type => (
                                    <button key={type} className={`chip ${filters.venueType === type ? 'active' : ''}`}
                                        onClick={() => setFilters({...filters, venueType: type})}>
                                        {type === 'all' ? 'All' : VENUE_TYPE_LABELS[type]}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="filter-group">
                            <label>Games</label>
                            <div className="filter-chips">
                                <button className={`chip ${filters.hasNLH ? 'active' : ''}`} onClick={() => setFilters({...filters, hasNLH: !filters.hasNLH})}>NLH</button>
                                <button className={`chip ${filters.hasPLO ? 'active' : ''}`} onClick={() => setFilters({...filters, hasPLO: !filters.hasPLO})}>PLO</button>
                                <button className={`chip ${filters.hasMixed ? 'active' : ''}`} onClick={() => setFilters({...filters, hasMixed: !filters.hasMixed})}>Mixed</button>
                            </div>
                        </div>
                        <button className="btn-apply" onClick={() => { fetchVenues(); setShowFilters(false); }}>Apply Filters</button>
                    </div>
                )}

                {/* Main 3-Column Layout */}
                <div className="pnm-layout">
                    {/* Left Sidebar */}
                    <aside className="sidebar-left">
                        <div className="sidebar-section">
                            <h3>Popular Cities</h3>
                            <div className="city-chips">
                                {POPULAR_CITIES.map(city => (
                                    <button key={city.name} className={`city-chip ${selectedCity?.name === city.name ? 'active' : ''}`}
                                        onClick={() => handleCityClick(city)}>
                                        {city.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="sidebar-section series-preview">
                            <h3>Major Series Coming Soon</h3>
                            <div className="series-badge-wrap">
                                <span className="series-badge-logo">WSOP</span>
                            </div>
                            <div className="game-tags">
                                <span className="tag primary">NLH</span>
                                <span className="tag">PLO</span>
                                <span className="tag">Mixed</span>
                            </div>
                        </div>

                        <div className="sidebar-section">
                            <h3>Popular Rooms</h3>
                            <div className="popular-rooms">
                                <div className="room-item">
                                    <span className="room-name">The Lodge Poker Club</span>
                                    <div className="room-games"><span className="star">*</span> NLH PLO Mixed</div>
                                </div>
                                <div className="room-item">
                                    <span className="room-name">Commerce Casino</span>
                                    <div className="room-games"><span className="star">*</span> NLH PLO Mixed</div>
                                </div>
                                <div className="room-item">
                                    <span className="room-name">Bestbet Jacksonville</span>
                                    <div className="room-games">NLH PLO Mixed</div>
                                </div>
                            </div>
                        </div>
                    </aside>

                    {/* Center - Venue Cards */}
                    <main className="venue-feed">
                        {loading ? (
                            <div className="loading-state">
                                <div className="spinner"></div>
                                <span>Finding poker rooms...</span>
                            </div>
                        ) : venues.length === 0 ? (
                            <div className="empty-state">
                                <p>No venues found</p>
                                <button onClick={clearFilters}>Clear Filters</button>
                            </div>
                        ) : (
                            <div className="venue-list">
                                {venues.slice(0, 30).map((venue, i) => {
                                    const trust = getTrustLevel(venue.trust_score);
                                    return (
                                        <div key={venue.id || i} className="venue-card">
                                            <div className="venue-card-bg"></div>
                                            <div className="venue-card-content">
                                                <h4 className="venue-name">{venue.name}</h4>
                                                <div className="venue-meta">
                                                    {venue.distance_mi && <span className="meta-tag distance">{venue.distance_mi} mi</span>}
                                                    {venue.games_offered?.slice(0, 2).map(g => (
                                                        <span key={g} className="meta-tag game">{g}</span>
                                                    ))}
                                                    {venue.stakes_cash?.[0] && <span className="meta-tag stakes">{venue.stakes_cash[0]}</span>}
                                                </div>
                                                <div className="venue-trust">
                                                    <span className="trust-label" style={{ color: trust.color }}>Trust: {trust.label}</span>
                                                    <span className="verified-badge">Verified</span>
                                                </div>
                                                <div className="venue-actions">
                                                    {venue.phone && (
                                                        <a href={`tel:${venue.phone}`} className="action-btn call">
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                                                            </svg>
                                                            Call
                                                        </a>
                                                    )}
                                                    {venue.website && (
                                                        <a href={venue.website.startsWith('http') ? venue.website : `https://${venue.website}`} target="_blank" rel="noopener noreferrer" className="action-btn website">
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                                                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                                                            </svg>
                                                            Website
                                                        </a>
                                                    )}
                                                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.name + ' ' + venue.city + ' ' + venue.state)}`} target="_blank" rel="noopener noreferrer" className="action-btn directions">
                                                        Directions
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </main>

                    {/* Right Sidebar - Tournament Series */}
                    <aside className="sidebar-right">
                        <div className="series-header">
                            <h3>MAJOR TOURNAMENT SERIES</h3>
                            <div className="series-filters">
                                <select defaultValue="30">
                                    <option value="30">Next 30 Days</option>
                                    <option value="60">Next 60 Days</option>
                                    <option value="90">Next 90 Days</option>
                                </select>
                                <select defaultValue="near">
                                    <option value="near">Near Me</option>
                                    <option value="all">All Locations</option>
                                </select>
                            </div>
                        </div>
                        <div className="series-list">
                            {series.slice(0, 5).map((s, i) => (
                                <div key={s.id || i} className="series-card">
                                    <div className="series-logo">
                                        <span>{s.short_name || 'SERIES'}</span>
                                    </div>
                                    <div className="series-info">
                                        <h4>{s.name}</h4>
                                        <p className="series-location">{s.location}</p>
                                        <p className="series-dates">{formatDate(s.start_date)} - {formatDate(s.end_date)}</p>
                                    </div>
                                    <div className="series-details">
                                        {s.total_events && <span>{s.total_events} Events</span>}
                                        {s.main_event_guaranteed && <span>{formatMoney(s.main_event_guaranteed)}+ Guaranteed</span>}
                                        {s.main_event_buyin && <span>Main Event {formatMoney(s.main_event_buyin)} Buy-In</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </aside>
                </div>

                <style jsx>{`
                    .pnm-page {
                        min-height: 100vh;
                        background: linear-gradient(180deg, #0a0e1a 0%, #0f1629 50%, #0a0e1a 100%);
                        color: #fff;
                        font-family: 'Inter', -apple-system, sans-serif;
                    }
                    .pnm-header {
                        padding: 20px 16px;
                        border-bottom: 1px solid rgba(255,255,255,0.08);
                    }
                    .pnm-header h1 {
                        font-size: 22px;
                        font-weight: 700;
                        margin: 0;
                    }
                    .pnm-header .highlight { color: #f59e0b; }
                    .pnm-header .subtitle {
                        font-size: 12px;
                        color: rgba(255,255,255,0.5);
                        margin-left: 12px;
                    }

                    /* Search Section */
                    .pnm-search-section {
                        padding: 16px;
                        border-bottom: 1px solid rgba(255,255,255,0.08);
                    }
                    .search-form {
                        position: relative;
                        margin-bottom: 12px;
                    }
                    .search-icon {
                        position: absolute;
                        left: 14px;
                        top: 50%;
                        transform: translateY(-50%);
                        color: rgba(255,255,255,0.4);
                    }
                    .search-form input {
                        width: 100%;
                        padding: 14px 14px 14px 44px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 12px;
                        color: #fff;
                        font-size: 15px;
                        outline: none;
                    }
                    .search-form input:focus { border-color: rgba(0,212,255,0.5); }
                    .search-form input::placeholder { color: rgba(255,255,255,0.4); }

                    .search-row {
                        display: flex;
                        gap: 10px;
                    }
                    .btn-control {
                        flex: 1;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        padding: 12px 16px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 10px;
                        color: rgba(255,255,255,0.8);
                        font-size: 14px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .btn-control:hover { background: rgba(255,255,255,0.1); }
                    .btn-control.active { background: rgba(0,212,255,0.15); border-color: rgba(0,212,255,0.4); color: #00d4ff; }
                    .btn-control.active-gps { background: rgba(34,197,94,0.15); border-color: rgba(34,197,94,0.4); color: #22c55e; }

                    .distance-row {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        margin-top: 12px;
                        padding: 10px 14px;
                        background: rgba(255,255,255,0.03);
                        border-radius: 10px;
                    }
                    .distance-info {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        color: rgba(255,255,255,0.6);
                        font-size: 13px;
                    }
                    .map-toggle {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        color: rgba(255,255,255,0.6);
                        font-size: 13px;
                    }
                    .toggle-switch {
                        position: relative;
                        width: 44px;
                        height: 24px;
                    }
                    .toggle-switch input { opacity: 0; width: 0; height: 0; }
                    .toggle-slider {
                        position: absolute;
                        cursor: pointer;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(255,255,255,0.1);
                        border-radius: 24px;
                        transition: 0.3s;
                    }
                    .toggle-slider:before {
                        position: absolute;
                        content: "";
                        height: 18px;
                        width: 18px;
                        left: 3px;
                        bottom: 3px;
                        background: #fff;
                        border-radius: 50%;
                        transition: 0.3s;
                    }
                    .toggle-switch input:checked + .toggle-slider { background: #00d4ff; }
                    .toggle-switch input:checked + .toggle-slider:before { transform: translateX(20px); }

                    /* Filter Panel */
                    .filter-panel {
                        padding: 16px;
                        background: rgba(0,0,0,0.3);
                        border-bottom: 1px solid rgba(255,255,255,0.08);
                    }
                    .filter-group { margin-bottom: 16px; }
                    .filter-group label {
                        display: block;
                        font-size: 12px;
                        color: rgba(255,255,255,0.5);
                        margin-bottom: 8px;
                        text-transform: uppercase;
                    }
                    .filter-chips { display: flex; flex-wrap: wrap; gap: 8px; }
                    .chip {
                        padding: 8px 14px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 20px;
                        color: rgba(255,255,255,0.7);
                        font-size: 13px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .chip:hover { background: rgba(255,255,255,0.1); }
                    .chip.active { background: rgba(0,212,255,0.15); border-color: rgba(0,212,255,0.4); color: #00d4ff; }
                    .btn-apply {
                        width: 100%;
                        padding: 12px;
                        background: linear-gradient(135deg, #00d4ff, #0088ff);
                        border: none;
                        border-radius: 10px;
                        color: #fff;
                        font-size: 14px;
                        font-weight: 600;
                        cursor: pointer;
                    }

                    /* 3-Column Layout */
                    .pnm-layout {
                        display: flex;
                        min-height: calc(100vh - 200px);
                    }
                    .sidebar-left, .sidebar-right { display: none; }
                    .venue-feed { flex: 1; padding: 16px; }

                    /* Sidebar Sections */
                    .sidebar-section {
                        padding: 16px;
                        border-bottom: 1px solid rgba(255,255,255,0.08);
                    }
                    .sidebar-section h3 {
                        font-size: 12px;
                        font-weight: 600;
                        color: rgba(255,255,255,0.5);
                        text-transform: uppercase;
                        margin: 0 0 12px;
                    }
                    .city-chips { display: flex; flex-wrap: wrap; gap: 8px; }
                    .city-chip {
                        padding: 8px 14px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 8px;
                        color: rgba(255,255,255,0.8);
                        font-size: 13px;
                        cursor: pointer;
                    }
                    .city-chip:hover, .city-chip.active { background: rgba(0,212,255,0.15); border-color: rgba(0,212,255,0.4); color: #00d4ff; }

                    .series-preview { background: linear-gradient(135deg, rgba(30,58,138,0.3), rgba(15,23,42,0.5)); }
                    .series-badge-wrap { margin-bottom: 12px; }
                    .series-badge-logo {
                        display: inline-block;
                        padding: 8px 16px;
                        background: linear-gradient(135deg, #fbbf24, #d97706);
                        border-radius: 6px;
                        font-size: 14px;
                        font-weight: 800;
                        color: #000;
                    }
                    .game-tags { display: flex; gap: 8px; }
                    .game-tags .tag {
                        padding: 6px 12px;
                        background: rgba(255,255,255,0.1);
                        border-radius: 6px;
                        font-size: 12px;
                        color: rgba(255,255,255,0.7);
                    }
                    .game-tags .tag.primary { background: rgba(251,191,36,0.2); color: #fbbf24; }

                    .popular-rooms { display: flex; flex-direction: column; gap: 12px; }
                    .room-item { display: flex; flex-direction: column; gap: 4px; }
                    .room-name { font-size: 14px; font-weight: 500; }
                    .room-games { font-size: 11px; color: rgba(255,255,255,0.5); }
                    .room-games .star { color: #fbbf24; margin-right: 4px; }

                    /* Loading / Empty State */
                    .loading-state, .empty-state {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 60px 20px;
                        color: rgba(255,255,255,0.5);
                    }
                    .spinner {
                        width: 32px;
                        height: 32px;
                        border: 3px solid rgba(255,255,255,0.1);
                        border-top-color: #00d4ff;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin-bottom: 16px;
                    }
                    @keyframes spin { to { transform: rotate(360deg); } }
                    .empty-state button {
                        margin-top: 16px;
                        padding: 10px 20px;
                        background: rgba(255,255,255,0.1);
                        border: none;
                        border-radius: 8px;
                        color: #fff;
                        cursor: pointer;
                    }

                    /* Venue Cards */
                    .venue-list { display: flex; flex-direction: column; gap: 16px; }
                    .venue-card {
                        position: relative;
                        border-radius: 16px;
                        overflow: hidden;
                        min-height: 180px;
                    }
                    .venue-card-bg {
                        position: absolute;
                        inset: 0;
                        background: linear-gradient(135deg, rgba(30,41,59,0.9), rgba(15,23,42,0.95));
                    }
                    .venue-card-content {
                        position: relative;
                        padding: 16px;
                        display: flex;
                        flex-direction: column;
                        min-height: 180px;
                    }
                    .venue-name { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
                    .venue-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
                    .meta-tag {
                        font-size: 12px;
                        padding: 4px 10px;
                        background: rgba(255,255,255,0.15);
                        border-radius: 6px;
                    }
                    .meta-tag.distance { background: rgba(34,197,94,0.2); color: #22c55e; }
                    .meta-tag.game { background: rgba(0,212,255,0.2); color: #00d4ff; }
                    .venue-trust { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
                    .trust-label { font-size: 12px; font-weight: 500; }
                    .verified-badge {
                        font-size: 11px;
                        padding: 3px 8px;
                        background: rgba(34,197,94,0.2);
                        color: #22c55e;
                        border-radius: 4px;
                    }
                    .venue-actions { display: flex; gap: 8px; margin-top: auto; }
                    .action-btn {
                        flex: 1;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        padding: 10px 12px;
                        border-radius: 8px;
                        font-size: 13px;
                        font-weight: 500;
                        text-decoration: none;
                    }
                    .action-btn.call { background: rgba(34,197,94,0.2); color: #22c55e; }
                    .action-btn.website { background: rgba(0,212,255,0.2); color: #00d4ff; }
                    .action-btn.directions { background: rgba(251,191,36,0.2); color: #fbbf24; }

                    /* Right Sidebar */
                    .series-header {
                        padding: 16px;
                        border-bottom: 1px solid rgba(255,255,255,0.08);
                    }
                    .series-header h3 {
                        font-size: 13px;
                        font-weight: 600;
                        color: rgba(255,255,255,0.9);
                        margin: 0 0 12px;
                    }
                    .series-filters { display: flex; gap: 8px; }
                    .series-filters select {
                        flex: 1;
                        padding: 8px 12px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 8px;
                        color: #fff;
                        font-size: 12px;
                        outline: none;
                    }
                    .series-list { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
                    .series-card {
                        background: linear-gradient(135deg, rgba(30,41,59,0.8), rgba(15,23,42,0.9));
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 12px;
                        padding: 14px;
                    }
                    .series-logo {
                        margin-bottom: 10px;
                    }
                    .series-logo span {
                        display: inline-block;
                        padding: 6px 12px;
                        background: linear-gradient(135deg, rgba(0,212,255,0.2), rgba(0,136,255,0.2));
                        border: 1px solid rgba(0,212,255,0.3);
                        border-radius: 6px;
                        font-size: 12px;
                        font-weight: 700;
                        color: #00d4ff;
                    }
                    .series-info h4 { font-size: 15px; font-weight: 600; margin: 0 0 4px; }
                    .series-location { font-size: 12px; color: rgba(255,255,255,0.6); margin: 0 0 2px; }
                    .series-dates { font-size: 12px; color: rgba(255,255,255,0.5); margin: 0; }
                    .series-details { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; }
                    .series-details span { font-size: 12px; color: rgba(255,255,255,0.7); }

                    /* Desktop */
                    @media (min-width: 768px) {
                        .pnm-header h1 { font-size: 26px; }
                        .venue-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
                    }
                    @media (min-width: 1024px) {
                        .pnm-layout { display: grid; grid-template-columns: 240px 1fr 300px; }
                        .sidebar-left { display: block; border-right: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.2); }
                        .sidebar-right { display: block; border-left: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.2); }
                        .venue-list { grid-template-columns: 1fr; }
                    }
                    @media (min-width: 1280px) {
                        .pnm-layout { grid-template-columns: 280px 1fr 340px; }
                        .venue-list { grid-template-columns: repeat(2, 1fr); }
                    }
                `}</style>
            </div>
        </>
    );
}
