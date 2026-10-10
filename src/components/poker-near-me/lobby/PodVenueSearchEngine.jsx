import React, { useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { haversineMiles, getNearestTourDistance } from '../pnm-utils';
import LobbyPodConsole, {
  LobbyPodAction,
  LobbyPodCardList,
  LobbyPodControlPanel,
  LobbyPodDistance,
  LobbyPodField,
  LobbyPodInfoPanel,
  LobbyPodResultsBar,
  LobbyPodSegmentGroup,
  LobbyPodState,
  PNM_US_STATE_CODES,
} from './LobbyPodConsole';

// Import cards statically or dynamically based on your app setup
const VenueCard = dynamic(() => import('../VenueCard'), { ssr: false });
const TourCard = dynamic(() => import('../TourCard'), { ssr: false });
const SeriesCard = dynamic(() => import('../NewSeriesVenueCard'), { ssr: false });

const PodVenueSearchEngine = ({
  prefix,
  title,
  subtitle,
  subtitleDesc,
  showBuyIn,
  filters,
  setFilters,
  venues,
  dailyTournaments,
  tours,
  series,
  userLocation,
  gpsLoading,
  handleGpsClick,
  loading,
  loadMore,
  favorites,
  handleToggleFavorite,
  checkinCounts,
  reviewStatsMap,
  handleVenueNavigate,
  router,
  triggerSearch,
  fetchError,
  onRetry,
  hasMore,
}) => {
  const pState = filters[`${prefix}State`] || 'all';
  const pVenueType = filters[`${prefix}VenueType`] || 'all';
  const pGameType = filters[`${prefix}GameType`] || 'all';
  // Cap radius from filters state at 150mi — guards against stale localStorage values
  const rawPRadius = filters[`${prefix}Radius`] || '100';
  const pRadius = rawPRadius === 'any' ? 'any' : String(Math.min(parseInt(rawPRadius) || 100, 150));
  const pSort = filters[`${prefix}Sort`] || (userLocation ? 'distance' : 'trust');
  const pSearched = filters[`${prefix}Searched`] || false;
  
  const pMinBuyin = showBuyIn ? (filters[`${prefix}MinBuyin`] || '') : '';
  const pMaxBuyin = showBuyIn ? (filters[`${prefix}MaxBuyin`] || '') : '';

  // [AUDIT] Everything below used to run unconditionally in the render body on
  // every pass: up to four array filters, a full sort whose comparator called
  // haversine twice per comparison, and two more sorts that each called
  // getNearestTourDistance twice per comparison. With 200 venues plus a tours
  // list that is thousands of trig evaluations per keystroke in the buy-in
  // inputs. React.memo on the export does not help because `filters` is a fresh
  // object on every setFilters and `venues` gets a new identity on every
  // live-data merge. Each derived list is now memoised on the specific fields it
  // reads, and distances are precomputed once per item (Schwartzian transform)
  // instead of being recomputed inside comparators.
  const userLat = userLocation?.lat ?? null;
  const userLng = userLocation?.lng ?? null;

  const pDist = useCallback((v) => {
    if (userLat == null || userLng == null || !v.latitude || !v.longitude) return 99999;
    return haversineMiles(userLat, userLng, v.latitude, v.longitude);
  }, [userLat, userLng]);

  const results = useMemo(() => {
    let out = venues || [];
    if (pState !== 'all') out = out.filter(v => v.state === pState);
    if (pVenueType !== 'all') out = out.filter(v => {
      if (pVenueType === 'poker_club') return v.venue_type === 'poker_club' || v.venue_type === 'card_room';
      if (pVenueType === 'poker_tour') return v.venue_type === 'poker_tour' || v.venue_type === 'tour_stop' || v.venue_type === 'tour';
      return v.venue_type === pVenueType;
    });

    if (pGameType !== 'all') {
      out = out.filter(v => {
        const g = (v.games_offered || []).join(' ').toLowerCase();
        if (pGameType === 'nlh') return g.includes('nlh') || g.includes('hold');
        if (pGameType === 'plo') return g.includes('plo') || g.includes('omaha');
        if (pGameType === 'mixed') return g.includes('mix') || g.includes('horse');
        return true;
      });
    }

    const hasLoc = userLat != null && userLng != null;
    // One haversine per venue, reused by both the radius filter and the sort.
    let decorated = out.map(v => ({ v, d: hasLoc ? pDist(v) : 99999 }));
    if (hasLoc && pRadius !== 'any') {
      const limit = Number(pRadius);
      decorated = decorated.filter(x => x.d <= limit);
    }

    if (pSort === 'distance' && hasLoc) decorated.sort((a, b) => a.d - b.d);
    else if (pSort === 'trust') decorated.sort((a, b) => (b.v.trust_score || 0) - (a.v.trust_score || 0));
    else if (pSort === 'name') decorated.sort((a, b) => (a.v.name || '').localeCompare(b.v.name || ''));

    return decorated.map(x => x.v);
  }, [venues, pState, pVenueType, pGameType, pRadius, pSort, userLat, userLng, pDist]);

  const pTournaments = useMemo(() => (dailyTournaments ? dailyTournaments.filter(t => {
    if (pMinBuyin && (t.buy_in || 0) < Number(pMinBuyin)) return false;
    if (pMaxBuyin && (t.buy_in || 0) > Number(pMaxBuyin)) return false;
    return true;
  }) : []), [dailyTournaments, pMinBuyin, pMaxBuyin]);

  const handleSearch = () => {
    triggerSearch();
  };

  // Distance per tour is computed ONCE, not twice per comparison.
  // getNearestTourDistance can return null for tours with no coordinate data —
  // coerce null to Infinity so those sort to the bottom, not the top
  // (null - null === 0 and null - 5 === -5 both order incorrectly).
  const nearbyTours = useMemo(() => {
    if (userLat == null || userLng == null) return [];
    const loc = { lat: userLat, lng: userLng };
    const limit = pRadius === 'any' ? Infinity : Number(pRadius);
    return (tours || [])
      .map(t => ({ t, d: getNearestTourDistance(t, loc) }))
      .filter(x => x.d !== null && x.d <= limit)
      .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity))
      .map(x => x.t);
  }, [tours, userLat, userLng, pRadius]);

  const nearbySeries = useMemo(() => {
    if (userLat == null || userLng == null) return [];
    const limit = pRadius === 'any' ? Infinity : Number(pRadius);
    return (series || [])
      .filter(s => s.latitude && s.longitude)
      .map(s => ({ s, d: haversineMiles(userLat, userLng, s.latitude, s.longitude) }))
      .filter(x => x.d <= limit)
      .sort((a, b) => a.d - b.d)
      .map(x => x.s);
  }, [series, userLat, userLng, pRadius]);

  const nearbyTourSeriesCount = nearbyTours.length + nearbySeries.length;

  return (
    <LobbyPodConsole className="pnm-lobby-pod--venue-search">
      <LobbyPodControlPanel
        title="Discovery Controls"
        description="Set Location, Venue, Game, State, Buy-In, And Sort Preferences."
        icon="filter"
      >
        <div className="pnm-lobby-pod__field-row">
          <LobbyPodField label="Search Radius" icon="location">
            <select
              aria-label="Search Radius"
              value={pRadius}
              onChange={(e) => setFilters(prev => ({ ...prev, [`${prefix}Radius`]: e.target.value }))}
            >
              <option value="5">5 Miles</option>
              <option value="10">10 Miles</option>
              <option value="25">25 Miles</option>
              <option value="50">50 Miles</option>
              <option value="100">100 Miles</option>
              <option value="150">150 Miles</option>
              <option value="any">Any Distance</option>
            </select>
          </LobbyPodField>
          <LobbyPodField label="State" icon="filter">
            <select
              aria-label="Filter Venues By State"
              value={pState}
              onChange={(e) => setFilters(prev => ({ ...prev, [`${prefix}State`]: e.target.value }))}
            >
              <option value="all">All States</option>
              {PNM_US_STATE_CODES.map(st => <option key={st} value={st}>{st}</option>)}
            </select>
          </LobbyPodField>
        </div>

        <LobbyPodSegmentGroup
          label="Venue Type"
          value={pVenueType}
          options={[
            { value: 'all', label: 'All' },
            { value: 'casino', label: 'Casino' },
            { value: 'poker_club', label: 'Poker Club' },
            { value: 'home_game', label: 'Home Game' },
            { value: 'charity', label: 'Charity' },
            { value: 'poker_tour', label: 'Poker Tour' },
            { value: 'series', label: 'Series' },
          ]}
          onChange={(value) => setFilters(prev => ({ ...prev, [`${prefix}VenueType`]: value }))}
        />

        <LobbyPodSegmentGroup
          label="Game Type"
          value={pGameType}
          options={[
            { value: 'all', label: 'All Games' },
            { value: 'nlh', label: 'NLH' },
            { value: 'plo', label: 'PLO' },
            { value: 'mixed', label: 'Mixed' },
          ]}
          onChange={(value) => setFilters(prev => ({ ...prev, [`${prefix}GameType`]: value }))}
        />

        <div className="pnm-lobby-pod__field-row">
          {showBuyIn ? (
            <>
              <LobbyPodField label="Minimum Buy-In">
                <input
                  type="number"
                  aria-label="Minimum Buy-In"
                  placeholder="Minimum Buy-In"
                  value={pMinBuyin}
                  onChange={(e) => setFilters(prev => ({ ...prev, [`${prefix}MinBuyin`]: e.target.value }))}
                />
              </LobbyPodField>
              <LobbyPodField label="Maximum Buy-In">
                <input
                  type="number"
                  aria-label="Maximum Buy-In"
                  placeholder="Maximum Buy-In"
                  value={pMaxBuyin}
                  onChange={(e) => setFilters(prev => ({ ...prev, [`${prefix}MaxBuyin`]: e.target.value }))}
                />
              </LobbyPodField>
            </>
          ) : null}
          <LobbyPodField label="Sort Results" icon="more">
            <select
              aria-label="Sort Venue Results"
              value={pSort}
              onChange={(e) => setFilters(prev => ({ ...prev, [`${prefix}Sort`]: e.target.value }))}
            >
              {userLocation && <option value="distance">Nearest First</option>}
              <option value="trust">Trust Score</option>
              <option value="name">Name A-Z</option>
            </select>
          </LobbyPodField>
        </div>

        <div className="pnm-lobby-pod__actions">
          <LobbyPodAction
            variant={userLocation ? 'primary' : 'secondary'}
            onClick={handleGpsClick}
            disabled={gpsLoading}
          >
            {userLocation ? 'GPS Active' : gpsLoading ? 'Locating' : 'Enable GPS'}
          </LobbyPodAction>
          <LobbyPodAction variant="primary" onClick={handleSearch} disabled={loading}>
            {loading ? 'Searching' : title}
          </LobbyPodAction>
        </div>
      </LobbyPodControlPanel>

      {fetchError && (
        <LobbyPodState
          kind="error"
          title="Venue Directory Unavailable"
          action={onRetry ? (
            <LobbyPodAction variant="danger" onClick={onRetry} disabled={loading}>
              {loading ? 'Retrying Directory' : 'Retry Directory'}
            </LobbyPodAction>
          ) : null}
        >
          <p>{fetchError}</p>
        </LobbyPodState>
      )}

      {pSearched ? (
        <>
          <LobbyPodResultsBar
            onClear={() => setFilters(prev => ({ ...prev, [`${prefix}State`]: 'all', [`${prefix}VenueType`]: 'all', [`${prefix}GameType`]: 'all', [`${prefix}Radius`]: showBuyIn ? '50' : '100', [`${prefix}MinBuyin`]: '', [`${prefix}MaxBuyin`]: '', [`${prefix}Searched`]: false }))}
            clearLabel="Clear Venue Filters"
          >
            <strong>{results.length.toLocaleString()}</strong> {results.length === 1 ? 'Venue' : 'Venues'}
            {nearbyTourSeriesCount > 0 ? <> · <strong>{nearbyTourSeriesCount}</strong> {nearbyTourSeriesCount === 1 ? 'Tour Or Series' : 'Tours Or Series'}</> : null}
            {userLocation && pRadius !== 'any' ? <> · Within <strong>{pRadius} Mi</strong></> : null}
            {showBuyIn && pTournaments.length > 0 ? <> · <strong>{pTournaments.length}</strong> Tournaments</> : null}
          </LobbyPodResultsBar>

          {loading && results.length === 0 ? (
            <LobbyPodState kind="loading" title="Searching Venues">
              <p>Applying Your Location And Discovery Filters.</p>
            </LobbyPodState>
          ) : null}

          {results.length > 0 ? (
            <>
              <LobbyPodCardList>
                {results.map(v => {
                  const d = userLocation ? pDist(v) : null;
                  return (
                    <div key={v.id} className="pnm-lobby-pod__card-wrap">
                      {d !== null && d < 99999 && (
                        <LobbyPodDistance>{d < 1 ? `${(d * 5280).toFixed(0)} Ft` : `${d.toFixed(1)} Mi`}</LobbyPodDistance>
                      )}
                      <VenueCard venue={v} isFavorited={!!favorites['venue-' + v.id]}
                        onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(v.id, v); }}
                        onNavigate={(url) => handleVenueNavigate(url, v)}
                        userLocation={userLocation} checkinCount={checkinCounts[String(v.id)] || 0} reviewStats={reviewStatsMap[String(v.id)]} />
                    </div>
                  );
                })}
              </LobbyPodCardList>
              {/* [AUDIT] `results` is a client-side filter over the venues the
                  page has LOADED, not over the catalogue. The page maintained
                  `hasMore` / `loadMore` for exactly this control and no UI ever
                  rendered it, so a user in a dense market (Las Vegas, LA, South
                  Florida) was silently capped at the first page of results with
                  no indication that more existed. */}
              {hasMore && typeof loadMore === 'function' && (
                <div className="pnm-lobby-pod__actions">
                  <LobbyPodAction
                    variant="secondary"
                    onClick={loadMore}
                    disabled={loading}
                  >
                    {loading ? 'Loading Venues' : 'Load More Venues'}
                  </LobbyPodAction>
                </div>
              )}
            </>
          ) : !loading ? (
            <LobbyPodState kind="empty" title="No Results Found">
              <p>Try Expanding Distance, Changing Venue Type, Or Selecting A Different State.</p>
            </LobbyPodState>
          ) : null}

          {nearbyTourSeriesCount > 0 && (
            <>
              <LobbyPodInfoPanel icon="trophy" title="Poker Tours And Series Nearby">
                {nearbyTours.length} {nearbyTours.length === 1 ? 'Tour' : 'Tours'} · {nearbySeries.length} Series · {pRadius === 'any' ? 'Any Distance' : `Within ${pRadius} Mi`}
              </LobbyPodInfoPanel>
              <LobbyPodCardList>
                {nearbyTours.map((t, i) => {
                  const td = userLocation ? getNearestTourDistance(t, userLocation) : null;
                  return (
                    <div key={`tour-${t.id || t.tour_code || i}`} className="pnm-lobby-pod__card-wrap">
                      {td !== null && td < 99999 && (
                        <LobbyPodDistance>{td < 1 ? `${(td * 5280).toFixed(0)} Ft` : `${td.toFixed(1)} Mi`}</LobbyPodDistance>
                      )}
                      <TourCard tour={t} isFavorited={!!favorites['tour-' + (t.id || t.tour_code)]} onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(t.id || t.tour_code, t, 'tour'); }} onNavigate={(path) => router.push(path)} />
                    </div>
                  );
                })}
                {nearbySeries.map((s, i) => {
                  const sd = userLocation ? haversineMiles(userLocation.lat, userLocation.lng, s.latitude, s.longitude) : null;
                  return (
                    <div key={`series-${s.id || i}`} className="pnm-lobby-pod__card-wrap">
                      {sd !== null && sd < 99999 && (
                        <LobbyPodDistance>{sd < 1 ? `${(sd * 5280).toFixed(0)} Ft` : `${sd.toFixed(1)} Mi`}</LobbyPodDistance>
                      )}
                      <SeriesCard series={s} index={i} isFavorited={!!favorites['series-' + s.id]} onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(s.id, s, 'series'); }} onNavigate={(path) => router.push(path)} />
                    </div>
                  );
                })}
              </LobbyPodCardList>
            </>
          )}
        </>
      ) : (
        <LobbyPodState kind="intro" title={subtitle}>
          <p>{subtitleDesc}</p>
          <div className="pnm-lobby-pod__metrics">
            {/* Real counts only — show a neutral placeholder while venues load
                instead of fabricated "700+" / "47+" figures. */}
            <div className="pnm-lobby-pod__metric">
              <strong>{venues?.length ? venues.length.toLocaleString() : '-'}</strong>
              <span>Venues</span>
            </div>
            <div className="pnm-lobby-pod__metric">
              <strong>{venues?.length ? new Set(venues.map(v => v.state).filter(Boolean)).size : '-'}</strong>
              <span>States</span>
            </div>
          </div>
        </LobbyPodState>
      )}
    </LobbyPodConsole>
  );
};

export default React.memo(PodVenueSearchEngine);
