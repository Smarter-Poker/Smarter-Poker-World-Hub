/**
 * ToursTabPanel — Extracted from poker-near-me.js renderTours()
 * Tours listing with search, state filter, and paginated grid.
 */
import React from 'react';
import dynamic from 'next/dynamic';

const TourCard = dynamic(() => import('./TourCard'), { ssr: false });

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

// Region labels the tour registry uses that map 1:1 onto a US state.
// (Multi-state regions like 'Southeast' / 'Gulf Coast' intentionally map to nothing.)
const REGION_TO_STATE = {
    ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA',
    COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE', FLORIDA: 'FL', GEORGIA: 'GA',
    HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA', KANSAS: 'KS',
    KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD', MASSACHUSETTS: 'MA',
    MICHIGAN: 'MI', MINNESOTA: 'MN', MISSISSIPPI: 'MS', MISSOURI: 'MO', MONTANA: 'MT',
    NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
    'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND',
    OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI',
    'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX',
    UTAH: 'UT', VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV',
    WISCONSIN: 'WI', WYOMING: 'WY', 'WASHINGTON DC': 'DC', 'DISTRICT OF COLUMBIA': 'DC',
};

const US_STATE_SET = new Set(US_STATES);

// Pull a 2-letter state code out of a "City, ST" style string.
function stateFromLocation(value) {
    if (!value) return null;
    const m = String(value).match(/,\s*([A-Za-z]{2})\s*$/);
    if (!m) return null;
    const code = m[1].toUpperCase();
    return US_STATE_SET.has(code) ? code : null;
}

/**
 * BUG FIX: this panel used to filter on `t.state`, a scalar the tours API never
 * returns (`/api/poker/tours` exposes regions / stops_2026 / series_2026 /
 * headquarters), so every state selection matched zero tours. States are now
 * derived from the geography the payload actually carries.
 */
function tourStateCodes(tour) {
    const codes = new Set();
    if (!tour) return codes;
    // Keep honouring a real scalar if a DB row ever supplies one
    const direct = typeof tour.state === 'string' ? tour.state.toUpperCase() : null;
    if (direct && US_STATE_SET.has(direct)) codes.add(direct);

    (Array.isArray(tour.regions) ? tour.regions : []).forEach((r) => {
        const raw = String(r || '').trim();
        const upper = raw.toUpperCase();
        if (US_STATE_SET.has(upper)) codes.add(upper);
        else if (REGION_TO_STATE[upper]) codes.add(REGION_TO_STATE[upper]);
    });

    [...(Array.isArray(tour.stops_2026) ? tour.stops_2026 : []),
     ...(Array.isArray(tour.series_2026) ? tour.series_2026 : [])].forEach((s) => {
        if (!s) return;
        const code = (typeof s.state === 'string' && US_STATE_SET.has(s.state.toUpperCase()))
            ? s.state.toUpperCase()
            : stateFromLocation(s.location);
        if (code) codes.add(code);
    });

    const hq = stateFromLocation(tour.headquarters);
    if (hq) codes.add(hq);

    return codes;
}

export default function ToursTabPanel({
    tours,
    filters,
    setFilters,
    displayCount,
    loadMore,
    isFavorited,
    toggleFavorite,
    router,
    openVenueModal,
}) {
    let tourStateVal = filters.hubTourState || 'all';
    // Guard against literal string 'undefined' persisting from a buggy state
    if (tourStateVal === 'undefined') tourStateVal = 'all';

    const safeTours = Array.isArray(tours) ? tours : [];

    // Derive each tour's states once per tours change, and offer only states that
    // actually have tours — the old 51-option list guaranteed empty results.
    const { stateOptions, stateIndex } = React.useMemo(() => {
        const index = new Map();
        const present = new Set();
        safeTours.forEach((t, i) => {
            const codes = tourStateCodes(t);
            index.set(t.tour_code || i, codes);
            codes.forEach(c => present.add(c));
        });
        return {
            stateOptions: US_STATES.filter(st => present.has(st)),
            stateIndex: index,
        };
    }, [safeTours]);

    let filteredTours = safeTours;
    if (tourStateVal !== 'all') {
        filteredTours = filteredTours.filter((t, i) => {
            const codes = stateIndex.get(t.tour_code || i);
            return !!(codes && codes.has(tourStateVal));
        });
    }

    return (
        <>
            {/* State Filter */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={tourStateVal}
                    onChange={(e) => setFilters(f => ({ ...f, hubTourState: e.target.value }))}
                    className="sort-select" style={{ minWidth: 100 }}>
                    <option value="all">All States</option>
                    {/* Keep a persisted selection selectable even before tours load */}
                    {tourStateVal !== 'all' && !stateOptions.includes(tourStateVal) && (
                        <option value={tourStateVal}>{tourStateVal}</option>
                    )}
                    {stateOptions.map(st => (
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
                                onNavigate={(path) => openVenueModal ? openVenueModal(path) : router.push(path)}
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
