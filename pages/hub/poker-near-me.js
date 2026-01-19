/**
 * POKER NEAR ME - Live Discovery & Trust Engine
 * Find casinos, poker clubs, and tournament series
 * Part of Orb #9: Geo-Spatial Intelligence
 */

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MapPin, Calendar, Clock, DollarSign, Users, Trophy,
    Search, Filter, ChevronRight, Star, Navigation, Loader,
    Zap, ExternalLink, Phone, Globe, Building2, Shield,
    Gamepad2, CreditCard, ChevronDown
} from 'lucide-react';

// US States for filter
const US_STATES = [
    { code: 'NV', name: 'Nevada' },
    { code: 'CA', name: 'California' },
    { code: 'FL', name: 'Florida' },
    { code: 'TX', name: 'Texas' },
    { code: 'NJ', name: 'New Jersey' },
    { code: 'CT', name: 'Connecticut' },
    { code: 'PA', name: 'Pennsylvania' },
    { code: 'AZ', name: 'Arizona' },
    { code: 'CO', name: 'Colorado' },
    { code: 'IL', name: 'Illinois' },
    { code: 'IN', name: 'Indiana' },
    { code: 'MI', name: 'Michigan' },
    { code: 'MN', name: 'Minnesota' },
    { code: 'OK', name: 'Oklahoma' },
    { code: 'LA', name: 'Louisiana' },
    { code: 'MS', name: 'Mississippi' },
];

// Venue type icons
const VENUE_ICONS = {
    casino: '🎰',
    card_room: '🃏',
    poker_club: '♠️',
    home_game: '🏠'
};

