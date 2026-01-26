/**
 * POKER NEAR ME - Unified Search for Venues, Tours, Series, and Daily Events
 * Complete poker discovery platform
 */

import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
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

const TOUR_TYPE_LABELS = {
    major: 'Major Tour',
    circuit: 'Circuit',
    high_roller: 'High Roller',
    regional: 'Regional',
    grassroots: 'Grassroots',
    charity: 'Charity',
    cruise: 'Cruise'
};

const TOUR_COLORS = {
    'WSOP': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227' },
    'WPT': { bg: 'linear-gradient(135deg, #dc2626, #991b1b)', text: '#fff', border: '#dc2626' },
    'WSOPC': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227' },
    'MSPT': { bg: 'linear-gradient(135deg, #1e40af, #1e3a8a)', text: '#fff', border: '#3b82f6' },
    'RGPS': { bg: 'linear-gradient(135deg, #059669, #047857)', text: '#fff', border: '#10b981' },
    'PGT': { bg: 'linear-gradient(135deg, #7c3aed, #5b21b6)', text: '#fff', border: '#8b5cf6' },
    'default': { bg: 'linear-gradient(135deg, #374151, #1f2937)', text: '#fff', border: '#4b5563' }
};

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getTrustLevel(score) {
    if (score >= 4.5) return { label: 'High', color: '#22c55e' };
    if (score >= 4.0) return { label: 'Good', color: '#3b82f6' };
    if (score >= 3.0) return { label: 'Moderate', color: '#f59e0b' };
    return { label: 'Low', color: '#ef4444' };
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMoney(amount) {
    if (!amount) return '';
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(0)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toLocaleString()}`;
}

function getCurrentDay() {
    return DAYS_OF_WEEK[new Date().getDay()];
}

// Tour Badge Component
function TourBadge({ tourCode, size = 'normal' }) {
    const style = TOUR_COLORS[tourCode] || TOUR_COLORS.default;
    const padding = size === 'small' ? '4px 10px' : '8px 16px';
    const fontSize = size === 'small' ? '11px' : '14px';

    return (
        <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding,
            borderRadius: '6px',
            background: style.bg,
            border: `1px solid ${style.border}`,
            minWidth: size === 'small' ? '50px' : '70px'
        }}>
            <span style={{ color: style.text, fontSize, fontWeight: 800, letterSpacing: '0.5px' }}>
                {tourCode || 'TOUR'}
            </span>
        </div>
    );
}

export default function PokerNearMe() {
    // Active tab state
    const [activeTab, setActiveTab] = useState('venues');

    // Data states
    const [venues, setVenues] = useState([]);
    const [tours, setTours] = useState([]);
    const [series, setSeries] = useState([]);
    const [dailyTournaments, setDailyTournaments] = useState([]);

    // UI states
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [userLocation, setUserLocation] = useState(null);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [selectedCity, setSelectedCity] = useState(null);
    const [nearestDistance, setNearestDistance] = useState(null);

    // Filter states
    const [filters, setFilters] = useState({
        // Venue filters
        venueType: 'all',
        hasNLH: false,
        hasPLO: false,
        hasMixed: false,
        // Tour filters
        tourType: 'all',
        // Series filters
        seriesTimeframe: 90,
        seriesType: 'all',
        // Daily tournament filters
        selectedDay: getCurrentDay(),
        minBuyin: '',
        maxBuyin: ''
    });

    // Fetch all data on mount and when filters change
    useEffect(() => {
        fetchAllData();
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
            () => {
                alert('Unable to get your location. Please enable location services.');
                setGpsLoading(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    const fetchAllData = async () => {
        setLoading(true);
        await Promise.all([
            fetchVenues(),
            fetchTours(),
            fetchSeries(),
            fetchDailyTournaments()
        ]);
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

    const fetchTours = async () => {
        try {
            const params = new URLSearchParams({ include_series: 'true', limit: '30' });
            if (filters.tourType !== 'all') {
                params.set('type', filters.tourType);
            }
            if (searchQuery) {
                params.set('search', searchQuery);
            }

            const res = await fetch(`/api/poker/tours?${params}`);
            const { data } = await res.json();
            setTours(data || []);
        } catch (e) {
            console.error('Fetch tours error:', e);
            setTours([]);
        }
    };

    const fetchSeries = async () => {
        try {
            const params = new URLSearchParams({ upcoming: 'true', limit: '50' });

            // Add date range filter
            const today = new Date();
            const endDate = new Date();
            endDate.setDate(today.getDate() + filters.seriesTimeframe);
            params.set('end_date', endDate.toISOString().split('T')[0]);

            if (filters.seriesType !== 'all') {
                params.set('type', filters.seriesType);
            }
            if (searchQuery) {
                params.set('search', searchQuery);
            }

            const res = await fetch(`/api/poker/series?${params}`);
            const { data } = await res.json();
            setSeries(data || []);
        } catch (e) {
            console.error('Fetch series error:', e);
            setSeries([]);
        }
    };

    const fetchDailyTournaments = async () => {
        try {
            const params = new URLSearchParams({ limit: '100' });
            params.set('day', filters.selectedDay);

            if (selectedCity?.state) {
                params.set('state', selectedCity.state);
            }
            if (searchQuery) {
                params.set('venue', searchQuery);
            }
            if (filters.minBuyin) {
                params.set('minBuyin', filters.minBuyin);
            }
            if (filters.maxBuyin) {
                params.set('maxBuyin', filters.maxBuyin);
            }

            const res = await fetch(`/api/poker/daily-tournaments?${params}`);
            const { tournaments } = await res.json();
            setDailyTournaments(tournaments || []);
        } catch (e) {
            console.error('Fetch daily tournaments error:', e);
            setDailyTournaments([]);
        }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        fetchAllData();
    };

    const handleCityClick = (city) => {
        setSelectedCity(city);
        setUserLocation(null);
    };

    const clearFilters = () => {
        setSelectedCity(null);
        setUserLocation(null);
        setSearchQuery('');
        setFilters({
            venueType: 'all',
            hasNLH: false,
            hasPLO: false,
            hasMixed: false,
            tourType: 'all',
            seriesTimeframe: 90,
            seriesType: 'all',
            selectedDay: getCurrentDay(),
            minBuyin: '',
            maxBuyin: ''
        });
    };

    // Get counts for tabs
    const getCounts = () => ({
        venues: venues.length,
        tours: tours.length,
        series: series.length,
        daily: dailyTournaments.length
    });

    const counts = getCounts();

    // Render content based on active tab
    const renderContent = () => {
        if (loading) {
            return (
                <div className="loading-state">
                    <div className="spinner"></div>
                    <span>Loading poker data...</span>
                </div>
            );
        }

        switch (activeTab) {
            case 'venues':
                return renderVenues();
            case 'tours':
                return renderTours();
            case 'series':
                return renderSeries();
            case 'daily':
                return renderDailyTournaments();
            default:
                return renderVenues();
        }
    };

    const renderVenues = () => {
        if (venues.length === 0) {
            return (
                <div className="empty-state">
                    <p>No venues found</p>
                    <button onClick={clearFilters}>Clear Filters</button>
                </div>
            );
        }

        return (
            <div className="card-grid">
                {venues.slice(0, 30).map((venue, i) => {
                    const trust = getTrustLevel(venue.trust_score);
                    return (
                        <div key={venue.id || i} className="entity-card venue-card">
                            <div className="card-header">
                                <h4>{venue.name}</h4>
                                <span className="badge venue-type">{VENUE_TYPE_LABELS[venue.venue_type] || venue.venue_type}</span>
                            </div>
                            <p className="card-location">{venue.city}, {venue.state}</p>
                            <div className="card-tags">
                                {venue.distance_mi && <span className="tag distance">{venue.distance_mi} mi</span>}
                                {venue.games_offered?.slice(0, 3).map(g => (
                                    <span key={g} className="tag game">{g}</span>
                                ))}
                            </div>
                            {venue.stakes_cash?.length > 0 && (
                                <p className="card-detail">Stakes: {venue.stakes_cash.slice(0, 3).join(', ')}</p>
                            )}
                            <div className="card-footer">
                                <span className="trust-badge" style={{ color: trust.color }}>Trust: {trust.label}</span>
                                <div className="card-actions">
                                    {venue.phone && <a href={`tel:${venue.phone}`} className="action-btn">Call</a>}
                                    {venue.website && (
                                        <a href={venue.website.startsWith('http') ? venue.website : `https://${venue.website}`}
                                            target="_blank" rel="noopener noreferrer" className="action-btn">Web</a>
                                    )}
                                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.name + ' ' + venue.city + ' ' + venue.state)}`}
                                        target="_blank" rel="noopener noreferrer" className="action-btn primary">Map</a>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderTours = () => {
        if (tours.length === 0) {
            return (
                <div className="empty-state">
                    <p>No tours found</p>
                    <button onClick={clearFilters}>Clear Filters</button>
                </div>
            );
        }

        return (
            <div className="card-grid tours-grid">
                {tours.map((tour, i) => (
                    <div key={tour.tour_code || i} className="entity-card tour-card">
                        <div className="card-header">
                            <TourBadge tourCode={tour.tour_code} />
                            <span className="badge tour-type">{TOUR_TYPE_LABELS[tour.tour_type] || tour.tour_type}</span>
                        </div>
                        <h4 className="tour-name">{tour.tour_name}</h4>
                        <p className="card-location">{tour.headquarters}</p>
                        {tour.typical_buyins && (
                            <p className="card-detail">
                                Buy-ins: {formatMoney(tour.typical_buyins.min)} - {formatMoney(tour.typical_buyins.max)}
                            </p>
                        )}
                        {tour.regions && tour.regions.length > 0 && (
                            <div className="card-tags">
                                {tour.regions.map(r => <span key={r} className="tag region">{r}</span>)}
                            </div>
                        )}
                        {tour.upcoming_series && tour.upcoming_series.length > 0 && (
                            <div className="upcoming-series">
                                <span className="upcoming-label">Next: {tour.upcoming_series[0].short_name || tour.upcoming_series[0].name}</span>
                                <span className="upcoming-date">{formatDate(tour.upcoming_series[0].start_date)}</span>
                            </div>
                        )}
                        <div className="card-footer">
                            <span className="established">Est. {tour.established}</span>
                            {tour.official_website && (
                                <a href={tour.official_website} target="_blank" rel="noopener noreferrer" className="action-btn primary">
                                    Website
                                </a>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderSeries = () => {
        if (series.length === 0) {
            return (
                <div className="empty-state">
                    <p>No tournament series found</p>
                    <button onClick={clearFilters}>Clear Filters</button>
                </div>
            );
        }

        return (
            <div className="card-grid">
                {series.slice(0, 30).map((s, i) => (
                    <div key={s.id || i} className="entity-card series-card">
                        <div className="card-header">
                            <TourBadge tourCode={s.short_name} size="small" />
                            <span className="badge series-type">{s.series_type}</span>
                        </div>
                        <h4>{s.name}</h4>
                        <p className="card-location">{s.location || `${s.city || s.venue}, ${s.state || ''}`}</p>
                        <p className="card-dates">{formatDate(s.start_date)} - {formatDate(s.end_date)}</p>
                        <div className="card-tags">
                            {s.total_events && <span className="tag events">{s.total_events} Events</span>}
                            {s.main_event_buyin && <span className="tag buyin">{formatMoney(s.main_event_buyin)} Main</span>}
                        </div>
                        {s.main_event_guaranteed && (
                            <p className="card-detail guaranteed">{formatMoney(s.main_event_guaranteed)}+ GTD</p>
                        )}
                        <div className="card-footer">
                            {s.source_url && (
                                <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="action-btn primary">
                                    Details
                                </a>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderDailyTournaments = () => {
        if (dailyTournaments.length === 0) {
            return (
                <div className="empty-state">
                    <p>No daily tournaments found for {filters.selectedDay}</p>
                    <button onClick={clearFilters}>Clear Filters</button>
                </div>
            );
        }

        return (
            <>
                <div className="day-selector">
                    {DAYS_OF_WEEK.map(day => (
                        <button
                            key={day}
                            className={`day-btn ${filters.selectedDay === day ? 'active' : ''}`}
                            onClick={() => {
                                setFilters({ ...filters, selectedDay: day });
                                setTimeout(() => fetchDailyTournaments(), 0);
                            }}
                        >
                            {day.slice(0, 3)}
                        </button>
                    ))}
                </div>
                <div className="card-grid daily-grid">
                    {dailyTournaments.slice(0, 50).map((t, i) => (
                        <div key={t.id || i} className="entity-card daily-card">
                            <div className="card-header">
                                <span className="time-badge">{t.start_time}</span>
                                <span className="badge game-type">{t.game_type || 'NLH'}</span>
                            </div>
                            <h4>{t.venue_name}</h4>
                            <p className="card-location">{t.city}, {t.state}</p>
                            <div className="card-tags">
                                <span className="tag buyin">${t.buy_in}</span>
                                {t.guaranteed && <span className="tag gtd">{formatMoney(t.guaranteed)} GTD</span>}
                                {t.format && <span className="tag format">{t.format}</span>}
                            </div>
                            {t.tournament_name && (
                                <p className="card-detail">{t.tournament_name}</p>
                            )}
                            <div className="card-footer">
                                <span className="venue-type">{t.venueType}</span>
                                {t.pokerAtlasUrl && (
                                    <a href={t.pokerAtlasUrl} target="_blank" rel="noopener noreferrer" className="action-btn primary">
                                        Info
                                    </a>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </>
        );
    };

    return (
        <>
            <Head>
                <title>Poker Near Me | Smarter.Poker</title>
                <meta name="description" content="Find poker rooms, tours, tournament series, and daily events near you." />
            </Head>

            <div className="pnm-page">
                <div className="space-bg"></div>
                <div className="space-overlay"></div>

                <UniversalHeader pageDepth={1} />

                {/* Page Header */}
                <div className="pnm-header">
                    <h1><span className="white">POKER</span> <span className="gold">NEAR</span> <span className="white">ME</span></h1>
                    <span className="subtitle">VENUES | TOURS | SERIES | DAILY EVENTS</span>
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
                                placeholder="Search venues, tours, series, or events..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <button type="submit" className="search-btn">Search</button>
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

                            {/* Popular Cities */}
                            <div className="city-chips">
                                {POPULAR_CITIES.map(city => (
                                    <button key={city.name} className={`city-chip ${selectedCity?.name === city.name ? 'active' : ''}`}
                                        onClick={() => handleCityClick(city)}>
                                        {city.name}
                                    </button>
                                ))}
                                {selectedCity && (
                                    <button className="city-chip clear" onClick={() => setSelectedCity(null)}>Clear</button>
                                )}
                            </div>

                            {(userLocation || nearestDistance) && (
                                <div className="distance-display">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polygon points="3 11 22 2 13 21 11 13 3 11"/>
                                    </svg>
                                    <span>Nearest: ~{nearestDistance || '0'} miles</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Filter Panel */}
                {showFilters && (
                    <div className="filter-panel">
                        {activeTab === 'venues' && (
                            <>
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
                                        <button className={`chip ${filters.hasNLH ? 'active' : ''}`}
                                            onClick={() => setFilters({...filters, hasNLH: !filters.hasNLH})}>NLH</button>
                                        <button className={`chip ${filters.hasPLO ? 'active' : ''}`}
                                            onClick={() => setFilters({...filters, hasPLO: !filters.hasPLO})}>PLO</button>
                                        <button className={`chip ${filters.hasMixed ? 'active' : ''}`}
                                            onClick={() => setFilters({...filters, hasMixed: !filters.hasMixed})}>Mixed</button>
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === 'tours' && (
                            <div className="filter-group">
                                <label>Tour Type</label>
                                <div className="filter-chips">
                                    {['all', 'major', 'circuit', 'high_roller', 'regional'].map(type => (
                                        <button key={type} className={`chip ${filters.tourType === type ? 'active' : ''}`}
                                            onClick={() => setFilters({...filters, tourType: type})}>
                                            {type === 'all' ? 'All' : TOUR_TYPE_LABELS[type]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'series' && (
                            <>
                                <div className="filter-group">
                                    <label>Timeframe</label>
                                    <div className="filter-chips">
                                        {[30, 60, 90, 180].map(days => (
                                            <button key={days} className={`chip ${filters.seriesTimeframe === days ? 'active' : ''}`}
                                                onClick={() => setFilters({...filters, seriesTimeframe: days})}>
                                                {days} Days
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="filter-group">
                                    <label>Series Type</label>
                                    <div className="filter-chips">
                                        {['all', 'major', 'circuit', 'regional'].map(type => (
                                            <button key={type} className={`chip ${filters.seriesType === type ? 'active' : ''}`}
                                                onClick={() => setFilters({...filters, seriesType: type})}>
                                                {type.charAt(0).toUpperCase() + type.slice(1)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === 'daily' && (
                            <div className="filter-group">
                                <label>Buy-in Range</label>
                                <div className="filter-inputs">
                                    <input
                                        type="number"
                                        placeholder="Min $"
                                        value={filters.minBuyin}
                                        onChange={(e) => setFilters({...filters, minBuyin: e.target.value})}
                                    />
                                    <span>to</span>
                                    <input
                                        type="number"
                                        placeholder="Max $"
                                        value={filters.maxBuyin}
                                        onChange={(e) => setFilters({...filters, maxBuyin: e.target.value})}
                                    />
                                </div>
                            </div>
                        )}

                        <button className="btn-apply" onClick={() => { fetchAllData(); setShowFilters(false); }}>
                            Apply Filters
                        </button>
                    </div>
                )}

                {/* Tab Navigation */}
                <div className="tab-navigation">
                    <button className={`tab ${activeTab === 'venues' ? 'active' : ''}`} onClick={() => setActiveTab('venues')}>
                        <span className="tab-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                            </svg>
                        </span>
                        Venues <span className="tab-count">{counts.venues}</span>
                    </button>
                    <button className={`tab ${activeTab === 'tours' ? 'active' : ''}`} onClick={() => setActiveTab('tours')}>
                        <span className="tab-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
                            </svg>
                        </span>
                        Tours <span className="tab-count">{counts.tours}</span>
                    </button>
                    <button className={`tab ${activeTab === 'series' ? 'active' : ''}`} onClick={() => setActiveTab('series')}>
                        <span className="tab-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                            </svg>
                        </span>
                        Series <span className="tab-count">{counts.series}</span>
                    </button>
                    <button className={`tab ${activeTab === 'daily' ? 'active' : ''}`} onClick={() => setActiveTab('daily')}>
                        <span className="tab-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                            </svg>
                        </span>
                        Daily <span className="tab-count">{counts.daily}</span>
                    </button>
                </div>

                {/* Main Content */}
                <main className="pnm-content">
                    {renderContent()}
                </main>

                <style jsx>{`
                    .pnm-page {
                        min-height: 100vh;
                        position: relative;
                        color: #fff;
                        font-family: 'Inter', -apple-system, sans-serif;
                        overflow-x: hidden;
                        padding-bottom: 40px;
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
                            radial-gradient(2px 2px at 160px 120px, rgba(255,255,255,0.5), transparent);
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
                        background: linear-gradient(180deg, rgba(3,7,18,0.3) 0%, transparent 20%, transparent 80%, rgba(3,7,18,0.5) 100%);
                        z-index: -1;
                    }

                    /* Header */
                    .pnm-header {
                        padding: 24px 20px;
                        text-align: center;
                    }
                    .pnm-header h1 {
                        font-size: 32px;
                        font-weight: 700;
                        margin: 0;
                        letter-spacing: 2px;
                    }
                    .pnm-header .white { color: #fff; }
                    .pnm-header .gold { color: #d4a853; }
                    .pnm-header .subtitle {
                        display: block;
                        font-size: 12px;
                        color: rgba(255,255,255,0.5);
                        margin-top: 8px;
                        letter-spacing: 3px;
                    }

                    /* Search Section */
                    .pnm-search-section {
                        padding: 0 20px 20px;
                        max-width: 900px;
                        margin: 0 auto;
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
                        display: flex;
                        gap: 10px;
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
                        flex: 1;
                        padding: 14px 16px 14px 48px;
                        background: rgba(0,0,0,0.3);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 12px;
                        color: #fff;
                        font-size: 15px;
                        outline: none;
                    }
                    .search-form input:focus {
                        border-color: rgba(212,168,83,0.5);
                    }
                    .search-form input::placeholder { color: rgba(255,255,255,0.4); }
                    .search-btn {
                        padding: 14px 24px;
                        background: linear-gradient(135deg, #d4a853, #b8860b);
                        border: none;
                        border-radius: 12px;
                        color: #000;
                        font-weight: 600;
                        cursor: pointer;
                    }

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

                    .city-chips {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px;
                    }
                    .city-chip {
                        padding: 8px 14px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 20px;
                        color: rgba(255,255,255,0.7);
                        font-size: 13px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .city-chip:hover {
                        background: rgba(255,255,255,0.1);
                    }
                    .city-chip.active {
                        background: rgba(212,168,83,0.2);
                        border-color: rgba(212,168,83,0.5);
                        color: #d4a853;
                    }
                    .city-chip.clear {
                        background: rgba(239,68,68,0.2);
                        border-color: rgba(239,68,68,0.4);
                        color: #ef4444;
                    }

                    .distance-display {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 8px 12px;
                        background: rgba(34,197,94,0.1);
                        border-radius: 8px;
                        color: #4ade80;
                        font-size: 13px;
                    }

                    /* Filter Panel */
                    .filter-panel {
                        max-width: 900px;
                        margin: 0 auto 20px;
                        padding: 16px;
                        background: rgba(15, 23, 42, 0.8);
                        backdrop-filter: blur(12px);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 12px;
                        margin-left: 20px;
                        margin-right: 20px;
                    }
                    .filter-group {
                        margin-bottom: 16px;
                    }
                    .filter-group label {
                        display: block;
                        font-size: 11px;
                        color: rgba(255,255,255,0.5);
                        margin-bottom: 8px;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                    }
                    .filter-chips {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px;
                    }
                    .chip {
                        padding: 8px 14px;
                        background: rgba(0,0,0,0.3);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 20px;
                        color: rgba(255,255,255,0.7);
                        font-size: 13px;
                        cursor: pointer;
                    }
                    .chip.active {
                        background: rgba(212,168,83,0.2);
                        border-color: rgba(212,168,83,0.5);
                        color: #d4a853;
                    }
                    .filter-inputs {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    }
                    .filter-inputs input {
                        width: 100px;
                        padding: 10px 12px;
                        background: rgba(0,0,0,0.3);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 8px;
                        color: #fff;
                        font-size: 14px;
                    }
                    .filter-inputs span {
                        color: rgba(255,255,255,0.5);
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
                    }

                    /* Tab Navigation */
                    .tab-navigation {
                        display: flex;
                        justify-content: center;
                        gap: 8px;
                        padding: 0 20px;
                        margin-bottom: 20px;
                        flex-wrap: wrap;
                    }
                    .tab {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 12px 20px;
                        background: rgba(15, 23, 42, 0.6);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 10px;
                        color: rgba(255,255,255,0.7);
                        font-size: 14px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .tab:hover {
                        background: rgba(255,255,255,0.1);
                    }
                    .tab.active {
                        background: rgba(212,168,83,0.2);
                        border-color: rgba(212,168,83,0.5);
                        color: #d4a853;
                    }
                    .tab-icon {
                        display: flex;
                        align-items: center;
                    }
                    .tab-count {
                        background: rgba(255,255,255,0.1);
                        padding: 2px 8px;
                        border-radius: 10px;
                        font-size: 12px;
                    }
                    .tab.active .tab-count {
                        background: rgba(212,168,83,0.3);
                    }

                    /* Main Content */
                    .pnm-content {
                        padding: 0 20px;
                        max-width: 1400px;
                        margin: 0 auto;
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
                    }

                    /* Card Grid */
                    .card-grid {
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: 16px;
                    }
                    @media (min-width: 640px) {
                        .card-grid {
                            grid-template-columns: repeat(2, 1fr);
                        }
                    }
                    @media (min-width: 1024px) {
                        .card-grid {
                            grid-template-columns: repeat(3, 1fr);
                        }
                    }
                    @media (min-width: 1280px) {
                        .card-grid {
                            grid-template-columns: repeat(4, 1fr);
                        }
                    }

                    /* Entity Cards */
                    .entity-card {
                        background: rgba(15, 23, 42, 0.5);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 12px;
                        padding: 16px;
                        transition: all 0.2s;
                    }
                    .entity-card:hover {
                        border-color: rgba(255,255,255,0.2);
                        background: rgba(15, 23, 42, 0.7);
                    }
                    .card-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        margin-bottom: 10px;
                    }
                    .entity-card h4 {
                        font-size: 16px;
                        font-weight: 600;
                        margin: 0 0 4px;
                        color: #fff;
                    }
                    .card-location {
                        font-size: 13px;
                        color: rgba(255,255,255,0.5);
                        margin: 0 0 10px;
                    }
                    .card-dates {
                        font-size: 12px;
                        color: rgba(255,255,255,0.6);
                        margin: 0 0 10px;
                    }
                    .card-detail {
                        font-size: 13px;
                        color: rgba(255,255,255,0.6);
                        margin: 8px 0;
                    }
                    .card-detail.guaranteed {
                        color: #4ade80;
                        font-weight: 600;
                    }

                    /* Badges */
                    .badge {
                        padding: 4px 10px;
                        border-radius: 6px;
                        font-size: 11px;
                        font-weight: 600;
                        text-transform: uppercase;
                    }
                    .badge.venue-type {
                        background: rgba(59,130,246,0.2);
                        color: #60a5fa;
                    }
                    .badge.tour-type {
                        background: rgba(139,92,246,0.2);
                        color: #a78bfa;
                    }
                    .badge.series-type {
                        background: rgba(34,197,94,0.2);
                        color: #4ade80;
                    }
                    .badge.game-type {
                        background: rgba(212,168,83,0.2);
                        color: #d4a853;
                    }

                    /* Tags */
                    .card-tags {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 6px;
                        margin-bottom: 10px;
                    }
                    .tag {
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 11px;
                        background: rgba(255,255,255,0.08);
                        color: rgba(255,255,255,0.7);
                    }
                    .tag.distance {
                        background: rgba(34,197,94,0.15);
                        color: #4ade80;
                    }
                    .tag.game {
                        background: rgba(255,255,255,0.08);
                    }
                    .tag.region {
                        background: rgba(59,130,246,0.15);
                        color: #60a5fa;
                    }
                    .tag.events {
                        background: rgba(139,92,246,0.15);
                        color: #a78bfa;
                    }
                    .tag.buyin {
                        background: rgba(212,168,83,0.15);
                        color: #d4a853;
                    }
                    .tag.gtd {
                        background: rgba(34,197,94,0.15);
                        color: #4ade80;
                    }
                    .tag.format {
                        background: rgba(239,68,68,0.15);
                        color: #f87171;
                    }

                    /* Card Footer */
                    .card-footer {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding-top: 12px;
                        border-top: 1px solid rgba(255,255,255,0.06);
                        margin-top: 12px;
                    }
                    .trust-badge {
                        font-size: 12px;
                        font-weight: 500;
                    }
                    .established {
                        font-size: 12px;
                        color: rgba(255,255,255,0.4);
                    }
                    .venue-type {
                        font-size: 12px;
                        color: rgba(255,255,255,0.5);
                    }
                    .card-actions {
                        display: flex;
                        gap: 8px;
                    }
                    .action-btn {
                        padding: 6px 12px;
                        font-size: 12px;
                        font-weight: 500;
                        color: rgba(255,255,255,0.7);
                        text-decoration: none;
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 6px;
                        transition: all 0.2s;
                    }
                    .action-btn:hover {
                        background: rgba(255,255,255,0.05);
                    }
                    .action-btn.primary {
                        background: rgba(212,168,83,0.15);
                        border-color: rgba(212,168,83,0.3);
                        color: #d4a853;
                    }

                    /* Tour-specific */
                    .tour-name {
                        margin-top: 10px;
                    }
                    .upcoming-series {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 8px 10px;
                        background: rgba(255,255,255,0.05);
                        border-radius: 6px;
                        margin-top: 10px;
                    }
                    .upcoming-label {
                        font-size: 12px;
                        color: rgba(255,255,255,0.7);
                    }
                    .upcoming-date {
                        font-size: 12px;
                        color: #d4a853;
                    }

                    /* Daily tournaments */
                    .day-selector {
                        display: flex;
                        justify-content: center;
                        gap: 6px;
                        margin-bottom: 20px;
                        flex-wrap: wrap;
                    }
                    .day-btn {
                        padding: 10px 16px;
                        background: rgba(15, 23, 42, 0.6);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 8px;
                        color: rgba(255,255,255,0.7);
                        font-size: 13px;
                        font-weight: 500;
                        cursor: pointer;
                    }
                    .day-btn.active {
                        background: rgba(212,168,83,0.2);
                        border-color: rgba(212,168,83,0.5);
                        color: #d4a853;
                    }
                    .time-badge {
                        padding: 4px 10px;
                        background: rgba(59,130,246,0.2);
                        border-radius: 6px;
                        font-size: 12px;
                        font-weight: 600;
                        color: #60a5fa;
                    }

                    /* Mobile */
                    @media (max-width: 640px) {
                        .pnm-header h1 {
                            font-size: 24px;
                        }
                        .search-form {
                            flex-direction: column;
                        }
                        .search-btn {
                            width: 100%;
                        }
                        .tab {
                            padding: 10px 14px;
                            font-size: 12px;
                        }
                        .tab-icon {
                            display: none;
                        }
                    }
                `}</style>
            </div>
        </>
    );
}
