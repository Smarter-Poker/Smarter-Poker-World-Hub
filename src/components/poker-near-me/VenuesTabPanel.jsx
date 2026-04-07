/**
 * VenuesTabPanel — Extracted from poker-near-me.js renderVenues()
 * Venues listing with map preview, sort controls, and infinite scroll.
 */
import React from 'react';
import dynamic from 'next/dynamic';
import { MapErrorBoundary } from './VenueMap';

const VenueCard = dynamic(() => import('./VenueCard'), { ssr: false });
const VenueMap = dynamic(() => import('./VenueMap'), { ssr: false });
const RichTourCard = dynamic(() => import('./RichTourCard'), { ssr: false });

const RADIUS_TIERS = [50, 100, 200, 500];

export default function VenuesTabPanel({
    venues,
    venueLoading,
    loading,
    sortBy,
    setSortBy,
    getSortedVenues,
    displayCount,
    loadMore,
    mapFullscreen,
    setMapFullscreen,
    mapCenter,
    userLocation,
    isFavorited,
    toggleFavorite,
    venueMaxGtd,
    promotionVenueIds,
    highlightedVenueId,
    nearestDistance,
    filters,
    clearFilters,
    pnmReviewStatsMap,
    router,
    onMapVenueClick,
    iframeModal,
    setIframeModal,
}) {
    // Defensive guard — venues may be null/undefined during initial load or after a crash
    const safeVenues = Array.isArray(venues) ? venues : [];

    if (safeVenues.length === 0 && !venueLoading && !loading) {
        return (
            <div className="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                <p>No Venues Found Matching Your Criteria</p>
                <p style={{ fontSize: 13, opacity: 0.5, marginTop: 4 }}>Try A Different City, Adjust Filters, Or Use GPS</p>
                <button onClick={clearFilters}>Clear All Filters</button>
            </div>
        );
    }

    const sorted = getSortedVenues(safeVenues);
    const displayed = sorted.slice(0, displayCount.venues);
    const remaining = sorted.length - displayed.length;

    return (
        <>
            {/* MAP CARD */}
            <div className={`map-preview-card${mapFullscreen ? ' map-preview-fullscreen' : ''}`}>
                {mapFullscreen && (
                    <div className="map-preview-expand-badge" onClick={(e) => { e.stopPropagation(); setMapFullscreen(false); }} style={{ cursor: 'pointer', pointerEvents: 'auto' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                            <line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
                        </svg>
                        Collapse Map
                    </div>
                )}
                <MapErrorBoundary>
                    <VenueMap
                        key={mapFullscreen ? 'venues-fullscreen' : 'venues-preview'}
                        venues={sorted}
                        userLocation={userLocation}
                        centerLocation={mapCenter}
                        fullHeight={mapFullscreen}
                        onVenueClick={onMapVenueClick}
                        radiusMiles={filters.radius}
                        isFavorited={isFavorited}
                        onOpenIframeModal={(url, title) => setIframeModal({ isOpen: true, url, title })}
                    />
                </MapErrorBoundary>
            </div>

            {/* Results bar */}
            <div className="results-bar">
                <span className="results-count">{sorted.length} Result{sorted.length !== 1 ? 's' : ''} Found</span>
                
                <div className="sort-results-wrapper">
                    <label className="sort-results-label">Sort:</label>
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value)}
                        className="sort-results-select"
                    >
                        <option value="default">{userLocation ? 'Nearest First' : 'Default'}</option>
                        <option value="distance">Distance (Nearest)</option>
                        <option value="trust-desc">Trust Score (High → Low)</option>
                        <option value="trust-asc">Trust Score (Low → High)</option>
                        <option value="name-az">Name (A → Z)</option>
                        <option value="name-za">Name (Z → A)</option>
                        <option value="venue-type">Venue Type</option>
                        <option value="state-az">State (A → Z)</option>
                        <option value="most-tables">Most Tables</option>
                        <option value="most-games">Most Games Offered</option>
                        <option value="city-az">City (A → Z)</option>
                    </select>
                </div>

                <span className="results-showing">
                    {(userLocation || nearestDistance) ? `Nearest: ${nearestDistance || '0'} Miles` : `Showing ${displayed.length} of ${safeVenues.length}`}
                </span>
                
                {!mapFullscreen && (
                    <button className="expand-map-inline-btn" onClick={() => setMapFullscreen(true)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                            <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                        </svg>
                        Expand Map
                    </button>
                )}
            </div>

            {/* VENUE CARDS */}
            <div className="venues-cards-section">
                <div className="card-grid">
                    {displayed.map((venue, i) => {
                        const isHighlighted = highlightedVenueId === venue.id;
                        
                        if (venue.venue_type === 'tour_stop' || venue.venue_type === 'series' || venue.venue_type === 'poker_tour') {
                            // RichTourCard fetches live data to match the exact card on /hub/tours/[code]
                            // including LIVE NOW banner, upcoming stops list, real-time buy-ins, etc.
                            return (
                                <div key={venue.id || `tour-${i}`} id={`tour-card-${venue.tour_code || i}`}
                                    className={'venue-card-wrapper' + (isHighlighted ? ' venue-card-highlighted' : '')}
                                    style={{ border: '1.5px solid #ef4444', borderRadius: 12, boxShadow: '0 0 12px rgba(239,68,68,0.25)' }}
                                >
                                    <RichTourCard
                                        venue={venue}
                                        isFavorited={isFavorited('venue', venue.id)}
                                        onFavorite={(e) => toggleFavorite('venue', venue.id, e, venue)}
                                        onNavigate={(path) => router.push(path)}
                                    />
                                </div>
                            );
                        }
                        
                        const maxGtd = venueMaxGtd[String(venue.id)] || 0;
                        return (
                            <div key={venue.id || i} id={'venue-card-' + venue.id}
                                className={'venue-card-wrapper' + (isHighlighted ? ' venue-card-highlighted' : '')}>
                            <VenueCard
                                venue={{ ...venue, max_gtd: maxGtd }}
                                index={i}
                                isFavorited={isFavorited('venue', venue.id)}
                                hasPromo={promotionVenueIds.has(String(venue.id))}
                                onFavorite={(e) => toggleFavorite('venue', venue.id, e, venue)}
                                onNavigate={(path) => router.push(path)}
                                reviewStats={pnmReviewStatsMap[String(venue.id)]}
                            />
                            </div>
                        );
                    })}
                </div>
                {/* Load More / Expand Radius */}
                {(() => {
                    const currentRadius = Number(filters.radius) || 50;
                    const nextTier = RADIUS_TIERS.find(r => r > currentRadius);
                    const hasMoreToShow = remaining > 0;
                    const canExpandRadius = userLocation && nextTier && !hasMoreToShow;
                    
                    if (hasMoreToShow) {
                        return (
                            <div className="load-more">
                                <button className="load-more-btn" onClick={() => loadMore('venues')}>
                                    Show More Results ({remaining} Remaining)
                                </button>
                            </div>
                        );
                    }
                    if (canExpandRadius) {
                        return (
                            <div className="load-more" style={{ marginTop: '30px', textAlign: 'center' }}>
                                <button 
                                    className="expand-radius-btn" 
                                    onClick={() => loadMore('venues')}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10" />
                                        <polyline points="8 12 12 16 16 12" />
                                        <line x1="12" y1="8" x2="12" y2="16" />
                                    </svg>
                                    Search Farther — Expand To {nextTier} Miles
                                </button>
                            </div>
                        );
                    }
                    return null;
                })()}
            </div>
        </>
    );
}