function formatMoney(amount) {
    if (!amount) return '-';
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(0)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toLocaleString()}`;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function PokerNearMe() {
    const router = useRouter();

    // State
    const [venues, setVenues] = useState([]);
    const [series, setSeries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedState, setSelectedState] = useState('');
    const [selectedType, setSelectedType] = useState('all');
    const [activeTab, setActiveTab] = useState('venues'); // 'venues' or 'series'
    const [userLocation, setUserLocation] = useState(null);
    const [showStateDropdown, setShowStateDropdown] = useState(false);

    useEffect(() => {
        fetchData();
        // Get user location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => { }
            );
        }
    }, [selectedState, selectedType]);

    const fetchData = async () => {
        setLoading(true);
        await Promise.all([fetchVenues(), fetchSeries()]);
        setLoading(false);
    };

    const fetchVenues = async () => {
        try {
            const params = new URLSearchParams({ limit: '50' });
            if (selectedState) params.set('state', selectedState);
            if (selectedType !== 'all') params.set('type', selectedType);

            const res = await fetch(`/api/poker/venues?${params}`);
            const { data } = await res.json();
            setVenues(data || []);
        } catch (e) {
            setVenues([]);
        }
    };

    const fetchSeries = async () => {
        try {
            const res = await fetch('/api/poker/series?upcoming=true&limit=15');
            const { data } = await res.json();
            setSeries(data || []);
        } catch (e) {
            setSeries([]);
        }
    };

    // Filter venues by search
    const filteredVenues = venues.filter(v =>
        !searchQuery ||
        v.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.city?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredSeries = series.filter(s =>
        !searchQuery ||
        s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.location?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <>
            <Head>
                <title>Poker Near Me | Smarter.Poker</title>
                <meta name="description" content="Find poker casinos, card rooms, and tournament series near you. The most comprehensive poker venue database." />
            </Head>

            <div className="poker-near-me">
                {/* Header */}
                <header className="header">
                    <Link href="/hub">
                        <div className="back-link">
                            <Zap size={20} />
                            <span>Back to Hub</span>
                        </div>
                    </Link>
                    <h1><MapPin size={28} /> Poker Near Me</h1>
                    <p>Find casinos, poker clubs, and tournament series</p>

                    {/* Stats */}
                    <div className="stats-bar">
                        <span><Building2 size={14} /> {venues.length} Venues</span>
                        <span><Trophy size={14} /> {series.length} Series</span>
                    </div>
                </header>

                {/* Main Tabs */}
                <div className="main-tabs">
                    <button
                        className={`main-tab ${activeTab === 'venues' ? 'active' : ''}`}
                        onClick={() => setActiveTab('venues')}
                    >
                        <Building2 size={16} /> Poker Rooms
                    </button>
                    <button
                        className={`main-tab ${activeTab === 'series' ? 'active' : ''}`}
                        onClick={() => setActiveTab('series')}
                    >
                        <Trophy size={16} /> Tournament Series
                    </button>
                </div>

                {/* Controls */}
                <div className="controls">
                    <div className="search-box">
                        <Search size={18} />
                        <input
                            type="text"
                            placeholder={activeTab === 'venues' ? "Search venues, cities..." : "Search series..."}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {activeTab === 'venues' && (
                        <>
                            {/* State Dropdown */}
                            <div className="dropdown-wrap">
                                <button className="dropdown-btn" onClick={() => setShowStateDropdown(!showStateDropdown)}>
                                    {selectedState ? US_STATES.find(s => s.code === selectedState)?.name : 'All States'}
                                    <ChevronDown size={16} />
                                </button>
                                {showStateDropdown && (
                                    <div className="dropdown-menu">
                                        <button onClick={() => { setSelectedState(''); setShowStateDropdown(false); }}>All States</button>
                                        {US_STATES.map(s => (
                                            <button key={s.code} onClick={() => { setSelectedState(s.code); setShowStateDropdown(false); }}>
                                                {s.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Type Filter */}
                            <div className="type-filters">
                                {['all', 'casino', 'card_room', 'poker_club'].map(type => (
                                    <button
                                        key={type}
                                        className={`filter-chip ${selectedType === type ? 'active' : ''}`}
                                        onClick={() => setSelectedType(type)}
                                    >
                                        {type === 'all' ? 'All' :
                                            type === 'casino' ? '🎰 Casinos' :
                                                type === 'card_room' ? '🃏 Card Rooms' : '♠️ Clubs'}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Loading */}
                {loading && (
                    <div className="loading">
                        <Loader className="spinner" size={32} />
                        <span>Loading venues...</span>
                    </div>
                )}

                {/* VENUES VIEW */}
                {!loading && activeTab === 'venues' && (
                    <section className="venues-section">
                        {filteredVenues.length === 0 ? (
                            <div className="no-results">
                                <p>No venues found</p>
                                <button onClick={() => { setSearchQuery(''); setSelectedState(''); setSelectedType('all'); }}>
                                    Clear Filters
                                </button>
                            </div>
                        ) : (
                            <div className="venues-grid">
                                {filteredVenues.map((venue, i) => (
                                    <motion.div
                                        key={venue.id || i}
                                        className={`venue-card ${venue.is_featured ? 'featured' : ''}`}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.03 }}
                                        whileHover={{ y: -4 }}
                                    >
                                        {/* Header */}
                                        <div className="venue-header">
                                            <span className="venue-icon">{VENUE_ICONS[venue.venue_type] || '🎰'}</span>
                                            <div className="venue-title">
                                                <h3>{venue.name}</h3>
                                                <span className="venue-type">{venue.venue_type?.replace('_', ' ')}</span>
                                            </div>
                                            <div className="trust-score">
                                                <Star size={12} fill="#fbbf24" />
                                                <span>{venue.trust_score?.toFixed(1) || '4.0'}</span>
                                            </div>
                                        </div>

                                        {/* Location */}
                                        <div className="venue-location">
                                            <MapPin size={12} />
                                            <span>{venue.city}, {venue.state}</span>
                                        </div>

                                        {/* Games */}
                                        {venue.games_offered?.length > 0 && (
                                            <div className="venue-games">
                                                <Gamepad2 size={12} />
                                                <div className="game-tags">
                                                    {venue.games_offered.slice(0, 4).map(g => (
                                                        <span key={g} className={`game-tag ${g.toLowerCase()}`}>{g}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Stakes */}
                                        {venue.stakes_cash?.length > 0 && (
                                            <div className="venue-stakes">
                                                <CreditCard size={12} />
                                                <span>{venue.stakes_cash.slice(0, 3).join(' • ')}</span>
                                            </div>
                                        )}

                                        {/* Footer */}
                                        <div className="venue-footer">
                                            <span className="tables"><Users size={12} /> {venue.poker_tables || '?'} tables</span>
                                            <div className="venue-actions">
                                                {venue.phone && (
                                                    <a href={`tel:${venue.phone}`} className="action-btn" title="Call">
                                                        <Phone size={14} />
                                                    </a>
                                                )}
                                                {venue.website && (
                                                    <a href={venue.website} target="_blank" rel="noopener noreferrer" className="action-btn" title="Website">
                                                        <Globe size={14} />
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {/* SERIES VIEW */}
                {!loading && activeTab === 'series' && (
                    <section className="series-section">
                        {filteredSeries.length === 0 ? (
                            <div className="no-results">
                                <p>No tournament series found</p>
                            </div>
                        ) : (
                            <div className="series-grid">
                                {filteredSeries.map((s, i) => (
                                    <motion.div
                                        key={s.id || i}
                                        className={`series-card ${s.is_featured ? 'featured' : ''}`}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        whileHover={{ y: -4 }}
                                    >
                                        {s.is_featured && <div className="featured-badge">Featured</div>}
                                        <div className="series-header">
                                            <span className="series-short">{s.short_name}</span>
                                            <h3>{s.name}</h3>
                                        </div>
                                        <div className="series-meta">
                                            <span><MapPin size={12} /> {s.location}</span>
                                            <span><Calendar size={12} /> {formatDate(s.start_date)} - {formatDate(s.end_date)}</span>
                                        </div>
                                        <div className="series-stats">
                                            <div className="stat">
                                                <span>Main Event</span>
                                                <strong>{formatMoney(s.main_event_buyin)}</strong>
                                            </div>
                                            <div className="stat">
                                                <span>GTD</span>
                                                <strong>{formatMoney(s.main_event_guaranteed)}</strong>
                                            </div>
                                            <div className="stat">
                                                <span>Events</span>
                                                <strong>{s.total_events}</strong>
                                            </div>
                                        </div>
                                        {s.website && (
                                            <a href={s.website} target="_blank" rel="noopener noreferrer" className="series-link">
                                                View Schedule <ExternalLink size={12} />
                                            </a>
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {/* Location Notice */}
                {userLocation && (
                    <div className="location-notice">
                        <Navigation size={16} />
                        <span>Location detected</span>
                    </div>
                )}

                <style jsx>{`
                    .poker-near-me {
                        min-height: 100vh;
                        background: linear-gradient(180deg, #0a0a12 0%, #0f1a2e 100%);
                        color: #fff;
                        font-family: 'Inter', -apple-system, sans-serif;
                        padding-bottom: 60px;
                    }

                    .header {
                        padding: 24px;
                        text-align: center;
                        border-bottom: 1px solid rgba(255,255,255,0.06);
                    }

                    .back-link {
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                        color: #00d4ff;
                        font-size: 13px;
                        margin-bottom: 16px;
                        cursor: pointer;
                    }

                    .header h1 {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 12px;
                        font-size: 28px;
                        margin-bottom: 8px;
                    }

                    .header h1 :global(svg) { color: #22c55e; }
                    .header p { color: rgba(255,255,255,0.6); font-size: 14px; margin-bottom: 12px; }

                    .stats-bar {
                        display: flex;
                        justify-content: center;
                        gap: 24px;
                        font-size: 13px;
                        color: rgba(255,255,255,0.5);
                    }
                    .stats-bar span { display: flex; align-items: center; gap: 6px; }

                    /* Main Tabs */
                    .main-tabs {
                        display: flex;
                        justify-content: center;
                        gap: 8px;
                        padding: 16px 24px;
                        background: rgba(0,0,0,0.2);
                    }

                    .main-tab {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 12px 24px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.08);
                        border-radius: 10px;
                        color: rgba(255,255,255,0.6);
                        font-size: 14px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .main-tab:hover { color: #fff; background: rgba(255,255,255,0.1); }
                    .main-tab.active { background: linear-gradient(135deg, #22c55e, #16a34a); color: #fff; border-color: transparent; }

                    /* Controls */
                    .controls {
                        display: flex;
                        flex-wrap: wrap;
                        align-items: center;
                        gap: 12px;
                        padding: 16px 24px;
                        border-bottom: 1px solid rgba(255,255,255,0.06);
                    }

                    .search-box {
                        flex: 1;
                        min-width: 200px;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 10px 14px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.08);
                        border-radius: 10px;
                    }

                    .search-box :global(svg) { color: rgba(255,255,255,0.4); }
                    .search-box input { flex: 1; background: none; border: none; color: #fff; font-size: 14px; outline: none; }

                    .dropdown-wrap { position: relative; }
                    .dropdown-btn {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 10px 14px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.08);
                        border-radius: 8px;
                        color: #fff;
                        font-size: 13px;
                        cursor: pointer;
                    }

                    .dropdown-menu {
                        position: absolute;
                        top: 100%;
                        left: 0;
                        margin-top: 4px;
                        background: #1a1a2e;
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 8px;
                        min-width: 180px;
                        max-height: 300px;
                        overflow-y: auto;
                        z-index: 100;
                    }

                    .dropdown-menu button {
                        display: block;
                        width: 100%;
                        padding: 10px 14px;
                        background: none;
                        border: none;
                        color: rgba(255,255,255,0.8);
                        font-size: 13px;
                        text-align: left;
                        cursor: pointer;
                    }

                    .dropdown-menu button:hover { background: rgba(255,255,255,0.1); }

                    .type-filters { display: flex; gap: 6px; }
                    .filter-chip {
                        padding: 8px 12px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.08);
                        border-radius: 20px;
                        color: rgba(255,255,255,0.6);
                        font-size: 12px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .filter-chip:hover { color: #fff; }
                    .filter-chip.active { background: rgba(0,212,255,0.2); color: #00d4ff; border-color: rgba(0,212,255,0.3); }

                    .loading, .no-results {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 12px;
                        padding: 60px;
                        color: rgba(255,255,255,0.5);
                    }

                    .spinner { animation: spin 1s linear infinite; }
                    @keyframes spin { to { transform: rotate(360deg); } }

                    .no-results button {
                        padding: 10px 20px;
                        background: rgba(255,255,255,0.1);
                        border: none;
                        border-radius: 8px;
                        color: #fff;
                        cursor: pointer;
                    }

                    /* Venues Grid */
                    .venues-section, .series-section { padding: 24px; }

                    .venues-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
                        gap: 16px;
                    }

                    .venue-card {
                        background: rgba(255,255,255,0.03);
                        border: 1px solid rgba(255,255,255,0.06);
                        border-radius: 14px;
                        padding: 16px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .venue-card:hover { border-color: rgba(0,212,255,0.3); }
                    .venue-card.featured { border-color: rgba(34,197,94,0.4); background: rgba(34,197,94,0.05); }

                    .venue-header {
                        display: flex;
                        align-items: flex-start;
                        gap: 12px;
                        margin-bottom: 12px;
                    }

                    .venue-icon { font-size: 24px; }
                    .venue-title { flex: 1; }
                    .venue-title h3 { font-size: 15px; font-weight: 600; margin-bottom: 2px; }
                    .venue-type { font-size: 11px; color: rgba(255,255,255,0.4); text-transform: capitalize; }

                    .trust-score {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        padding: 4px 8px;
                        background: rgba(251,191,36,0.15);
                        border-radius: 6px;
                        font-size: 12px;
                        font-weight: 600;
                        color: #fbbf24;
                    }

                    .venue-location, .venue-games, .venue-stakes {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin-bottom: 8px;
                        font-size: 12px;
                        color: rgba(255,255,255,0.6);
                    }

                    .game-tags { display: flex; flex-wrap: wrap; gap: 4px; }
                    .game-tag {
                        padding: 2px 6px;
                        background: rgba(0,212,255,0.15);
                        border-radius: 4px;
                        font-size: 10px;
                        font-weight: 600;
                        color: #00d4ff;
                    }
                    .game-tag.plo { background: rgba(236,72,153,0.15); color: #ec4899; }
                    .game-tag.mixed { background: rgba(168,85,247,0.15); color: #a855f7; }

                    .venue-footer {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        margin-top: 12px;
                        padding-top: 12px;
                        border-top: 1px solid rgba(255,255,255,0.06);
                    }

                    .tables { font-size: 11px; color: rgba(255,255,255,0.5); display: flex; align-items: center; gap: 4px; }

                    .venue-actions { display: flex; gap: 6px; }
                    .action-btn {
                        width: 32px;
                        height: 32px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 8px;
                        color: rgba(255,255,255,0.6);
                        transition: all 0.2s;
                    }

                    .action-btn:hover { background: rgba(0,212,255,0.2); color: #00d4ff; }

                    /* Series Grid */
                    .series-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
                        gap: 16px;
                    }

                    .series-card {
                        position: relative;
                        background: linear-gradient(135deg, rgba(124,58,237,0.1) 0%, rgba(168,85,247,0.05) 100%);
                        border: 1px solid rgba(124,58,237,0.2);
                        border-radius: 14px;
                        padding: 20px;
                    }

                    .series-card.featured { border-color: rgba(251,191,36,0.4); }

                    .featured-badge {
                        position: absolute;
                        top: 12px;
                        right: 12px;
                        padding: 4px 10px;
                        background: linear-gradient(135deg, #fbbf24, #d97706);
                        border-radius: 6px;
                        font-size: 10px;
                        font-weight: 700;
                        text-transform: uppercase;
                        color: #000;
                    }

                    .series-header { margin-bottom: 12px; }
                    .series-short {
                        display: inline-block;
                        padding: 4px 8px;
                        background: rgba(124,58,237,0.2);
                        border-radius: 4px;
                        font-size: 11px;
                        font-weight: 700;
                        color: #a855f7;
                        margin-bottom: 8px;
                    }

                    .series-header h3 { font-size: 16px; font-weight: 600; }

                    .series-meta {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 16px;
                        margin-bottom: 16px;
                        font-size: 12px;
                        color: rgba(255,255,255,0.6);
                    }

                    .series-meta span { display: flex; align-items: center; gap: 4px; }

                    .series-stats {
                        display: flex;
                        gap: 12px;
                        margin-bottom: 16px;
                    }

                    .series-stats .stat {
                        flex: 1;
                        padding: 10px;
                        background: rgba(0,0,0,0.2);
                        border-radius: 8px;
                        text-align: center;
                    }

                    .series-stats .stat span { display: block; font-size: 10px; color: rgba(255,255,255,0.5); margin-bottom: 2px; }
                    .series-stats .stat strong { font-size: 14px; color: #22c55e; }

                    .series-link {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        padding: 10px;
                        background: rgba(255,255,255,0.05);
                        border-radius: 8px;
                        color: #00d4ff;
                        font-size: 12px;
                        font-weight: 600;
                        text-decoration: none;
                        transition: background 0.2s;
                    }

                    .series-link:hover { background: rgba(0,212,255,0.1); }

                    .location-notice {
                        position: fixed;
                        bottom: 20px;
                        left: 50%;
                        transform: translateX(-50%);
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 10px 20px;
                        background: rgba(34,197,94,0.9);
                        border-radius: 20px;
                        font-size: 12px;
                        font-weight: 500;
                    }

                    @media (max-width: 600px) {
                        .controls { flex-direction: column; }
                        .type-filters { flex-wrap: wrap; }
                        .venues-grid, .series-grid { grid-template-columns: 1fr; }
                    }
                `}</style>
            </div>
        </>
    );
}

