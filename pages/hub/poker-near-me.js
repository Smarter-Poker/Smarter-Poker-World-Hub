/**
 * POKER NEAR ME - Find Poker Rooms Near You
 * Redesigned to match Smarter.Poker visual design system
 */

import Head from 'next/head';
import { useState, useEffect } from 'react';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

const POPULAR_CITIES = [
    { name: 'Las Vegas', state: 'NV' },
    { name: 'Los Angeles', state: 'CA' },
    { name: 'Miami', state: 'FL' },
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

// Series logo component with proper branding
function SeriesLogo({ shortName }) {
    const logos = {
        'WSOP': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227' },
        'WPT': { bg: 'linear-gradient(135deg, #dc2626, #991b1b)', text: '#fff', border: '#dc2626' },
        'MSPT': { bg: 'linear-gradient(135deg, #1e40af, #1e3a8a)', text: '#fff', border: '#3b82f6' },
        'PGT': { bg: 'linear-gradient(135deg, #7c3aed, #5b21b6)', text: '#fff', border: '#8b5cf6' },
        'WSOPC': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227' },
    };
    const style = logos[shortName] || { bg: 'linear-gradient(135deg, #374151, #1f2937)', text: '#fff', border: '#4b5563' };

    return (
        <div className="series-logo-badge" style={{ background: style.bg, borderColor: style.border }}>
            <span style={{ color: style.text }}>{shortName || 'SERIES'}</span>
            <style jsx>{`
                .series-logo-badge {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 8px 16px;
                    border-radius: 6px;
                    border: 1px solid;
                    min-width: 70px;
                }
                .series-logo-badge span {
                    font-size: 14px;
                    font-weight: 800;
                    letter-spacing: 0.5px;
                }
            `}</style>
        </div>
    );
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

    // Get popular rooms from venues
    const popularRooms = venues.filter(v => v.is_featured || v.trust_score >= 4.5).slice(0, 5);

    // Get next major series for sidebar preview
    const nextMajorSeries = series.find(s => ['WSOP', 'WPT', 'WSOPC'].includes(s.short_name));

    return (
        <>
            <Head>
                <title>Poker Near Me | Smarter.Poker</title>
                <meta name="description" content="Find poker rooms, casinos, and card clubs near you." />
            </Head>

            <div className="pnm-page">
                {/* Space Background */}
                <div className="space-bg"></div>
                <div className="space-overlay"></div>

                <UniversalHeader pageDepth={1} />

                {/* Page Header */}
                <div className="pnm-header">
                    <h1><span className="white">POKER</span> <span className="gold">NEAR</span> <span className="white">ME</span></h1>
                    <span className="subtitle">FIND POKER ROOMS NEAR YOU</span>
                </div>

                {/* Search Section */}
                <div className="pnm-search-section">
                    <div className="search-container">
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

                        <div className="search-controls">
                            <div className="search-buttons">
                                <button className={`btn-gps ${userLocation ? 'active' : ''}`} onClick={requestGpsLocation} disabled={gpsLoading}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polygon points="3 11 22 2 13 21 11 13 3 11"/>
                                    </svg>
                                    {gpsLoading ? 'Locating...' : 'Use GPS'}
                                </button>
                                <button className={`btn-filters ${showFilters ? 'active' : ''}`} onClick={() => setShowFilters(!showFilters)}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
                                        <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
                                        <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
                                    </svg>
                                    Filters
                                </button>
                            </div>

                            {(userLocation || nearestDistance) && (
                                <div className="distance-display">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polygon points="3 11 22 2 13 21 11 13 3 11"/>
                                    </svg>
                                    <span>~ {nearestDistance || '0'} miles away:</span>
                                    <div className="map-toggle">
                                        <label className="toggle-switch">
                                            <input type="checkbox" checked={showMap} onChange={(e) => setShowMap(e.target.checked)} />
                                            <span className="toggle-slider"></span>
                                        </label>
                                        <span className="toggle-label">Map</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
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
                            {nextMajorSeries ? (
                                <>
                                    <div className="series-preview-logo">
                                        <SeriesLogo shortName={nextMajorSeries.short_name} />
                                    </div>
                                    <div className="game-tags">
                                        <span className="tag primary">NLH</span>
                                        <span className="tag">PLO</span>
                                        <span className="tag">Mixed</span>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="series-preview-logo">
                                        <SeriesLogo shortName="WSOP" />
                                    </div>
                                    <div className="game-tags">
                                        <span className="tag primary">NLH</span>
                                        <span className="tag">PLO</span>
                                        <span className="tag">Mixed</span>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="sidebar-section">
                            <h3>Popular Rooms</h3>
                            <div className="popular-rooms">
                                {(popularRooms.length > 0 ? popularRooms : venues.slice(0, 5)).map((room, i) => (
                                    <div key={room.id || i} className="room-item">
                                        <span className="room-name">{room.name}</span>
                                        <div className="room-games">
                                            {room.is_featured && <span className="star">*</span>}
                                            {room.games_offered?.slice(0, 3).join(' ') || 'NLH PLO'}
                                        </div>
                                    </div>
                                ))}
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
                                {venues.slice(0, 20).map((venue, i) => {
                                    const trust = getTrustLevel(venue.trust_score);
                                    return (
                                        <div key={venue.id || i} className="venue-card">
                                            <h4 className="venue-name">{venue.name}</h4>
                                            <p className="venue-location">{venue.city}, {venue.state}</p>
                                            <div className="venue-meta">
                                                {venue.distance_mi && <span className="meta-distance">{venue.distance_mi} mi</span>}
                                                {venue.games_offered?.slice(0, 3).map(g => (
                                                    <span key={g} className="meta-game">{g}</span>
                                                ))}
                                            </div>
                                            {venue.stakes_cash?.length > 0 && (
                                                <p className="venue-stakes">Stakes: {venue.stakes_cash.slice(0, 3).join(', ')}</p>
                                            )}
                                            <div className="venue-footer">
                                                <span className="trust-badge" style={{ color: trust.color }}>Trust: {trust.label}</span>
                                                <div className="venue-actions">
                                                    {venue.phone && (
                                                        <a href={`tel:${venue.phone}`} className="action-btn">Call</a>
                                                    )}
                                                    {venue.website && (
                                                        <a href={venue.website.startsWith('http') ? venue.website : `https://${venue.website}`} target="_blank" rel="noopener noreferrer" className="action-btn">Website</a>
                                                    )}
                                                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.name + ' ' + venue.city + ' ' + venue.state)}`} target="_blank" rel="noopener noreferrer" className="action-btn primary">Directions</a>
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
                                    <div className="series-card-logo">
                                        <SeriesLogo shortName={s.short_name} />
                                    </div>
                                    <div className="series-card-info">
                                        <h4>{s.name}</h4>
                                        <p className="series-location">{s.location}</p>
                                        <p className="series-dates">{formatDate(s.start_date)} - {formatDate(s.end_date)}</p>
                                    </div>
                                    <div className="series-card-details">
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
                    .space-bg::before {
                        content: '';
                        position: absolute;
                        inset: 0;
                        background-image:
                            radial-gradient(1px 1px at 20px 30px, rgba(255,255,255,0.4), transparent),
                            radial-gradient(1px 1px at 40px 70px, rgba(255,255,255,0.3), transparent),
                            radial-gradient(1px 1px at 50px 160px, rgba(255,255,255,0.4), transparent),
                            radial-gradient(1px 1px at 90px 40px, rgba(255,255,255,0.3), transparent),
                            radial-gradient(1px 1px at 130px 80px, rgba(255,255,255,0.2), transparent),
                            radial-gradient(2px 2px at 160px 120px, rgba(255,255,255,0.5), transparent),
                            radial-gradient(1px 1px at 200px 50px, rgba(255,255,255,0.3), transparent),
                            radial-gradient(1px 1px at 250px 90px, rgba(255,255,255,0.4), transparent),
                            radial-gradient(1px 1px at 300px 130px, rgba(255,255,255,0.3), transparent);
                        background-repeat: repeat;
                        background-size: 350px 200px;
                        animation: twinkle 8s ease-in-out infinite alternate;
                    }
                    @keyframes twinkle {
                        0% { opacity: 0.6; }
                        100% { opacity: 1; }
                    }
                    .space-overlay {
                        position: fixed;
                        inset: 0;
                        background: linear-gradient(180deg,
                            rgba(3,7,18,0.3) 0%,
                            transparent 20%,
                            transparent 80%,
                            rgba(3,7,18,0.5) 100%
                        );
                        z-index: -1;
                    }

                    /* Header */
                    .pnm-header {
                        padding: 24px 20px;
                        display: flex;
                        align-items: baseline;
                        gap: 16px;
                        flex-wrap: wrap;
                    }
                    .pnm-header h1 {
                        font-size: 28px;
                        font-weight: 700;
                        margin: 0;
                        letter-spacing: 1px;
                    }
                    .pnm-header .white { color: #fff; }
                    .pnm-header .gold { color: #d4a853; }
                    .pnm-header .subtitle {
                        font-size: 14px;
                        color: rgba(255,255,255,0.5);
                        font-weight: 400;
                        letter-spacing: 1px;
                    }

                    /* Search Section */
                    .pnm-search-section {
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
                        flex-direction: column;
                        gap: 12px;
                    }
                    .search-buttons {
                        display: flex;
                        gap: 10px;
                    }
                    .btn-gps, .btn-filters {
                        flex: 1;
                        display: flex;
                        align-items: center;
                        justify-content: center;
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
                    .btn-gps:hover, .btn-filters:hover {
                        background: rgba(255,255,255,0.1);
                        border-color: rgba(255,255,255,0.25);
                    }
                    .btn-gps.active {
                        background: rgba(34,197,94,0.2);
                        border-color: rgba(34,197,94,0.5);
                        color: #22c55e;
                    }
                    .btn-filters.active {
                        background: rgba(212,168,83,0.2);
                        border-color: rgba(212,168,83,0.5);
                        color: #d4a853;
                    }

                    .distance-display {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 10px 14px;
                        background: rgba(0,0,0,0.2);
                        border-radius: 10px;
                        color: rgba(255,255,255,0.6);
                        font-size: 13px;
                    }
                    .map-toggle {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin-left: auto;
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
                        background: rgba(255,255,255,0.15);
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
                    .toggle-switch input:checked + .toggle-slider { background: #d4a853; }
                    .toggle-switch input:checked + .toggle-slider:before { transform: translateX(20px); }
                    .toggle-label { font-size: 13px; }

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
                    .btn-apply {
                        width: 100%;
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

                    /* 3-Column Layout */
                    .pnm-layout {
                        display: flex;
                        flex-direction: column;
                        min-height: calc(100vh - 280px);
                        padding: 0 20px;
                    }
                    .sidebar-left, .sidebar-right { display: none; }
                    .venue-feed { flex: 1; }

                    /* Left Sidebar */
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
                    .city-chips { display: flex; flex-wrap: wrap; gap: 8px; }
                    .city-chip {
                        padding: 10px 16px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 8px;
                        color: rgba(255,255,255,0.8);
                        font-size: 13px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .city-chip:hover {
                        background: rgba(255,255,255,0.1);
                        border-color: rgba(255,255,255,0.2);
                    }
                    .city-chip.active {
                        background: rgba(212,168,83,0.15);
                        border-color: rgba(212,168,83,0.4);
                        color: #d4a853;
                    }

                    .series-preview {
                        background: linear-gradient(180deg, rgba(30,58,138,0.2) 0%, rgba(15,23,42,0.4) 100%);
                        border: 1px solid rgba(59,130,246,0.2);
                        border-radius: 12px;
                        margin: 0;
                    }
                    .series-preview-logo { margin-bottom: 14px; }
                    .game-tags { display: flex; gap: 8px; flex-wrap: wrap; }
                    .game-tags .tag {
                        padding: 6px 12px;
                        background: rgba(255,255,255,0.08);
                        border-radius: 6px;
                        font-size: 12px;
                        color: rgba(255,255,255,0.7);
                    }
                    .game-tags .tag.primary {
                        background: rgba(212,168,83,0.2);
                        color: #d4a853;
                    }

                    .popular-rooms { display: flex; flex-direction: column; gap: 14px; }
                    .room-item {
                        padding: 10px 12px;
                        background: rgba(255,255,255,0.03);
                        border-radius: 8px;
                        transition: all 0.2s;
                    }
                    .room-item:hover { background: rgba(255,255,255,0.06); }
                    .room-name { font-size: 14px; font-weight: 500; display: block; margin-bottom: 4px; }
                    .room-games { font-size: 11px; color: rgba(255,255,255,0.5); }
                    .room-games .star { color: #d4a853; margin-right: 4px; }

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
                    .empty-state button:hover {
                        background: rgba(212,168,83,0.3);
                    }

                    /* Venue Cards - Clean Sleek Style */
                    .venue-list {
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                    }
                    .venue-card {
                        padding: 16px 20px;
                        background: rgba(15, 23, 42, 0.4);
                        border: 1px solid rgba(255, 255, 255, 0.12);
                        border-radius: 12px;
                        transition: all 0.2s ease;
                    }
                    .venue-card:hover {
                        border-color: rgba(255, 255, 255, 0.25);
                        background: rgba(15, 23, 42, 0.6);
                    }
                    .venue-name {
                        font-size: 17px;
                        font-weight: 600;
                        margin: 0 0 4px;
                        color: #fff;
                    }
                    .venue-location {
                        font-size: 13px;
                        color: rgba(255, 255, 255, 0.5);
                        margin: 0 0 12px;
                    }
                    .venue-meta {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px;
                        margin-bottom: 10px;
                    }
                    .meta-distance {
                        font-size: 12px;
                        padding: 4px 10px;
                        background: rgba(34, 197, 94, 0.15);
                        color: #4ade80;
                        border-radius: 4px;
                    }
                    .meta-game {
                        font-size: 12px;
                        padding: 4px 10px;
                        background: rgba(255, 255, 255, 0.08);
                        color: rgba(255, 255, 255, 0.7);
                        border-radius: 4px;
                    }
                    .venue-stakes {
                        font-size: 13px;
                        color: rgba(255, 255, 255, 0.6);
                        margin: 0 0 12px;
                    }
                    .venue-footer {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        flex-wrap: wrap;
                        gap: 12px;
                        padding-top: 12px;
                        border-top: 1px solid rgba(255, 255, 255, 0.06);
                    }
                    .trust-badge {
                        font-size: 12px;
                        font-weight: 500;
                    }
                    .venue-actions {
                        display: flex;
                        gap: 8px;
                    }
                    .action-btn {
                        padding: 6px 12px;
                        font-size: 12px;
                        font-weight: 500;
                        color: rgba(255, 255, 255, 0.7);
                        text-decoration: none;
                        border: 1px solid rgba(255, 255, 255, 0.15);
                        border-radius: 6px;
                        transition: all 0.2s;
                    }
                    .action-btn:hover {
                        color: #fff;
                        border-color: rgba(255, 255, 255, 0.3);
                        background: rgba(255, 255, 255, 0.05);
                    }
                    .action-btn.primary {
                        background: rgba(212, 168, 83, 0.15);
                        border-color: rgba(212, 168, 83, 0.3);
                        color: #d4a853;
                    }
                    .action-btn.primary:hover {
                        background: rgba(212, 168, 83, 0.25);
                    }

                    /* Right Sidebar */
                    .series-header {
                        padding: 20px;
                        border-bottom: 1px solid rgba(255,255,255,0.08);
                    }
                    .series-header h3 {
                        font-size: 13px;
                        font-weight: 600;
                        color: rgba(255,255,255,0.9);
                        margin: 0 0 14px;
                        letter-spacing: 0.5px;
                    }
                    .series-filters { display: flex; gap: 8px; }
                    .series-filters select {
                        flex: 1;
                        padding: 10px 12px;
                        background: rgba(0,0,0,0.3);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 8px;
                        color: #fff;
                        font-size: 12px;
                        outline: none;
                        cursor: pointer;
                    }
                    .series-filters select:focus {
                        border-color: rgba(212,168,83,0.5);
                    }
                    .series-list {
                        padding: 16px;
                        display: flex;
                        flex-direction: column;
                        gap: 14px;
                    }
                    .series-card {
                        background: linear-gradient(135deg, rgba(30,41,59,0.6), rgba(15,23,42,0.8));
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 12px;
                        padding: 16px;
                        transition: all 0.2s;
                    }
                    .series-card:hover {
                        border-color: rgba(255,255,255,0.2);
                        background: linear-gradient(135deg, rgba(30,41,59,0.8), rgba(15,23,42,0.9));
                    }
                    .series-card-logo {
                        margin-bottom: 12px;
                    }
                    .series-card-info h4 {
                        font-size: 16px;
                        font-weight: 600;
                        margin: 0 0 4px;
                    }
                    .series-location {
                        font-size: 13px;
                        color: rgba(255,255,255,0.6);
                        margin: 0 0 2px;
                    }
                    .series-dates {
                        font-size: 12px;
                        color: rgba(255,255,255,0.5);
                        margin: 0;
                    }
                    .series-card-details {
                        margin-top: 12px;
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                    }
                    .series-card-details span {
                        font-size: 12px;
                        color: rgba(255,255,255,0.7);
                    }

                    /* Tablet */
                    @media (min-width: 768px) {
                        .pnm-header h1 { font-size: 32px; }
                        .venue-list {
                            display: grid;
                            grid-template-columns: repeat(2, 1fr);
                            gap: 16px;
                        }
                        .search-controls {
                            flex-direction: row;
                            align-items: center;
                        }
                        .search-buttons { flex: 0 0 auto; }
                        .distance-display { flex: 1; }
                    }

                    /* Desktop */
                    @media (min-width: 1024px) {
                        .pnm-layout {
                            display: grid;
                            grid-template-columns: 260px 1fr 320px;
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
                        .venue-feed {
                            padding: 20px;
                        }
                        .venue-list {
                            grid-template-columns: 1fr;
                        }
                        .pnm-search-section {
                            padding: 0 20px 20px;
                            margin-left: 260px;
                            margin-right: 320px;
                        }
                        .pnm-header {
                            margin-left: 260px;
                        }
                        .filter-panel {
                            margin-left: calc(260px + 20px);
                            margin-right: calc(320px + 20px);
                        }
                    }

                    /* Large Desktop */
                    @media (min-width: 1280px) {
                        .pnm-layout {
                            grid-template-columns: 300px 1fr 360px;
                        }
                        .venue-list {
                            grid-template-columns: repeat(2, 1fr);
                        }
                        .pnm-search-section {
                            margin-left: 300px;
                            margin-right: 360px;
                        }
                        .pnm-header {
                            margin-left: 300px;
                        }
                        .filter-panel {
                            margin-left: calc(300px + 20px);
                            margin-right: calc(360px + 20px);
                        }
                    }
                `}</style>
            </div>
        </>
    );
}
