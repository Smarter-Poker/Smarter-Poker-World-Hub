/**
 * FavoritesTabPanel — Extracted from poker-near-me.js renderFavorites()
 * Saved/favorited venues listing.
 */
import React from 'react';
import dynamic from 'next/dynamic';
import { PokerNearMePanelShell, PokerNearMeConsoleIcon } from './PokerNearMeConsole';

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
    // WIRING FIX: the Venues tab passed checkinCount into VenueCard and this one did not,
    // so the same room showed "N Here Today" (and a crowd level) on Venues and nothing on
    // Saved. Defaults to an empty map so an un-updated call site is still safe.
    checkinCounts,
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
            <PokerNearMePanelShell className="pnm-state-panel" bodyClassName="pnm-state-panel__body" aria-busy="true" role="status" aria-live="polite">
                <PokerNearMeConsoleIcon name="saved" className="pnm-state-panel__icon" />
                <p className="pnm-state-panel__title">Loading Your Saved Venues</p>
                <p className="pnm-state-panel__copy">Reading The Venues You Saved On This Device.</p>
            </PokerNearMePanelShell>
        );
    }

    if (favVenues.length === 0) {
        return (
            <PokerNearMePanelShell className="pnm-state-panel" bodyClassName="pnm-state-panel__body">
                <PokerNearMeConsoleIcon name="saved" className="pnm-state-panel__icon" />
                <h3 className="pnm-state-panel__title">Your Saved Venues</h3>
                <p className="pnm-state-panel__copy">Keep Track Of Your Favorite Card Rooms, Local Games, And Regular Stops. Tap The Heart Icon On Any Venue Card To Save It Here.</p>
                <button
                    type="button"
                    onClick={() => setActiveTab('venues')}
                    className="pnm-console-cta pnm-console-cta--primary"
                >
                    Explore Venues
                </button>
            </PokerNearMePanelShell>
        );
    }

    return (
        <>
            <div className="results-bar">
                <span className="results-count">{favVenues.length} Saved venue{favVenues.length !== 1 ? 's' : ''}</span>
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
                            checkinCount={checkinCounts ? (checkinCounts[String(venue.id)] || 0) : 0}
                        />
                    );
                })}
            </div>
        </>
    );
}
