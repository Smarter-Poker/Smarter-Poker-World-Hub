/**
 * ToursTabPanel — Extracted from poker-near-me.js renderTours()
 * Tours listing with search, state filter, and paginated grid.
 */
import React from 'react';
import dynamic from 'next/dynamic';

const TourCard = dynamic(() => import('./TourCard'), { ssr: false });

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

export default function ToursTabPanel({
    tours,
    filters,
    setFilters,
    displayCount,
    loadMore,
    isFavorited,
    toggleFavorite,
    router,
}) {
    const tourStateVal = filters.hubTourState || 'all';
    let filteredTours = tours;
    if (tourStateVal !== 'all') {
        filteredTours = filteredTours.filter(t => t.state === tourStateVal);
    }

    return (
        <>
            {/* State Filter */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={tourStateVal}
                    onChange={(e) => setFilters(f => ({ ...f, hubTourState: e.target.value }))}
                    className="sort-select" style={{ minWidth: 100 }}>
                    <option value="all">All States</option>
                    {US_STATES.map(st => (
                        <option key={st} value={st}>{st}</option>
                    ))}
                </select>
            </div>
            <div className="results-bar">
                <span className="results-count"><span style={{ color: '#ffffff', fontWeight: 800 }}>{filteredTours.length}</span> tour{filteredTours.length !== 1 ? 's' : ''}</span>
            </div>
            {filteredTours.length === 0 ? (
                <div className="empty-state">
                    <p>No Matching Tours</p>
                    <p style={{ fontSize: 13, opacity: 0.5, marginTop: 4 }}>{tourStateVal !== 'all' ? 'Try adjusting your filters.' : 'Check back soon for poker tour schedules.'}</p>
                    <button onClick={() => setFilters(f => ({ ...f, hubTourState: 'all' }))}>Clear Tour Filters</button>
                </div>
            ) : (
                <>
                    <div className="card-grid tours-grid">
                        {filteredTours.slice(0, displayCount.tours).map((tour, i) => (
                            <TourCard
                                key={tour.tour_code || i}
                                tour={tour}
                                isFavorited={isFavorited('tour', tour.tour_code)}
                                onFavorite={(e) => toggleFavorite('tour', tour.tour_code, e)}
                                onNavigate={(path) => router.push(path)}
                            />
                        ))}
                    </div>
                    {displayCount.tours < filteredTours.length && (
                        <div className="load-more">
                            <button className="load-more-btn" onClick={() => loadMore('tours')}>
                                Load More ({filteredTours.length - displayCount.tours} remaining)
                            </button>
                        </div>
                    )}
                </>
            )}
        </>
    );
}
