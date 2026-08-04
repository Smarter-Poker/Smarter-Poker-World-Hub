/**
 * FavoritesTabPanel — Extracted from poker-near-me.js renderFavorites()
 * Saved/favorited venues listing.
 */
import React from 'react';
import dynamic from 'next/dynamic';

const VenueCard = dynamic(() => import('./VenueCard'), { ssr: false });

// Guard rail: never fire more than this many single-venue lookups for one favourites view.
const MAX_HYDRATE = 30;

export default function FavoritesTabPanel({
    allVenuesForMap,
    venues,
    isFavorited,
    favorites,
    toggleFavorite,
    venueMaxGtd,
    promotionVenueIds = new Set(),
    pnmReviewStatsMap,
    setActiveTab,
    router,
    openVenueModal,
}) {
    // BUG FIX: favourites used to be rendered by INTERSECTING the favourites map with
    // whatever the current search had loaded, so a saved room outside the active radius
    // (social pages and home groups are only ever merged in from the live search) showed
    // the "you have saved nothing" empty state. Favourites are durable, so drive the list
    // off the favourites map itself and fetch anything the loaded pool cannot resolve.
    const safeMap = Array.isArray(allVenuesForMap) ? allVenuesForMap : [];
    const safeVenues = Array.isArray(venues) ? venues : [];

    const favIds = React.useMemo(() => {
        const keys = Object.keys(favorites || {});
        const ids = keys
            .filter(k => k.startsWith('venue-') && favorites[k])
            .map(k => k.slice('venue-'.length))
            .filter(Boolean);
        return Array.from(new Set(ids));
    }, [favorites]);

    const pool = React.useMemo(() => {
        const byId = new Map();
        [...safeMap, ...safeVenues].forEach(v => {
            if (v && v.id != null && !byId.has(String(v.id))) byId.set(String(v.id), v);
        });
        return byId;
    }, [safeMap, safeVenues]);

    const [hydrated, setHydrated] = React.useState({});
    const attemptedRef = React.useRef(new Set());
    const [hydrating, setHydrating] = React.useState(false);

    const missingIds = React.useMemo(
        () => favIds.filter(id => !pool.has(String(id)) && !hydrated[String(id)]),
        [favIds, pool, hydrated]
    );

    React.useEffect(() => {
        const todo = missingIds
            .filter(id => !attemptedRef.current.has(String(id)))
            .slice(0, MAX_HYDRATE);
        if (todo.length === 0) return;
        todo.forEach(id => attemptedRef.current.add(String(id)));

        let cancelled = false;
        setHydrating(true);
        Promise.all(
            todo.map(id =>
                fetch(`/api/poker/venues?id=${encodeURIComponent(id)}`)
                    .then(r => (r.ok ? r.json() : null))
                    .then(json => {
                        const rows = json && (json.data || json.venues);
                        const found = Array.isArray(rows) ? rows[0] : rows;
                        return found && found.id != null ? found : null;
                    })
                    .catch(() => null)
            )
        )
            .then(results => {
                if (cancelled) return;
                const next = {};
                results.forEach(v => {
                    if (v) next[String(v.id)] = v;
                });
                if (Object.keys(next).length > 0) setHydrated(prev => ({ ...prev, ...next }));
            })
            .finally(() => {
                if (!cancelled) setHydrating(false);
            });

        return () => {
            cancelled = true;
        };
    }, [missingIds]);

    const favVenues = favIds
        .map(id => pool.get(String(id)) || hydrated[String(id)])
        .filter(Boolean);

    // Still resolving saved venues that are outside the current search — do not claim
    // the user has saved nothing while the lookups are in flight. `hydrating` only flips
    // true after the effect runs (post-paint), so the not-yet-attempted check below covers
    // the first frame too; once every id has been attempted both are false and the real
    // empty state renders, so this can never stick on "Loading".
    const hydratePending = missingIds.some(id => !attemptedRef.current.has(String(id)));
    if (favVenues.length === 0 && favIds.length > 0 && (hydrating || hydratePending)) {
        return (
            <div className="empty-state" style={{ padding: '60px 20px' }}>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>Loading Your Saved Venues...</p>
            </div>
        );
    }

    if (favVenues.length === 0) {
        return (
            <div className="empty-state" style={{ padding: '60px 20px', background: 'radial-gradient(circle at center, rgba(239,68,68,0.05) 0%, transparent 70%)' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                    </svg>
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Your Saved Venues</h3>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', maxWidth: 320, lineHeight: 1.5, margin: '0 auto 24px' }}>Keep Track Of Your Favorite Card Rooms, Local Games, And Regular Stops. Tap The Heart Icon On Any Venue Card To Save It Here.</p>
                <button onClick={() => setActiveTab('venues')} className="primary-btn" style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(239,68,68,0.3)' }}>Explore Venues</button>
            </div>
        );
    }

    return (
        <>
            <div className="results-bar">
                <span className="results-count">{favVenues.length} saved venue{favVenues.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="card-grid">
                {favVenues.map((venue, i) => {
                    const maxGtd = venueMaxGtd[String(venue.id)] || 0;
                    return (
                        <VenueCard
                            key={venue.id || i}
                            venue={{ ...venue, max_gtd: maxGtd }}
                            index={i}
                            isFavorited={true}
                            hasPromo={promotionVenueIds.has(String(venue.id))}
                            onFavorite={(e) => toggleFavorite('venue', venue.id, e, venue)}
                            onNavigate={openVenueModal}
                            reviewStats={pnmReviewStatsMap[String(venue.id)]}
                        />
                    );
                })}
            </div>
        </>
    );
}
