/**
 * POKER NEAR ME - Event Discovery & Geo-Location
 * Find tournaments, cash games, and events in your area
 */

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    MapPin, Calendar, Clock, DollarSign, Users, Trophy,
    Search, Filter, ChevronRight, Star, Navigation, Loader,
    Zap, ExternalLink
} from 'lucide-react';

// Fallback events data
const FALLBACK_EVENTS = [
    { id: 1, name: "WSOP Main Event", location: "Las Vegas, NV", venue: "Rio All-Suite Hotel", event_date: "2026-06-27", buy_in: 10000, guaranteed: 50000000, game_type: "NLH", format: "Tournament", is_featured: true },
    { id: 2, name: "EPT Barcelona", location: "Barcelona, Spain", venue: "Casino Barcelona", event_date: "2026-08-14", buy_in: 5300, guaranteed: 10000000, game_type: "NLH", format: "Tournament", is_featured: true },
    { id: 3, name: "WPT Championship", location: "Las Vegas, NV", venue: "Wynn Las Vegas", event_date: "2026-12-01", buy_in: 10400, guaranteed: 15000000, game_type: "NLH", format: "Tournament", is_featured: true },
    { id: 4, name: "Bellagio $5/$10 NLH", location: "Las Vegas, NV", venue: "Bellagio", event_date: "2026-01-20", buy_in: 500, guaranteed: null, game_type: "NLH", format: "Cash Game", is_featured: false },
    { id: 5, name: "Aria Daily $240", location: "Las Vegas, NV", venue: "Aria Casino", event_date: "2026-01-21", buy_in: 240, guaranteed: 10000, game_type: "NLH", format: "Tournament", is_featured: false },
    { id: 6, name: "Venetian $600 Deepstack", location: "Las Vegas, NV", venue: "The Venetian", event_date: "2026-01-22", buy_in: 600, guaranteed: 50000, game_type: "NLH", format: "Tournament", is_featured: false },
    { id: 7, name: "Commerce $100 Rebuy", location: "Los Angeles, CA", venue: "Commerce Casino", event_date: "2026-01-23", buy_in: 100, guaranteed: 25000, game_type: "NLH", format: "Tournament", is_featured: false },
    { id: 8, name: "Hustler PLO $2/$5", location: "Los Angeles, CA", venue: "Hustler Casino", event_date: "2026-01-24", buy_in: 200, guaranteed: null, game_type: "PLO", format: "Cash Game", is_featured: false },
];

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatMoney(amount) {
    if (!amount) return '-';
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(0)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toLocaleString()}`;
}

export default function PokerNearMe() {
    const router = useRouter();
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('all');
    const [userLocation, setUserLocation] = useState(null);

    useEffect(() => {
        fetchEvents();
        // Try to get user location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => setUserLocation(null)
            );
        }
    }, []);

    const fetchEvents = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/news/events?limit=20');
            const { success, data } = await res.json();
            setEvents(success && data?.length ? data : FALLBACK_EVENTS);
        } catch (e) {
            setEvents(FALLBACK_EVENTS);
        }
        setLoading(false);
    };

    const filteredEvents = events.filter(event => {
        const matchesSearch = !searchQuery ||
            event.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            event.location?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = activeFilter === 'all' ||
            (activeFilter === 'tournament' && event.format === 'Tournament') ||
            (activeFilter === 'cash' && event.format === 'Cash Game') ||
            (activeFilter === 'featured' && event.is_featured);
        return matchesSearch && matchesFilter;
    });

    const featuredEvents = events.filter(e => e.is_featured).slice(0, 3);

    return (
        <>
            <Head>
                <title>Poker Near Me | Smarter.Poker</title>
                <meta name="description" content="Find poker tournaments, cash games, and events near you. Discover the best poker rooms and upcoming events in your area." />
            </Head>

            <div className="poker-near-me">
                {/* Header */}
                <header className="header">
                    <Link href="/hub/news">
                        <div className="back-link">
                            <Zap size={20} />
                            <span>Back to News</span>
                        </div>
                    </Link>
                    <h1><MapPin size={28} /> Poker Near Me</h1>
                    <p>Find tournaments, cash games, and events in your area</p>
                </header>

                {/* Search & Filters */}
                <div className="controls">
                    <div className="search-box">
                        <Search size={18} />
                        <input
                            type="text"
                            placeholder="Search events, locations..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="filters">
                        {['all', 'tournament', 'cash', 'featured'].map(filter => (
                            <button
                                key={filter}
                                className={`filter-btn ${activeFilter === filter ? 'active' : ''}`}
                                onClick={() => setActiveFilter(filter)}
                            >
                                {filter === 'all' ? 'All Events' :
                                    filter === 'tournament' ? 'Tournaments' :
                                        filter === 'cash' ? 'Cash Games' : 'Featured'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Featured Events */}
                {featuredEvents.length > 0 && activeFilter !== 'cash' && (
                    <section className="featured-section">
                        <h2><Star size={20} /> Featured Events</h2>
                        <div className="featured-grid">
                            {featuredEvents.map(event => (
                                <motion.div
                                    key={event.id}
                                    className="featured-card"
                                    whileHover={{ y: -4 }}
                                >
                                    <div className="event-badge">Featured</div>
                                    <h3>{event.name}</h3>
                                    <div className="event-meta">
                                        <span><MapPin size={14} /> {event.location}</span>
                                        <span><Calendar size={14} /> {formatDate(event.event_date)}</span>
                                    </div>
                                    <div className="event-stats">
                                        <div className="stat">
                                            <DollarSign size={16} />
                                            <span>Buy-in</span>
                                            <strong>{formatMoney(event.buy_in)}</strong>
                                        </div>
                                        {event.guaranteed && (
                                            <div className="stat">
                                                <Trophy size={16} />
                                                <span>GTD</span>
                                                <strong>{formatMoney(event.guaranteed)}</strong>
                                            </div>
                                        )}
                                    </div>
                                    <button className="register-btn">
                                        View Details <ChevronRight size={16} />
                                    </button>
                                </motion.div>
                            ))}
                        </div>
                    </section>
                )}

                {/* All Events List */}
                <section className="events-section">
                    <h2><Calendar size={20} /> Upcoming Events</h2>

                    {loading ? (
                        <div className="loading">
                            <Loader className="spinner" size={32} />
                            <span>Finding events near you...</span>
                        </div>
                    ) : filteredEvents.length === 0 ? (
                        <div className="no-results">
                            <p>No events found matching your criteria</p>
                            <button onClick={() => { setSearchQuery(''); setActiveFilter('all'); }}>
                                Clear Filters
                            </button>
                        </div>
                    ) : (
                        <div className="events-list">
                            {filteredEvents.map((event, i) => (
                                <motion.div
                                    key={event.id}
                                    className="event-row"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.03 }}
                                >
                                    <div className="event-date">
                                        <span className="day">{new Date(event.event_date).getDate()}</span>
                                        <span className="month">{new Date(event.event_date).toLocaleDateString('en-US', { month: 'short' })}</span>
                                    </div>
                                    <div className="event-info">
                                        <h4>{event.name}</h4>
                                        <div className="event-details">
                                            <span><MapPin size={12} /> {event.venue || event.location}</span>
                                            <span className={`game-type ${event.game_type?.toLowerCase()}`}>{event.game_type}</span>
                                            <span className={`format ${event.format?.toLowerCase().replace(' ', '-')}`}>{event.format}</span>
                                        </div>
                                    </div>
                                    <div className="event-buyin">
                                        <span className="label">Buy-in</span>
                                        <strong>{formatMoney(event.buy_in)}</strong>
                                    </div>
                                    {event.guaranteed && (
                                        <div className="event-gtd">
                                            <span className="label">GTD</span>
                                            <strong>{formatMoney(event.guaranteed)}</strong>
                                        </div>
                                    )}
                                    <button className="view-btn">
                                        <ExternalLink size={16} />
                                    </button>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Location Notice */}
                {userLocation && (
                    <div className="location-notice">
                        <Navigation size={16} />
                        <span>Showing events based on your location</span>
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

                    .header p {
                        color: rgba(255,255,255,0.6);
                        font-size: 14px;
                    }

                    .controls {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 16px;
                        padding: 20px 24px;
                        border-bottom: 1px solid rgba(255,255,255,0.06);
                    }

                    .search-box {
                        flex: 1;
                        min-width: 200px;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 12px 16px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.08);
                        border-radius: 10px;
                    }

                    .search-box :global(svg) { color: rgba(255,255,255,0.4); }

                    .search-box input {
                        flex: 1;
                        background: none;
                        border: none;
                        color: #fff;
                        font-size: 14px;
                        outline: none;
                    }

                    .filters {
                        display: flex;
                        gap: 8px;
                    }

                    .filter-btn {
                        padding: 10px 16px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.08);
                        border-radius: 8px;
                        color: rgba(255,255,255,0.6);
                        font-size: 12px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .filter-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }
                    .filter-btn.active { background: linear-gradient(135deg, #22c55e, #16a34a); color: #fff; border-color: transparent; }

                    .featured-section, .events-section {
                        padding: 24px;
                    }

                    h2 {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        font-size: 18px;
                        margin-bottom: 20px;
                    }

                    h2 :global(svg) { color: #fbbf24; }
                    .events-section h2 :global(svg) { color: #00d4ff; }

                    .featured-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                        gap: 16px;
                    }

                    .featured-card {
                        position: relative;
                        background: linear-gradient(135deg, rgba(34,197,94,0.1) 0%, rgba(22,163,74,0.05) 100%);
                        border: 1px solid rgba(34,197,94,0.2);
                        border-radius: 14px;
                        padding: 20px;
                        cursor: pointer;
                    }

                    .event-badge {
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

                    .featured-card h3 {
                        font-size: 16px;
                        font-weight: 600;
                        margin-bottom: 12px;
                        padding-right: 60px;
                    }

                    .event-meta {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 12px;
                        margin-bottom: 16px;
                        font-size: 12px;
                        color: rgba(255,255,255,0.6);
                    }

                    .event-meta span { display: flex; align-items: center; gap: 4px; }

                    .event-stats {
                        display: flex;
                        gap: 16px;
                        margin-bottom: 16px;
                    }

                    .stat {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 4px;
                        padding: 12px 16px;
                        background: rgba(0,0,0,0.2);
                        border-radius: 8px;
                    }

                    .stat :global(svg) { color: #22c55e; }
                    .stat span { font-size: 10px; color: rgba(255,255,255,0.5); }
                    .stat strong { font-size: 16px; }

                    .register-btn {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        width: 100%;
                        padding: 12px;
                        background: linear-gradient(135deg, #22c55e, #16a34a);
                        border: none;
                        border-radius: 8px;
                        color: #fff;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: transform 0.2s;
                    }

                    .register-btn:hover { transform: translateY(-2px); }

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

                    .events-list {
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }

                    .event-row {
                        display: flex;
                        align-items: center;
                        gap: 16px;
                        padding: 16px;
                        background: rgba(255,255,255,0.03);
                        border: 1px solid rgba(255,255,255,0.06);
                        border-radius: 12px;
                        transition: all 0.2s;
                    }

                    .event-row:hover {
                        background: rgba(255,255,255,0.05);
                        border-color: rgba(0,212,255,0.2);
                    }

                    .event-date {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        min-width: 50px;
                        padding: 8px;
                        background: rgba(0,212,255,0.1);
                        border-radius: 8px;
                    }

                    .event-date .day { font-size: 20px; font-weight: 700; color: #00d4ff; }
                    .event-date .month { font-size: 10px; text-transform: uppercase; color: rgba(255,255,255,0.6); }

                    .event-info { flex: 1; }
                    .event-info h4 { font-size: 14px; font-weight: 600; margin-bottom: 6px; }

                    .event-details {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 10px;
                        font-size: 11px;
                        color: rgba(255,255,255,0.5);
                    }

                    .event-details span { display: flex; align-items: center; gap: 4px; }

                    .game-type, .format {
                        padding: 2px 6px;
                        border-radius: 4px;
                        font-weight: 600;
                    }

                    .game-type.nlh { background: rgba(0,212,255,0.15); color: #00d4ff; }
                    .game-type.plo { background: rgba(236,72,153,0.15); color: #ec4899; }
                    .format.tournament { background: rgba(34,197,94,0.15); color: #22c55e; }
                    .format.cash-game { background: rgba(251,191,36,0.15); color: #fbbf24; }

                    .event-buyin, .event-gtd {
                        text-align: center;
                        min-width: 70px;
                    }

                    .label { display: block; font-size: 10px; color: rgba(255,255,255,0.4); margin-bottom: 2px; }
                    .event-buyin strong { color: #fbbf24; }
                    .event-gtd strong { color: #22c55e; }

                    .view-btn {
                        width: 36px;
                        height: 36px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 8px;
                        color: rgba(255,255,255,0.6);
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .view-btn:hover {
                        background: rgba(0,212,255,0.2);
                        color: #00d4ff;
                    }

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
                        .event-row { flex-wrap: wrap; }
                        .event-buyin, .event-gtd { display: none; }
                        .filters { flex-wrap: wrap; }
                    }
                `}</style>
            </div>
        </>
    );
}
