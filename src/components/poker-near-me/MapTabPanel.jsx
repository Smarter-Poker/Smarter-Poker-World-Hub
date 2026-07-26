/**
 * MapTabPanel — Full Map view (no internal filter sidebar — all filters live in the page top bar)
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
    setIframeModal,
    openVenueModal,
}) {
    // Helper: identify tour stops — these are MTT venues, NOT cash game venues
    const isTour = (v) => v.venue_type === 'tour_stop' || v.venue_type === 'poker_tour';

    // Apply map-specific filter chips:
    // Tours are MTTs — they survive cash-game chip filter, but NOT cash/stakes-only map chips.
    let filteredVenues = allVenuesForMap;
    if (mapFilters.cashGames) {
        // Cash games chip: exclude tour stops (they have no cash tables)
        filteredVenues = filteredVenues.filter(v => !isTour(v) && (v.games_offered && v.games_offered.length > 0));
    }
    if (mapFilters.tournaments) {
        // Tournaments chip: tour stops ARE tournaments — include them
        filteredVenues = filteredVenues.filter(v => isTour(v) || v.has_tournaments);
    }
    if (mapFilters.is24Hours) {
        filteredVenues = filteredVenues.filter(v => !isTour(v) && !['charity', 'home_game'].includes(v.venue_type) && (v.is_24_hours || (v.hours_of_operation && v.hours_of_operation.includes('24'))));
    }
    if (mapFilters.lowStakes) {
        // Low stakes chip: tours have no stakes — exclude them
        filteredVenues = filteredVenues.filter(v => !isTour(v) && (v.stakes_cash && v.stakes_cash.some(s => {
            const match = s.match(/\$?(\d+)/);
            return match && parseInt(match[1]) <= 2;
        })));
    }
    if (mapFilters.topRated) {
        filteredVenues = filteredVenues.filter(v => isTour(v) || (v.trust_score || 0) >= 4.0);
    }

    // (Sidebar filters are now applied upstream in poker-near-me.js to keep feeds in sync)

    const toggleMapFilter = (key) => {
        setMapFilters(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="map-desktop-layout">
            {/* Full-width Map — filters live in the page-level top bar */}
            <div className="map-main-section">
                <div className="map-tab-container" style={{ position: 'relative' }}>
                    {/* Floating Radius Badge */}
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
                            {/* 150 is set by the Venues tab "Search Farther" tier — keep it selectable here */}
                            <option value={150} style={{ background: '#0a0a15' }}>150 Mi</option>
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
                            onOpenIframeModal={openVenueModal || (setIframeModal ? (url, title) => setIframeModal({ isOpen: true, url, title }) : undefined)}
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
        </div>
    );
}
