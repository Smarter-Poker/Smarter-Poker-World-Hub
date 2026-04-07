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
    router,
    setIframeModal,
}) {
    // Helper: tour stop pins should ALWAYS appear on the map regardless of filters
    const isTour = (v) => v.venue_type === 'tour_stop' || v.venue_type === 'poker_tour';

    // Apply map-specific filters — tour stops are exempt (they don't have cash/tournament/stakes data)
    let filteredVenues = allVenuesForMap;
    if (mapFilters.cashGames) {
        filteredVenues = filteredVenues.filter(v => isTour(v) || (v.games_offered && v.games_offered.length > 0));
    }
    if (mapFilters.tournaments) {
        filteredVenues = filteredVenues.filter(v => isTour(v) || v.has_tournaments);
    }
    if (mapFilters.is24Hours) {
        filteredVenues = filteredVenues.filter(v => isTour(v) || (!['charity', 'home_game'].includes(v.venue_type) && (v.is_24_hours || (v.hours_of_operation && v.hours_of_operation.includes('24')))));
    }
    if (mapFilters.lowStakes) {
        filteredVenues = filteredVenues.filter(v => isTour(v) || (v.stakes_cash && v.stakes_cash.some(s => {
            const match = s.match(/\$?(\d+)/);
            return match && parseInt(match[1]) <= 2;
        })));
    }
    if (mapFilters.topRated) {
        filteredVenues = filteredVenues.filter(v => isTour(v) || (v.trust_score || 0) >= 4.0);
    }

    // Apply sidebar filters — tour stops are exempt unless explicitly filtering for a specific venue type
    if (filters.venueType && filters.venueType !== 'all') {
        filteredVenues = filteredVenues.filter(v => isTour(v) || v.venue_type === filters.venueType || (filters.venueType === 'tour_stop' && v.venue_type === 'poker_tour') || (filters.venueType === 'card_room' && v.venue_type === 'poker_club'));
    }

    if (filters.gameType === 'cash') {
        filteredVenues = filteredVenues.filter(v => isTour(v) || (v.games_offered && v.games_offered.length > 0));
    } else if (filters.gameType === 'mtt') {
        filteredVenues = filteredVenues.filter(v => isTour(v) || v.has_tournaments);
    } else if (filters.gameType === 'mixed') {
        filteredVenues = filteredVenues.filter(v => isTour(v) || (v.games_offered && v.games_offered.some(g => /mixed|horse|8-game/i.test(g))));
    }

    if (filters.stakes === '$1/2') {
        filteredVenues = filteredVenues.filter(v => isTour(v) || (v.stakes_cash && v.stakes_cash.some(s => s.includes('1/2') || s.includes('1/3'))));
    } else if (filters.stakes === '$2/5') {
        filteredVenues = filteredVenues.filter(v => isTour(v) || (v.stakes_cash && v.stakes_cash.some(s => s.includes('2/5'))));
    } else if (filters.stakes === '$5/10+') {
        filteredVenues = filteredVenues.filter(v => isTour(v) || (v.stakes_cash && v.stakes_cash.some(s => s.includes('5/10') || s.includes('10/20') || s.includes('25/50'))));
    }

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
        </div>
    );
}
