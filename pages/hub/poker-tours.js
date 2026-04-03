/**
 * Poker Tours — Premium Touring Poker Series Directory
 * ═══════════════════════════════════════════════════════
 * Standalone page modeled after Poker Near Me
 * Left sidebar + map + premium tour cards
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';

// ─── Lazy-load components ───
const UniversalHeader = dynamic(() => import('../../src/components/ui/UniversalHeader'), { ssr: false });
const HamburgerMenu = dynamic(() => import('../../src/components/ui/HamburgerMenu'), { ssr: false });
const VenueMap = dynamic(() => import('../../src/components/poker-near-me/VenueMap').then(m => ({ default: m.default })), { ssr: false });
const MapErrorBoundary = dynamic(() => import('../../src/components/poker-near-me/VenueMap').then(m => ({ default: m.MapErrorBoundary })), { ssr: false });

// ─── Menu Config ───
function getMenuConfig() {
    return {
        menuItems: [
            { label: 'Poker Near Me', href: '/hub/poker-near-me', icon: '📍' },
            { label: 'Poker Tours', href: '/hub/poker-tours', icon: '🏆' },
            { label: 'Daily Tournaments', href: '/hub/daily-tournaments', icon: '📅' },
            { label: 'Events Calendar', href: '/hub/events-calendar', icon: '🗓️' },
        ],
        bottomLinks: []
    };
}

// ─── Tour Colors (matching TourCard.js) ───
const TOUR_COLORS = {
    'WSOP': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227', fill: '#c9a227' },
    'WPT': { bg: 'linear-gradient(135deg, #dc2626, #991b1b)', text: '#fff', border: '#dc2626', fill: '#dc2626' },
    'WSOPC': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227', fill: '#c9a227' },
    'MSPT': { bg: 'linear-gradient(135deg, #1e40af, #1e3a8a)', text: '#fff', border: '#3b82f6', fill: '#3b82f6' },
    'RGPS': { bg: 'linear-gradient(135deg, #059669, #047857)', text: '#fff', border: '#10b981', fill: '#10b981' },
    'PGT': { bg: 'linear-gradient(135deg, #7c3aed, #5b21b6)', text: '#fff', border: '#8b5cf6', fill: '#8b5cf6' },
    'TRITON': { bg: 'linear-gradient(135deg, #0891b2, #0e7490)', text: '#fff', border: '#06b6d4', fill: '#06b6d4' },
    'VENETIAN': { bg: 'linear-gradient(135deg, #b91c1c, #7f1d1d)', text: '#fff', border: '#ef4444', fill: '#ef4444' },
    'WYNN': { bg: 'linear-gradient(135deg, #a16207, #713f12)', text: '#fff', border: '#eab308', fill: '#eab308' },
    'BORGATA': { bg: 'linear-gradient(135deg, #7c3aed, #4c1d95)', text: '#fff', border: '#a78bfa', fill: '#a78bfa' },
    'SEMINOLE': { bg: 'linear-gradient(135deg, #ca8a04, #854d0e)', text: '#000', border: '#facc15', fill: '#facc15' },
    'LODGE': { bg: 'linear-gradient(135deg, #166534, #14532d)', text: '#fff', border: '#22c55e', fill: '#22c55e' },
    'default': { bg: 'linear-gradient(135deg, #374151, #1f2937)', text: '#fff', border: '#4b5563', fill: '#6b7280' }
};

const TOUR_TYPE_INFO = {
    major: { label: 'Major Tour', color: '#c9a227', icon: '🏆' },
    circuit: { label: 'Circuit', color: '#3b82f6', icon: '🔄' },
    high_roller: { label: 'High Roller', color: '#8b5cf6', icon: '💎' },
    regional: { label: 'Regional', color: '#10b981', icon: '📍' },
    grassroots: { label: 'Grassroots', color: '#f59e0b', icon: '🌱' },
    charity: { label: 'Charity', color: '#ec4899', icon: '❤️' },
    cruise: { label: 'Cruise', color: '#06b6d4', icon: '🚢' },
};

function formatMoney(amount) {
    if (amount === null || amount === undefined || amount === '') return '';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num)) return '';
    if (num >= 1000000) return '$' + (num / 1000000).toFixed(0) + 'M';
    if (num >= 1000) return '$' + (num / 1000).toFixed(0) + 'K';
    return '$' + num.toLocaleString();
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ═══════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════
export default function PokerToursPage() {
    const router = useRouter();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuConfig = useMemo(() => getMenuConfig(), []);

    // ─── Data State ───
    const [tours, setTours] = useState([]);
    const [loading, setLoading] = useState(true);
    const [allVenues, setAllVenues] = useState([]);

    // ─── Filter State ───
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedType, setSelectedType] = useState('all');
    const [selectedRegion, setSelectedRegion] = useState('all');
    const [sortBy, setSortBy] = useState('priority');
    const [favorites, setFavorites] = useState({});

    // ─── Fetch tours data ───
    useEffect(() => {
        setLoading(true);
        fetch('/api/poker/tours?include_series=true&limit=100')
            .then(r => r.json())
            .then(json => {
                const tourData = json.data || json.tours || [];
                // ONLY traveling tours - exclude stationary casino series
                setTours(tourData.filter(t => t.tour_type !== 'regional'));
            })
            .catch(() => setTours([]))
            .finally(() => setLoading(false));
    }, []);

    // ─── Fetch all venues for map (only venues that host tours) ───
    useEffect(() => {
        fetch('/data/all-venues.json')
            .then(r => r.json())
            .then(json => {
                const v = json.venues || json.data || json || [];
                setAllVenues(Array.isArray(v) ? v : []);
            })
            .catch(() => setAllVenues([]));
    }, []);

    // ─── Build map venues from tour stops ───
    const tourVenuesForMap = useMemo(() => {
        if (allVenues.length === 0) return allVenues; // Show all venues as context
        // If we have tour data with stops, we could filter — for now show all
        return allVenues.filter(v => v.latitude && v.longitude);
    }, [allVenues]);

    // ─── Get unique regions and types ───
    const availableTypes = useMemo(() => {
        const types = new Set();
        tours.forEach(t => { if (t.tour_type) types.add(t.tour_type); });
        return Array.from(types).sort();
    }, [tours]);

    const availableRegions = useMemo(() => {
        const regions = new Set();
        tours.forEach(t => {
            (t.regions || []).forEach(r => regions.add(r));
        });
        return Array.from(regions).sort();
    }, [tours]);

    // ─── Filtered & sorted tours ───
    const filteredTours = useMemo(() => {
        let result = [...tours];

        // Filter by type
        if (selectedType !== 'all') {
            result = result.filter(t => t.tour_type === selectedType);
        }

        // Filter by region
        if (selectedRegion !== 'all') {
            result = result.filter(t =>
                (t.regions || []).some(r =>
                    r.toLowerCase().includes(selectedRegion.toLowerCase())
                )
            );
        }

        // Search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            result = result.filter(t =>
                (t.tour_name || '').toLowerCase().includes(q) ||
                (t.tour_code || '').toLowerCase().includes(q) ||
                (t.headquarters || '').toLowerCase().includes(q)
            );
        }

        // Sort
        switch (sortBy) {
            case 'priority': result.sort((a, b) => (a.priority || 99) - (b.priority || 99)); break;
            case 'date': 
                result.sort((a, b) => {
                    const today = new Date().toISOString().split('T')[0];
                    const getNextDate = (t) => {
                        if (!t.upcoming_series || t.upcoming_series.length === 0) return '9999-12-31';
                        const upcoming = t.upcoming_series.filter(s => s.end_date >= today || s.start_date >= today);
                        if (upcoming.length === 0) return '9999-12-31';
                        return upcoming[0].start_date;
                    };
                    return getNextDate(a).localeCompare(getNextDate(b));
                }); 
                break;
            case 'name': result.sort((a, b) => (a.tour_name || '').localeCompare(b.tour_name || '')); break;
            case 'type': result.sort((a, b) => (a.tour_type || '').localeCompare(b.tour_type || '')); break;
            case 'series': result.sort((a, b) => (b.upcoming_series?.length || 0) - (a.upcoming_series?.length || 0)); break;
            default: break;
        }

        return result;
    }, [tours, selectedType, selectedRegion, searchQuery, sortBy]);

    // ─── Favorites toggle ───
    const toggleFavorite = useCallback((tourCode, e) => {
        if (e) { e.stopPropagation(); e.preventDefault(); }
        setFavorites(prev => {
            const next = { ...prev };
            if (next[tourCode]) delete next[tourCode];
            else next[tourCode] = Date.now();
            return next;
        });
    }, []);

    // ─── Navigate to tour detail ───
    const handleTourClick = useCallback((tour) => {
        if (tour.tour_code) {
            router.push('/hub/tours/' + tour.tour_code);
        }
    }, [router]);

    return (
        <>
            <Head>
                <title>Poker Tours — Traveling Poker Series & Circuits | Smarter.Poker</title>
                <meta name="description" content="Browse all major poker tours including WSOP, WPT, MSPT, RGPS and more. Find upcoming series, tour stops, and schedules." />
            </Head>

            <div className="pnm-page">
                {/* Space Background */}
                <div className="space-bg" />
                <div className="space-overlay" />

                {/* Header */}
                <UniversalHeader pageDepth={2} />

                {/* Hamburger Menu */}
                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="left"
                    theme="dark"
                    user={null}
                    showProfile={false}
                    menuItems={menuConfig.menuItems}
                    bottomLinks={menuConfig.bottomLinks}
                />

                {/* ═══ PAGE TITLE ═══ */}
                <div className="pnm-title-bar">
                    <h1 className="pnm-title">POKER TOURS</h1>
                    <p className="pnm-subtitle">{tours.length} Tours &bull; {availableTypes.length} Types &bull; 2026 Season</p>
                </div>

                {/* ═══ SIDEBAR + MAIN LAYOUT ═══ */}
                <div className="pnm-layout">

                    {/* ─── LEFT SIDEBAR ─── */}
                    <aside className="pnm-sidebar" role="navigation" aria-label="Poker Tours navigation">
                        <nav className="sidebar-nav">
                            {[
                                { key: 'all', label: 'All Tours', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg> },
                                { key: 'major', label: 'Major', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 19.24 7 20v2M17 20c0-.76-.85-1.25-2.03-1.79C14.47 17.98 14 17.55 14 17v-2.34M12 2l3 7H9l3-7z" /></svg> },
                                { key: 'circuit', label: 'Circuit', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg> },
                                { key: 'high_roller', label: 'High Roller', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg> },
                                { key: 'grassroots', label: 'Grassroots', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" /></svg> },
                            ].map(tab => (
                                <button
                                    key={tab.key}
                                    className={'sidebar-tab' + (selectedType === tab.key || (selectedType === 'all' && tab.key === 'all') ? ' active' : '')}
                                    onClick={() => setSelectedType(tab.key === 'all' ? 'all' : tab.key)}
                                    role="tab"
                                    aria-selected={selectedType === tab.key}
                                    aria-label={tab.label + ' tab'}
                                >
                                    <span className="sidebar-tab-icon">{tab.icon}</span>
                                    <span className="sidebar-tab-label">{tab.label}</span>
                                    {tab.key !== 'all' && (
                                        <span className="sidebar-tab-count">
                                            {tours.filter(t => t.tour_type === tab.key).length}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </nav>

                        {/* ─── FILTERS ─── */}
                        <div className="sidebar-filters">
                            {/* Search */}
                            <form className="sidebar-search-form" onSubmit={e => e.preventDefault()}>
                                <svg className="sidebar-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                                <input
                                    type="text"
                                    className="sidebar-search-input"
                                    placeholder="Search Tours..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    autoComplete="off"
                                />
                            </form>

                            {/* Region Filter */}
                            <div className="sidebar-filter-group">
                                <label>Region</label>
                                <select
                                    className="sidebar-select"
                                    value={selectedRegion}
                                    onChange={e => setSelectedRegion(e.target.value)}
                                >
                                    <option value="all">All Regions</option>
                                    {availableRegions.map(r => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Sort */}
                            <div className="sidebar-filter-group">
                                <label>Sort By</label>
                                <select
                                    className="sidebar-select"
                                    value={sortBy}
                                    onChange={e => setSortBy(e.target.value)}
                                >
                                    <option value="priority">Priority</option>
                                    <option value="date">Next Upcoming Date</option>
                                    <option value="name">Name A-Z</option>
                                    <option value="type">Tour Type</option>
                                    <option value="series">Upcoming Series</option>
                                </select>
                            </div>
                        </div>
                    </aside>

                    {/* ─── MAIN CONTENT ─── */}
                    <main className="pnm-main">

                        {/* ═══ MAP ═══ */}
                        <div className="tours-map-container">
                            {typeof window !== 'undefined' && (
                                <MapErrorBoundary>
                                    <VenueMap
                                        venues={tourVenuesForMap}
                                        userLocation={null}
                                        hideLegend={false}
                                    />
                                </MapErrorBoundary>
                            )}
                        </div>

                        {/* ═══ RESULTS BAR ═══ */}
                        <div className="tours-results-bar">
                            <div className="tours-results-count">
                                <strong>{filteredTours.length}</strong> {filteredTours.length === 1 ? 'Tour' : 'Tours'} Found
                            </div>
                            <div className="tours-results-sort">
                                <span>Sort:</span>
                                <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                                    <option value="priority">Priority</option>
                                    <option value="date">Next Upcoming Date</option>
                                    <option value="name">Name A-Z</option>
                                    <option value="type">Tour Type</option>
                                    <option value="series">Upcoming Series</option>
                                </select>
                            </div>
                        </div>

                        {/* ═══ TOUR CARDS GRID ═══ */}
                        {loading ? (
                            <div className="tours-loading">
                                <div className="tours-spinner" />
                                <span>Loading Tours...</span>
                            </div>
                        ) : filteredTours.length === 0 ? (
                            <div className="tours-empty">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3 }}>
                                    <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                                </svg>
                                <h3>No Matching Tours</h3>
                                <p>Try adjusting your filters or search query.</p>
                            </div>
                        ) : (
                            <div className="tours-grid">
                                {filteredTours.map(tour => {
                                    const colors = TOUR_COLORS[tour.tour_code] || TOUR_COLORS.default;
                                    const typeInfo = TOUR_TYPE_INFO[tour.tour_type] || { label: tour.tour_type || 'Tour', color: '#6b7280' };
                                    const isFav = !!favorites[tour.tour_code];
                                    const buyinMin = tour.typical_buyins?.min;
                                    const buyinMax = tour.typical_buyins?.max;
                                    const hasBuyins = buyinMin || buyinMax;
                                    const series = tour.upcoming_series || [];
                                    const regions = tour.regions || [];

                                    return (
                                        <div
                                            key={tour.tour_code || tour.tour_name}
                                            className="tour-card-premium"
                                            onClick={() => handleTourClick(tour)}
                                        >
                                            {/* Favorite Button */}
                                            <button
                                                className={'tour-fav-btn' + (isFav ? ' active' : '')}
                                                onClick={e => toggleFavorite(tour.tour_code, e)}
                                                aria-label="Favorite tour"
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill={isFav ? '#ef4444' : 'none'} stroke={isFav ? '#ef4444' : 'rgba(255,255,255,0.4)'} strokeWidth="2">
                                                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                                                </svg>
                                            </button>

                                            {/* Card Header — Badge + Type */}
                                            <div className="tour-card-header">
                                                <div
                                                    className="tour-code-badge"
                                                    style={{ background: colors.bg, border: '1px solid ' + colors.border }}
                                                >
                                                    <span style={{ color: colors.text, fontSize: 14, fontWeight: 800, letterSpacing: '0.5px' }}>
                                                        {tour.tour_code || 'TOUR'}
                                                    </span>
                                                </div>
                                                <span
                                                    className="tour-type-pill"
                                                    style={{ color: typeInfo.color, borderColor: typeInfo.color + '40', background: typeInfo.color + '15' }}
                                                >
                                                    {typeInfo.label}
                                                </span>
                                            </div>

                                            {/* Tour Name */}
                                            <h4 className="tour-card-name">{tour.tour_name || 'Unknown Tour'}</h4>

                                            {/* Location */}
                                            {tour.headquarters && (
                                                <p className="tour-card-location">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                                                    </svg>
                                                    {tour.headquarters}
                                                </p>
                                            )}

                                            {/* Buy-in Range */}
                                            {hasBuyins && (
                                                <div className="tour-card-buyins">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                                                        <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                                                    </svg>
                                                    <span>
                                                        Buy-ins: {formatMoney(buyinMin)}{buyinMin && buyinMax ? ' – ' : ''}{formatMoney(buyinMax)}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Regions */}
                                            {regions.length > 0 && (
                                                <div className="tour-card-tags">
                                                    {regions.slice(0, 5).map(r => (
                                                        <span key={r} className="tour-region-tag">{r}</span>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Upcoming Series */}
                                            {series.length > 0 && (
                                                <div className="tour-card-series">
                                                    <div className="tour-series-header">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                                                        </svg>
                                                        Upcoming Series ({series.length})
                                                    </div>
                                                    {series.slice(0, 3).map((s, i) => (
                                                        <div key={i} className="tour-series-item">
                                                            <span className="tour-series-name">{s.short_name || s.name || 'TBD'}</span>
                                                            <span className="tour-series-dates">
                                                                {formatDate(s.start_date)}{s.end_date ? ' – ' + formatDate(s.end_date) : ''}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Card Footer */}
                                            <div className="tour-card-footer">
                                                {tour.established && (
                                                    <span className="tour-card-established">Est. {tour.established}</span>
                                                )}
                                                <div className="tour-card-actions">
                                                    <span className="tour-action-btn primary">Details</span>
                                                    {(tour.official_website) && (
                                                        <a
                                                            href={tour.official_website.startsWith('http') ? tour.official_website : 'https://' + tour.official_website}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="tour-action-btn"
                                                            onClick={e => e.stopPropagation()}
                                                        >
                                                            Website
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </main>
                </div>

                {/* ═══════════════════════════════════════ */}
                {/* STYLES — Reuses PNM architecture       */}
                {/* ═══════════════════════════════════════ */}
                <style jsx global>{`
                    .pnm-page {
                        min-height: 100vh;
                        padding-bottom: 70px;
                        display: flex;
                        flex-direction: column;
                        position: relative;
                        color: #fff;
                        font-family: 'Inter', -apple-system, sans-serif;
                        overflow-x: hidden;
                    }

                    /* ═══ PAGE TITLE BAR ═══ */
                    .pnm-title-bar {
                        text-align: center;
                        padding: clamp(12px, 2vh, 28px) 20px clamp(8px, 1.5vh, 18px);
                        position: relative;
                        flex-shrink: 0;
                    }
                    .pnm-title {
                        font-size: clamp(22px, 3.5vw, 36px);
                        font-weight: 900;
                        letter-spacing: clamp(1.5px, 0.3vw, 3px);
                        margin: 0;
                        background: linear-gradient(135deg, #d4a853 0%, #f5d799 40%, #d4a853 60%, #b8860b 100%);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        background-clip: text;
                        text-shadow: none;
                        filter: drop-shadow(0 0 20px rgba(212,168,83,0.3));
                    }
                    .pnm-subtitle {
                        margin: clamp(3px, 0.5vh, 6px) 0 0;
                        font-size: clamp(11px, 1.2vw, 14px);
                        color: rgba(148,163,184,0.6);
                        letter-spacing: 1px;
                        font-weight: 500;
                    }

                    /* ═══ SIDEBAR + MAIN LAYOUT ═══ */
                    .pnm-layout {
                        display: flex;
                        width: 100%;
                        max-width: 1600px;
                        margin: 0 auto;
                        min-height: calc(100vh - 160px);
                        gap: 0;
                    }

                    /* ═══ LEFT SIDEBAR ═══ */
                    .pnm-sidebar {
                        width: clamp(130px, 12vw, 175px);
                        min-width: clamp(130px, 12vw, 175px);
                        flex-shrink: 0;
                        background: linear-gradient(180deg, rgba(12,20,35,0.97) 0%, rgba(8,14,26,0.99) 100%);
                        border-right: 2px solid rgba(148,163,184,0.12);
                        padding: 6px 0;
                        position: sticky;
                        top: 64px;
                        height: calc(100vh - 64px);
                        overflow-y: auto;
                        overflow-x: hidden;
                        z-index: 50;
                        box-shadow: 4px 0 24px rgba(0,0,0,0.3);
                        scrollbar-width: thin;
                        scrollbar-color: rgba(212,168,83,0.3) transparent;
                    }
                    .pnm-sidebar::-webkit-scrollbar { width: 4px; }
                    .pnm-sidebar::-webkit-scrollbar-thumb { background: rgba(212,168,83,0.25); border-radius: 2px; }

                    .sidebar-nav {
                        display: flex;
                        flex-direction: column;
                        gap: 1px;
                        padding: 0 6px;
                        margin-bottom: 10px;
                    }

                    .sidebar-tab {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        width: 100%;
                        padding: 7px 8px;
                        border-radius: 6px;
                        background: transparent;
                        border: 1.5px solid transparent;
                        cursor: pointer;
                        transition: all 0.2s;
                        color: rgba(148,163,184,0.65);
                        position: relative;
                        text-align: left;
                    }
                    .sidebar-tab:hover {
                        background: rgba(148,163,184,0.06);
                        color: rgba(200,214,229,0.85);
                    }
                    .sidebar-tab.active {
                        background: linear-gradient(135deg, rgba(212,168,83,0.12) 0%, rgba(184,134,11,0.06) 100%);
                        border-color: rgba(212,168,83,0.3);
                        color: #d4a853;
                        box-shadow: inset 0 0 12px rgba(212,168,83,0.06), 0 0 8px rgba(212,168,83,0.08);
                    }
                    .sidebar-tab.active::before {
                        content: '';
                        position: absolute;
                        left: 0;
                        top: 6px;
                        bottom: 6px;
                        width: 3px;
                        background: #d4a853;
                        border-radius: 0 3px 3px 0;
                        box-shadow: 0 0 8px rgba(212,168,83,0.4);
                    }
                    .sidebar-tab-icon {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 24px;
                        height: 24px;
                        flex-shrink: 0;
                    }
                    .sidebar-tab-label {
                        font-size: 12px;
                        font-weight: 600;
                        white-space: nowrap;
                    }
                    .sidebar-tab-count {
                        margin-left: auto;
                        font-size: 11px;
                        font-weight: 700;
                        color: rgba(148,163,184,0.4);
                        min-width: 18px;
                        text-align: center;
                    }
                    .sidebar-tab.active .sidebar-tab-count { color: rgba(212,168,83,0.6); }

                    /* ═══ SIDEBAR FILTERS ═══ */
                    .sidebar-filters {
                        padding: 0 8px;
                        border-top: 1px solid rgba(148,163,184,0.08);
                        margin-top: 6px;
                        padding-top: 8px;
                    }
                    .sidebar-search-form {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin-bottom: 10px;
                        background: rgba(0,0,0,0.35);
                        border: 1.5px solid rgba(148,163,184,0.15);
                        border-radius: 8px;
                        padding: 0 10px;
                        transition: border-color 0.2s;
                    }
                    .sidebar-search-form:focus-within { border-color: rgba(212,168,83,0.4); }
                    .sidebar-search-icon {
                        flex-shrink: 0;
                        color: rgba(148,163,184,0.45);
                        transition: color 0.2s;
                    }
                    .sidebar-search-form:focus-within .sidebar-search-icon { color: rgba(212,168,83,0.7); }
                    .sidebar-search-input {
                        flex: 1;
                        padding: 8px 0;
                        background: transparent;
                        border: none;
                        color: #e2e8f0;
                        font-size: 13px;
                        font-family: inherit;
                        outline: none;
                        min-width: 0;
                    }
                    .sidebar-search-input::placeholder { color: rgba(148,163,184,0.35); }
                    .sidebar-filter-group { margin-bottom: 10px; }
                    .sidebar-filter-group label {
                        display: block;
                        font-size: 11px;
                        font-weight: 700;
                        color: rgba(255,255,255,0.5);
                        margin-bottom: 4px;
                        padding: 0 2px;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .sidebar-select {
                        width: 100%;
                        padding: 7px 8px;
                        background: rgba(0,0,0,0.35);
                        border: 1.5px solid rgba(148,163,184,0.15);
                        border-radius: 6px;
                        color: #e2e8f0;
                        font-size: 12px;
                        font-family: inherit;
                        cursor: pointer;
                        appearance: auto;
                    }
                    .sidebar-select:focus { border-color: rgba(212,168,83,0.4); outline: none; }

                    /* ═══ MAIN CONTENT ═══ */
                    .pnm-main {
                        flex: 1;
                        min-width: 0;
                        padding: 0 clamp(10px, 1.5vw, 20px) 20px;
                    }

                    /* ═══ MAP CONTAINER ═══ */
                    .tours-map-container {
                        margin-bottom: 16px;
                        border-radius: 12px;
                        overflow: hidden;
                    }

                    /* ═══ RESULTS BAR ═══ */
                    .tours-results-bar {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        flex-wrap: wrap;
                        gap: 12px;
                        padding: 12px 16px;
                        margin-bottom: 16px;
                        background: linear-gradient(90deg, rgba(12,20,35,0.9) 0%, rgba(8,14,26,0.9) 100%);
                        border: 1px solid rgba(148,163,184,0.1);
                        border-radius: 10px;
                    }
                    .tours-results-count {
                        font-size: 14px;
                        color: rgba(148,163,184,0.7);
                    }
                    .tours-results-count strong {
                        color: #d4a853;
                        font-weight: 800;
                    }
                    .tours-results-sort {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 13px;
                        color: rgba(148,163,184,0.5);
                    }
                    .tours-results-sort select {
                        padding: 6px 10px;
                        background: rgba(0,0,0,0.35);
                        border: 1px solid rgba(148,163,184,0.15);
                        border-radius: 6px;
                        color: #d4a853;
                        font-size: 12px;
                        font-weight: 600;
                        font-family: inherit;
                        cursor: pointer;
                    }

                    /* ═══ TOUR CARDS GRID ═══ */
                    .tours-grid {
                        display: grid;
                        grid-template-columns: repeat(2, 1fr);
                        gap: 16px;
                    }

                    /* ═══ PREMIUM TOUR CARD ═══ */
                    .tour-card-premium {
                        position: relative;
                        background: linear-gradient(145deg, rgba(15,23,42,0.95) 0%, rgba(10,15,28,0.98) 100%);
                        border: 1.5px solid rgba(148,163,184,0.12);
                        border-radius: 14px;
                        padding: 18px 20px 14px;
                        cursor: pointer;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        box-shadow:
                            0 2px 12px rgba(0,0,0,0.3),
                            inset 0 1px 0 rgba(255,255,255,0.04);
                        overflow: hidden;
                    }
                    .tour-card-premium::before {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        height: 3px;
                        background: linear-gradient(90deg, transparent, rgba(212,168,83,0.3), transparent);
                        opacity: 0;
                        transition: opacity 0.3s;
                    }
                    .tour-card-premium:hover {
                        border-color: rgba(212,168,83,0.25);
                        transform: translateY(-2px);
                        box-shadow:
                            0 8px 32px rgba(0,0,0,0.4),
                            0 0 0 1px rgba(212,168,83,0.08),
                            inset 0 1px 0 rgba(255,255,255,0.06);
                    }
                    .tour-card-premium:hover::before { opacity: 1; }

                    /* Card Header */
                    .tour-card-header {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        margin-bottom: 12px;
                    }
                    .tour-code-badge {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        padding: 6px 14px;
                        border-radius: 6px;
                        min-width: 60px;
                    }
                    .tour-type-pill {
                        font-size: 11px;
                        font-weight: 600;
                        padding: 3px 10px;
                        border-radius: 20px;
                        border: 1px solid;
                        letter-spacing: 0.3px;
                    }

                    /* Card Name */
                    .tour-card-name {
                        font-size: 17px;
                        font-weight: 700;
                        color: #fff;
                        margin: 0 0 8px;
                        line-height: 1.3;
                    }

                    /* Card Location */
                    .tour-card-location {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        font-size: 12px;
                        color: rgba(148,163,184,0.6);
                        margin: 0 0 8px;
                    }

                    /* Buy-ins */
                    .tour-card-buyins {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        font-size: 12px;
                        color: rgba(212,168,83,0.85);
                        font-weight: 600;
                        margin-bottom: 10px;
                    }

                    /* Region Tags */
                    .tour-card-tags {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 6px;
                        margin-bottom: 10px;
                    }
                    .tour-region-tag {
                        padding: 3px 10px;
                        border-radius: 6px;
                        background: rgba(59,130,246,0.1);
                        border: 1px solid rgba(59,130,246,0.2);
                        color: rgba(59,130,246,0.8);
                        font-size: 11px;
                        font-weight: 600;
                    }

                    /* Upcoming Series */
                    .tour-card-series {
                        margin-bottom: 12px;
                        padding: 10px 12px;
                        background: rgba(0,0,0,0.2);
                        border: 1px solid rgba(148,163,184,0.06);
                        border-radius: 8px;
                    }
                    .tour-series-header {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        font-size: 11px;
                        font-weight: 700;
                        color: rgba(148,163,184,0.5);
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        margin-bottom: 8px;
                    }
                    .tour-series-item {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 4px 0;
                        border-top: 1px solid rgba(148,163,184,0.06);
                    }
                    .tour-series-item:first-of-type { border-top: none; }
                    .tour-series-name {
                        font-size: 12px;
                        color: rgba(255,255,255,0.8);
                        font-weight: 500;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        max-width: 60%;
                    }
                    .tour-series-dates {
                        font-size: 11px;
                        color: rgba(34,197,94,0.7);
                        font-weight: 600;
                        white-space: nowrap;
                    }

                    /* Card Footer */
                    .tour-card-footer {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        margin-top: auto;
                        padding-top: 12px;
                        border-top: 1px solid rgba(148,163,184,0.08);
                    }
                    .tour-card-established {
                        font-size: 11px;
                        color: rgba(148,163,184,0.4);
                        font-weight: 500;
                    }
                    .tour-card-actions {
                        display: flex;
                        gap: 8px;
                        margin-left: auto;
                    }
                    .tour-action-btn {
                        padding: 6px 14px;
                        border-radius: 6px;
                        font-size: 12px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                        text-decoration: none;
                        background: rgba(255,255,255,0.06);
                        border: 1px solid rgba(148,163,184,0.12);
                        color: rgba(255,255,255,0.7);
                    }
                    .tour-action-btn:hover {
                        background: rgba(255,255,255,0.1);
                        border-color: rgba(148,163,184,0.25);
                        color: #fff;
                    }
                    .tour-action-btn.primary {
                        background: linear-gradient(135deg, #d4a853, #b8860b);
                        border: none;
                        color: #000;
                        font-weight: 700;
                        letter-spacing: 0.3px;
                    }
                    .tour-action-btn.primary:hover {
                        box-shadow: 0 4px 16px rgba(212,168,83,0.3);
                        transform: translateY(-1px);
                    }

                    /* Favorite Button */
                    .tour-fav-btn {
                        position: absolute;
                        top: 12px;
                        right: 12px;
                        background: rgba(0,0,0,0.4);
                        border: 1px solid rgba(255,255,255,0.12);
                        border-radius: 50%;
                        width: 32px;
                        height: 32px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        transition: all 0.2s;
                        z-index: 2;
                    }
                    .tour-fav-btn:hover {
                        background: rgba(239,68,68,0.15);
                        border-color: rgba(239,68,68,0.3);
                    }
                    .tour-fav-btn.active {
                        background: rgba(239,68,68,0.15);
                        border-color: rgba(239,68,68,0.4);
                    }

                    /* Loading & Empty States */
                    .tours-loading {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 16px;
                        padding: 60px 20px;
                        color: rgba(212,168,83,0.6);
                        font-size: 14px;
                        font-weight: 600;
                    }
                    .tours-spinner {
                        width: 40px;
                        height: 40px;
                        border: 3px solid rgba(212,168,83,0.15);
                        border-top-color: #d4a853;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }
                    .tours-empty {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 12px;
                        padding: 60px 20px;
                        text-align: center;
                    }
                    .tours-empty h3 {
                        font-size: 18px;
                        font-weight: 700;
                        color: rgba(255,255,255,0.7);
                        margin: 0;
                    }
                    .tours-empty p {
                        font-size: 13px;
                        color: rgba(148,163,184,0.5);
                        margin: 0;
                    }

                    /* ═══ SPACE BACKGROUND ═══ */
                    .space-bg {
                        position: fixed;
                        inset: 0;
                        background:
                            radial-gradient(ellipse at 20% 20%, rgba(59, 130, 246, 0.12) 0%, transparent 50%),
                            radial-gradient(ellipse at 80% 80%, rgba(139, 92, 246, 0.08) 0%, transparent 50%),
                            radial-gradient(ellipse at 50% 50%, rgba(6, 182, 212, 0.06) 0%, transparent 60%),
                            linear-gradient(180deg, #020408 0%, #0a1628 30%, #0d1b2a 50%, #0a1628 70%, #020408 100%);
                        z-index: -2;
                    }
                    .space-bg::before {
                        content: '';
                        position: absolute;
                        inset: 0;
                        background-image:
                            repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(148,163,184,0.04) 39px, rgba(148,163,184,0.04) 40px),
                            repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(148,163,184,0.04) 39px, rgba(148,163,184,0.04) 40px);
                        background-size: 40px 40px;
                    }
                    .space-overlay {
                        position: fixed;
                        inset: 0;
                        background:
                            radial-gradient(ellipse at 50% 0%, rgba(148,163,184,0.05) 0%, transparent 50%),
                            linear-gradient(180deg, rgba(3,7,18,0.4) 0%, transparent 15%, transparent 85%, rgba(3,7,18,0.6) 100%);
                        z-index: -1;
                    }

                    .universal-header { flex-shrink: 0; }
                    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

                    /* ═══ MOBILE ═══ */
                    @media (max-width: 768px) {
                        .pnm-title-bar {
                            padding: clamp(6px, 1.5vh, 14px) 14px clamp(4px, 1vh, 10px);
                        }
                        .pnm-title {
                            font-size: clamp(20px, 5.5vw, 28px);
                            letter-spacing: clamp(1px, 0.4vw, 2px);
                        }
                        .pnm-layout { flex-direction: column; }
                        .pnm-sidebar {
                            width: 100%;
                            min-width: 100%;
                            height: auto;
                            flex-shrink: 0;
                            max-height: none;
                            border-right: none;
                            border-bottom: 2px solid rgba(148,163,184,0.12);
                            box-shadow: 0 4px 24px rgba(0,0,0,0.3);
                            padding: 6px 0 8px;
                            position: sticky;
                            top: 56px;
                            z-index: 100;
                        }
                        .sidebar-nav {
                            flex-direction: row;
                            overflow-x: auto;
                            -webkit-overflow-scrolling: touch;
                            scrollbar-width: none;
                            gap: 4px;
                            padding: 0 10px;
                            margin-bottom: 6px;
                        }
                        .sidebar-nav::-webkit-scrollbar { display: none; }
                        .sidebar-tab {
                            flex-direction: column;
                            gap: 3px;
                            padding: 8px 12px;
                            min-width: 60px;
                            align-items: center;
                            text-align: center;
                        }
                        .sidebar-tab.active::before { display: none; }
                        .sidebar-tab.active {
                            box-shadow: inset 0 -2px 0 #d4a853, inset 0 0 8px rgba(212,168,83,0.08);
                        }
                        .sidebar-tab-label { font-size: 10px; }
                        .sidebar-tab-icon { width: 20px; height: 20px; }
                        .sidebar-tab-count { display: none; }
                        .sidebar-filters {
                            padding: 0 10px 6px;
                            display: flex;
                            flex-wrap: wrap;
                            gap: 6px;
                            align-items: flex-start;
                        }
                        .sidebar-search-form {
                            flex: 1;
                            min-width: 160px;
                            margin-bottom: 0;
                        }
                        .sidebar-filter-group { margin-bottom: 0; }
                        .pnm-main { padding: 0 10px 40px; }
                        .tours-grid {
                            grid-template-columns: 1fr;
                        }
                        .tour-card-name { font-size: 15px; }
                    }

                    @media (max-width: 480px) {
                        .tours-results-bar {
                            flex-direction: column;
                            align-items: flex-start;
                            gap: 8px;
                            padding: 10px 14px;
                        }
                        .tour-card-premium {
                            padding: 14px 16px 12px;
                        }
                    }
                `}</style>
            </div>
        </>
    );
}
