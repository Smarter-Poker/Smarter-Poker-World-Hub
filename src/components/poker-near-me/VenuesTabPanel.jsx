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

const RADIUS_TIERS = [50, 100, 150]; // max 150mi matches lobby + API caps
const PAGE_SIZE = 20; // mirrors PAGE_SIZE in pages/hub/poker-near-me/[pnmTab].js

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
    iframeModal,
    setIframeModal,
    openVenueModal,
    checkinCounts,
    onMapVenueClick,
    hasSearched,
    requestGpsLocation,
}) {
    // Defensive guard — venues may be null/undefined during initial load or after a crash
    const safeVenues = Array.isArray(venues) ? venues : [];

    // BUG FIX: the page's loadMore('venues') paginates off the RAW venues array while this
    // panel renders `venues` + deduped tour stops, so "Show More Results (N Remaining)" was a
    // no-op (or silently widened the radius) whenever the remainder was tour-stop cards.
    // A local floor keeps the promised cards reachable no matter which branch the page takes;
    // Math.max means a normal page-side page-in does NOT double-advance the list.
    const [localShown, setLocalShown] = React.useState(0);
    const pageShownRef = React.useRef(displayCount.venues);
    // Set for exactly one displayCount update after a "Show More" click — see below.
    const keepFloorRef = React.useRef(false);
    React.useEffect(() => {
        const prevShown = pageShownRef.current;
        pageShownRef.current = displayCount.venues;
        // Consume the claim on the FIRST displayCount write after the click, whatever
        // branch the page took (the object identity changes on every setDisplayCount,
        // even when the venues value is unchanged).
        const claimed = keepFloorRef.current;
        keepFloorRef.current = false;
        if (displayCount.venues >= prevShown) return;
        // A drop means the page started a fresh result set (new search, GPS, radius or
        // venue-type change, clear filters) — drop the local floor with it so the new
        // list starts from the top.
        // BUG FIX: the one drop that must NOT wipe the floor is the one the user's own
        // "Show More" click caused. The page's loadMore falls through to a radius
        // expansion (which resets displayCount.venues to PAGE_SIZE) once its RAW venues
        // array is exhausted, and that used to shrink the list the click had just grown.
        if (claimed) return;
        setLocalShown(0);
    }, [displayCount]);

    // The claim above must NEVER outlive the commit the click produced. The page's
    // loadMore('venues') is a no-op whenever its RAW venues array is exhausted AND
    // there is no next radius tier (or no GPS) — no setDisplayCount runs, the effect
    // above never fires, and a still-armed claim would then swallow the reset for the
    // NEXT search (leaving the new result set rendered at the old, larger count).
    // React batches setLocalShown + the page's setDisplayCount from the same click
    // into one commit, and effects run in declaration order, so this always clears
    // the claim AFTER the effect above has had its chance to consume it.
    React.useEffect(() => {
        keepFloorRef.current = false;
    });

    // GAP FIX: clearFilters() sets venues to [] and hasSearched to false, and the page
    // then routes straight back here — so the user landed on "No Venues Found Matching
    // Your Criteria" with a "Clear All Filters" button for the state they were already
    // in. A not-yet-searched view is a landing, not a dead end.
    // (`hasSearched` is only treated as a landing signal when the page actually passes
    // it; undefined keeps the previous behaviour.)
    if (hasSearched === false && safeVenues.length === 0 && !venueLoading && !loading) {
        return (
            <div className="search-landing">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginTop: 12 }}>Find Poker Near You</p>
                <p style={{ fontSize: 13, opacity: 0.6, marginTop: 4, maxWidth: 340, lineHeight: 1.5 }}>Search A City Above To See Card Rooms, Casinos, Charity Rooms And Home Games — Or Use Your Location For The Closest Games First.</p>
                {requestGpsLocation && (
                    <button
                        onClick={requestGpsLocation}
                        style={{ marginTop: 16, padding: '12px 24px', background: 'linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(200,214,229,0.1) 100%)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                    >
                        Use My Location
                    </button>
                )}
            </div>
        );
    }

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

    const shownCount = Math.max(displayCount.venues, localShown);
    const sorted = getSortedVenues(safeVenues);
    const displayed = sorted.slice(0, shownCount);
    const remaining = sorted.length - displayed.length;

    const showMoreResults = () => {
        setLocalShown(shownCount + PAGE_SIZE);
        keepFloorRef.current = true;
        // The rendered total is passed through so the page can choose its page-in vs
        // radius-expand branch from the SAME list this button was rendered from
        // (it paginates off its raw `venues` array, which is a different list).
        loadMore('venues', sorted.length);
    };

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
                    {/* UX FIX: these used to be mutually exclusive, so GPS users (the default
                        path, and the ones with the most results) never saw how much of the list
                        was rendered. The distance clause is dropped entirely when unknown —
                        "Nearest: 0 Miles" claimed a venue sat on top of the user. */}
                    {nearestDistance ? `Nearest: ${nearestDistance} Miles - ` : ''}
                    {`Showing ${displayed.length} of ${sorted.length}`}
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
                                        onNavigate={openVenueModal}
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
                                onNavigate={openVenueModal}
                                reviewStats={pnmReviewStatsMap[String(venue.id)]}
                                checkinCount={checkinCounts ? (checkinCounts[String(venue.id)] || 0) : 0}
                            />
                            </div>
                        );
                    })}
                </div>
                {/* Load More / Expand Radius */}
                {(() => {
                    // BUG FIX: `Number(filters.radius) || 50` turned the radius select's
                    // "Any" option (a string, shared page state set by MapTabPanel) into 50,
                    // so an unlimited search advertised "Expand To 100 Miles" — a button that
                    // NARROWS the search and drops venues from the list. A non-numeric radius
                    // is already unbounded: there is no farther tier to offer.
                    const numericRadius = Number(filters.radius);
                    const isUnboundedRadius = !Number.isFinite(numericRadius) || numericRadius <= 0;
                    const nextTier = isUnboundedRadius ? undefined : RADIUS_TIERS.find(r => r > numericRadius);
                    const hasMoreToShow = remaining > 0;
                    const canExpandRadius = userLocation && nextTier && !hasMoreToShow;
                    
                    if (hasMoreToShow) {
                        return (
                            <div className="load-more">
                                <button className="load-more-btn" onClick={showMoreResults}>
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
                                    onClick={() => loadMore('venues', sorted.length)}
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
