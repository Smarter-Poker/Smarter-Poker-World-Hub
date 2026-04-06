/**
 * MapTabPanel — Extracted from poker-near-me.js renderMap()
 * Full Map tab with filter chips, sidebar controls, and room detail panel.
 */
import React from 'react';
import dynamic from 'next/dynamic';

const VenueMap = dynamic(() => import('./VenueMap'), { ssr: false });
import { MapErrorBoundary } from './VenueMap';

export default function MapTabPanel({
    allVenuesForMap,
    mapFilters,
    setMapFilters,
    filters,
    setFilters,
    userLocation,
    mapCenter,
    liveTableCount,
    dailyTournaments,
    onMapVenueClick,
    requestGpsLocation,
    selectedRoom,
    setSelectedRoom,
    setHasSearched,
    fetchAllData,
    router,
    setIframeModal,
}) {
    // Apply map-specific filters
    let filteredVenues = allVenuesForMap;
    if (mapFilters.cashGames) {
        filteredVenues = filteredVenues.filter(v => v.games_offered && v.games_offered.length > 0);
    }
    if (mapFilters.tournaments) {
        filteredVenues = filteredVenues.filter(v => v.has_tournaments);
    }
    if (mapFilters.is24Hours) {
        filteredVenues = filteredVenues.filter(v => !['charity', 'home_game'].includes(v.venue_type) && (v.is_24_hours || (v.hours_of_operation && v.hours_of_operation.includes('24'))));
    }
    if (mapFilters.lowStakes) {
        filteredVenues = filteredVenues.filter(v => v.stakes_cash && v.stakes_cash.some(s => {
            const match = s.match(/\$?(\d+)/);
            return match && parseInt(match[1]) <= 2;
        }));
    }
    if (mapFilters.topRated) {
        filteredVenues = filteredVenues.filter(v => (v.trust_score || 0) >= 4.0);
    }

    // Apply sidebar filters
    if (filters.gameType === 'cash') {
        filteredVenues = filteredVenues.filter(v => v.games_offered && v.games_offered.length > 0);
    } else if (filters.gameType === 'mtt') {
        filteredVenues = filteredVenues.filter(v => v.has_tournaments);
    } else if (filters.gameType === 'mixed') {
        filteredVenues = filteredVenues.filter(v => v.games_offered && v.games_offered.some(g => /mixed|horse|8-game/i.test(g)));
    }

    if (filters.stakes === '$1/2') {
        filteredVenues = filteredVenues.filter(v => v.stakes_cash && v.stakes_cash.some(s => s.includes('1/2') || s.includes('1/3')));
    } else if (filters.stakes === '$2/5') {
        filteredVenues = filteredVenues.filter(v => v.stakes_cash && v.stakes_cash.some(s => s.includes('2/5')));
    } else if (filters.stakes === '$5/10+') {
        filteredVenues = filteredVenues.filter(v => v.stakes_cash && v.stakes_cash.some(s => s.includes('5/10') || s.includes('10/20') || s.includes('25/50')));
    }

    const toggleMapFilter = (key) => {
        setMapFilters(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="map-desktop-layout">
            {/* LEFT COLUMN: Map Section */}
            <div className="map-main-section">
                {/* Header Row */}
                <div className="map-header-row">
                    <h2 className="map-title">Explore All Poker Rooms</h2>
                    <span className="map-stats">{filteredVenues.length} rooms • {liveTableCount.toLocaleString()} active tables • {dailyTournaments.length} tournaments today</span>
                </div>

                {/* Quick Filter Chips */}
                <div className="map-filter-chips">
                    <button className={'filter-chip' + (mapFilters.cashGames ? ' active' : '')} onClick={() => toggleMapFilter('cashGames')}>
                        <span className="chip-dot cash"></span> Cash Games
                    </button>
                    <button className={'filter-chip' + (mapFilters.tournaments ? ' active' : '')} onClick={() => toggleMapFilter('tournaments')}>
                        <span className="chip-dot mtt"></span> Tournaments
                    </button>
                    <button className={'filter-chip' + (mapFilters.is24Hours ? ' active' : '')} onClick={() => toggleMapFilter('is24Hours')}>
                        <span className="chip-dot live"></span> 24/7 Open
                    </button>
                    <button className={'filter-chip' + (mapFilters.lowStakes ? ' active' : '')} onClick={() => toggleMapFilter('lowStakes')}>
                        <span className="chip-dot stakes"></span> Low Stakes
                    </button>
                    <button className={'filter-chip' + (mapFilters.topRated ? ' active' : '')} onClick={() => toggleMapFilter('topRated')}>
                        <span className="chip-dot rated"></span> Top Rated
                    </button>
                </div>

                {/* Map Container */}
                <div className="map-tab-container" style={{ position: 'relative' }}>
                    {/* Floating Radius Control */}
                    <div style={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        zIndex: 1000,
                        background: 'rgba(10, 10, 21, 0.9)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(212, 168, 83, 0.4)',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        pointerEvents: 'auto'
                    }}>
                        <span style={{ color: '#ffffff', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Radius:</span>
                        <select
                            value={filters.radius}
                            onChange={e => setFilters(p => ({ ...p, radius: e.target.value === 'Any' ? 'Any' : Number(e.target.value) }))}
                            style={{
                                background: 'transparent',
                                color: '#fff',
                                border: 'none',
                                fontSize: '13px',
                                fontWeight: 600,
                                outline: 'none',
                                cursor: 'pointer',
                                WebkitAppearance: 'none',
                                paddingRight: '14px'
                            }}
                        >
                            <option value={25} style={{ background: '#0a0a15' }}>25 Mi</option>
                            <option value={50} style={{ background: '#0a0a15' }}>50 Mi</option>
                            <option value={100} style={{ background: '#0a0a15' }}>100 Mi</option>
                            <option value={200} style={{ background: '#0a0a15' }}>200 Mi</option>
                            <option value={250} style={{ background: '#0a0a15' }}>250 Mi</option>
                            <option value={500} style={{ background: '#0a0a15' }}>500 Mi</option>
                            <option value="Any" style={{ background: '#0a0a15' }}>Any</option>
                        </select>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" style={{ position: 'absolute', right: '12px', pointerEvents: 'none' }}>
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                    <MapErrorBoundary>
                        <VenueMap
                            key="map-tab-main"
                            venues={filteredVenues}
                            userLocation={userLocation}
                            centerLocation={mapCenter}
                            fullHeight
                            onVenueClick={onMapVenueClick}
                            radiusMiles={filters.radius}
                            onOpenIframeModal={setIframeModal ? (url, title) => setIframeModal({ isOpen: true, url, title }) : undefined}
                        />
                    </MapErrorBoundary>
                </div>

                {/* Recenter Button */}
                {userLocation && (
                    <button className="map-recenter-btn" onClick={requestGpsLocation} aria-label="Recenter on my location">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                        </svg>
                        My Location
                    </button>
                )}
            </div>

            {/* RIGHT COLUMN: Sidebar Filters + Room Detail */}
            <div className="map-sidebar">
                <div className="sidebar-filters">
                    <h3 className="sidebar-title">Filters</h3>

                    {/* Radius */}
                    <div className="sidebar-filter-group">
                        <label className="sidebar-label">Radius</label>
                        <select
                            value={filters.radius}
                            onChange={e => setFilters(p => ({ ...p, radius: e.target.value === 'Any' ? 'Any' : Number(e.target.value) }))}
                            className="sidebar-select"
                        >
                            <option value={25}>25 Mi</option>
                            <option value={50}>50 Mi</option>
                            <option value={100}>100 Mi</option>
                            <option value={200}>200 Mi</option>
                            <option value={250}>250 Mi</option>
                            <option value={500}>500 Mi</option>
                            <option value="Any">Any</option>
                        </select>
                    </div>

                    {/* Game Type */}
                    <div className="sidebar-filter-group">
                        <label className="sidebar-label">Game Type</label>
                        <select
                            value={filters.gameType}
                            onChange={e => setFilters(p => ({ ...p, gameType: e.target.value }))}
                            className="sidebar-select"
                        >
                            <option value="all">All</option>
                            <option value="cash">Cash</option>
                            <option value="mtt">MTT</option>
                            <option value="mixed">Mixed</option>
                        </select>
                    </div>

                    {/* Stakes */}
                    <div className="sidebar-filter-group">
                        <label className="sidebar-label">Stakes</label>
                        <select
                            value={filters.stakes}
                            onChange={e => setFilters(p => ({ ...p, stakes: e.target.value }))}
                            className="sidebar-select"
                        >
                            <option value="all">All</option>
                            <option value="$1/2">$1/2</option>
                            <option value="$2/5">$2/5</option>
                            <option value="$5/10+">$5/10+</option>
                        </select>
                    </div>

                    {/* Buy-in Range */}
                    <div className="sidebar-filter-group">
                        <label className="sidebar-label">Buy-In Range</label>
                        <div className="sidebar-range-inputs">
                            <input
                                type="number"
                                placeholder="Min"
                                className="sidebar-input"
                                value={filters.minBuyin}
                                onChange={e => setFilters(p => ({ ...p, minBuyin: e.target.value }))}
                            />
                            <span className="range-divider">—</span>
                            <input
                                type="number"
                                placeholder="Max"
                                className="sidebar-input"
                                value={filters.maxBuyin}
                                onChange={e => setFilters(p => ({ ...p, maxBuyin: e.target.value }))}
                            />
                        </div>
                    </div>

                    <button className="sidebar-apply-btn" onClick={() => {
                        setHasSearched(true);
                        fetchAllData({ includeVenues: true });
                    }}>
                        Apply Filters
                    </button>
                </div>

                {/* Room Detail Panel */}
                {selectedRoom && (
                    <div className="room-detail-panel">
                        <div className="detail-header">
                            <h3>{selectedRoom.name}</h3>
                            <button className="detail-close" onClick={() => setSelectedRoom(null)}>×</button>
                        </div>
                        <p className="detail-location">{selectedRoom.city}, {selectedRoom.state}</p>
                        <button className="detail-view-btn" onClick={() => router.push(selectedRoom.is_social_page ? `/club/${selectedRoom.social_page_id}` : `/hub/venues/${selectedRoom.id}`)}>View Full Details</button>
                    </div>
                )}
            </div>
        </div>
    );
}
