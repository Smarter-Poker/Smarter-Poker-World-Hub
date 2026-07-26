import React from 'react';
import dynamic from 'next/dynamic';
import { haversineMiles, getNearestTourDistance } from '../pnm-utils';

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
  onRetry
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

  let results = venues || [];
  if (pState !== 'all') results = results.filter(v => v.state === pState);
  if (pVenueType !== 'all') results = results.filter(v => {
    if (pVenueType === 'poker_club') return v.venue_type === 'poker_club' || v.venue_type === 'card_room';
    if (pVenueType === 'poker_tour') return v.venue_type === 'poker_tour' || v.venue_type === 'tour_stop' || v.venue_type === 'tour';
    return v.venue_type === pVenueType;
  });
  
  if (pGameType !== 'all') {
    results = results.filter(v => {
      const g = (v.games_offered || []).join(' ').toLowerCase();
      if (pGameType === 'nlh') return g.includes('nlh') || g.includes('hold');
      if (pGameType === 'plo') return g.includes('plo') || g.includes('omaha');
      if (pGameType === 'mixed') return g.includes('mix') || g.includes('horse');
      return true;
    });
  }
  
  const pDist = (v) => {
    if (!userLocation || !v.latitude || !v.longitude) return 99999;
    return haversineMiles(userLocation.lat, userLocation.lng, v.latitude, v.longitude);
  };
  
  if (userLocation && pRadius !== 'any') results = results.filter(v => pDist(v) <= Number(pRadius));
  
  if (pSort === 'distance' && userLocation) results = [...results].sort((a, b) => pDist(a) - pDist(b));
  else if (pSort === 'trust') results = [...results].sort((a, b) => (b.trust_score || 0) - (a.trust_score || 0));
  else if (pSort === 'name') results = [...results].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const pTournaments = dailyTournaments ? dailyTournaments.filter(t => {
    if (pMinBuyin && (t.buy_in || 0) < Number(pMinBuyin)) return false;
    if (pMaxBuyin && (t.buy_in || 0) > Number(pMaxBuyin)) return false;
    return true;
  }) : [];

  const handleSearch = () => {
    triggerSearch();
  };

  const nearbyTours = userLocation ? tours.filter(t => {
    const d = getNearestTourDistance(t, userLocation);
    if (d === null) return false;
    return pRadius === 'any' || d <= Number(pRadius);
  // FIX: getNearestTourDistance can return null for tours with no coordinate data.
  // null - null = 0 (wrong, pushes no-location tours to top), null - 5 = -5 (incorrect order).
  // Coerce null → Infinity so they sort to the bottom, not the top.
  }).sort((a, b) => (getNearestTourDistance(a, userLocation) ?? Infinity) - (getNearestTourDistance(b, userLocation) ?? Infinity)) : [];
  
  const nearbySeries = userLocation ? series.filter(s => {
    if (!s.latitude || !s.longitude) return false;
    const d = haversineMiles(userLocation.lat, userLocation.lng, s.latitude, s.longitude);
    return pRadius === 'any' || d <= Number(pRadius);
  }).sort((a, b) => haversineMiles(userLocation.lat, userLocation.lng, a.latitude, a.longitude) - haversineMiles(userLocation.lat, userLocation.lng, b.latitude, b.longitude)) : [];
  
  const nearbyTourSeriesCount = nearbyTours.length + nearbySeries.length;

  return (
    <div>
      <div style={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(48,54,61,0.8)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <button onClick={handleGpsClick} disabled={gpsLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: userLocation ? '1px solid #3fb950' : gpsLoading ? '1px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(212,168,83,0.4)', background: userLocation ? 'rgba(63,185,80,0.15)' : gpsLoading ? 'rgba(255,255,255,0.1)' : 'rgba(212,168,83,0.08)', color: userLocation ? '#3fb950' : gpsLoading ? '#ffffff' : '#d4a853', fontSize: 13, fontWeight: 700, cursor: gpsLoading ? 'wait' : 'pointer', fontFamily: 'inherit', transition: 'all 0.2s' }}>
            {gpsLoading ? (
              <svg width="16" height="16" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="31" strokeDashoffset="10" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            )}
            {userLocation ? 'GPS Active' : gpsLoading ? 'Locating...' : 'Enable GPS'}
          </button>
          <select value={pRadius} onChange={(e) => setFilters(prev => ({ ...prev, [`${prefix}Radius`]: e.target.value }))}
            style={{ background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, padding: '8px 10px', color: '#c9d1d9', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>
            <option value="5">5 miles</option><option value="10">10 miles</option><option value="25">25 miles</option>
            <option value="50">50 miles</option><option value="100">100 miles</option><option value="150">150 miles</option><option value="any">Any distance</option>
          </select>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#8b949e', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 5 }}>Venue Type</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {[{k:'all',l:'All'},{k:'casino',l:'Casino'},{k:'poker_club',l:'Poker Club'},{k:'home_game',l:'Home Game'},{k:'charity',l:'Charity'},{k:'poker_tour',l:'Poker Tour'},{k:'series',l:'Series'}].map(t => (
              <button key={t.k} onClick={() => setFilters(prev => ({ ...prev, [`${prefix}VenueType`]: t.k }))}
                style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: pVenueType === t.k ? '1.5px solid #d4a853' : '1px solid rgba(48,54,61,0.6)', background: pVenueType === t.k ? 'rgba(212,168,83,0.12)' : 'rgba(22,27,34,0.6)', color: pVenueType === t.k ? '#d4a853' : '#8b949e', transition: 'all 0.15s' }}>{t.l}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#8b949e', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 5 }}>Game Type</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {[{k:'all',l:'All Games'},{k:'nlh',l:'NLH'},{k:'plo',l:'PLO'},{k:'mixed',l:'Mixed'}].map(g => (
              <button key={g.k} onClick={() => setFilters(prev => ({ ...prev, [`${prefix}GameType`]: g.k }))}
                style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: pGameType === g.k ? '1px solid #3fb950' : '1px solid rgba(48,54,61,0.6)', background: pGameType === g.k ? 'rgba(63,185,80,0.15)' : 'rgba(22,27,34,0.6)', color: pGameType === g.k ? '#3fb950' : '#8b949e', transition: 'all 0.15s' }}>{g.l}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <select value={pState} onChange={(e) => setFilters(prev => ({ ...prev, [`${prefix}State`]: e.target.value }))}
            style={{ background: '#161b22', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, padding: '6px 10px', color: '#c9d1d9', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', minWidth: 85 }}>
            <option value="all">All States</option>
            {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(st => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
          {showBuyIn && (
            <>
              <input type="number" placeholder="Min $" value={pMinBuyin}
                onChange={(e) => setFilters(prev => ({ ...prev, [`${prefix}MinBuyin`]: e.target.value }))}
                style={{ width: 60, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(48,54,61,0.6)', background: '#161b22', color: '#c9d1d9', fontSize: 11, fontFamily: 'inherit' }} />
              <input type="number" placeholder="Max $" value={pMaxBuyin}
                onChange={(e) => setFilters(prev => ({ ...prev, [`${prefix}MaxBuyin`]: e.target.value }))}
                style={{ width: 60, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(48,54,61,0.6)', background: '#161b22', color: '#c9d1d9', fontSize: 11, fontFamily: 'inherit' }} />
            </>
          )}
          <select value={pSort} onChange={(e) => setFilters(prev => ({ ...prev, [`${prefix}Sort`]: e.target.value }))}
            style={{ background: '#161b22', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, padding: '6px 10px', color: '#c9d1d9', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer' }}>
            {userLocation && <option value="distance">Nearest First</option>}
            <option value="trust">Trust Score</option>
            <option value="name">Name A-Z</option>
          </select>
        </div>

        <button onClick={handleSearch}
          style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: '1px solid rgba(63,185,80,0.4)', background: 'linear-gradient(135deg, #238636, #196c2e)', color: '#ffffff', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.5px', transition: 'all 0.15s', boxShadow: '0 4px 16px rgba(35,134,54,0.3)' }}>
          {title}
        </button>
      </div>

      {/* Venue fetch failure — surfaced with a retry affordance (was previously invisible) */}
      {fetchError && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.3)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#f85149' }}>{fetchError}</span>
          {onRetry && (
            <button onClick={onRetry} disabled={loading}
              style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(248,81,73,0.4)', background: 'rgba(248,81,73,0.12)', color: '#f85149', fontSize: 12, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
              {loading ? 'Retrying...' : 'Retry'}
            </button>
          )}
        </div>
      )}

      {pSearched ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '8px 12px', background: 'rgba(22,27,34,0.8)', borderRadius: 10, border: '1px solid rgba(48,54,61,0.6)' }}>
            <span style={{ fontSize: 13, color: '#c9d1d9' }}>
              <span style={{ color: '#d4a853', fontWeight: 800 }}>{results.length}</span> venue{results.length !== 1 ? 's' : ''}
              {nearbyTourSeriesCount > 0 && <span> · <span style={{ color: '#f59e0b', fontWeight: 700 }}>{nearbyTourSeriesCount}</span> tour{nearbyTourSeriesCount !== 1 ? 's/series' : ''}</span>}
              {userLocation && pRadius !== 'any' && <span> within <span style={{ color: '#3fb950' }}>{pRadius} mi</span></span>}
              {showBuyIn && pTournaments.length > 0 && <span> · <span style={{ color: '#d2a8ff', fontWeight: 700 }}>{pTournaments.length}</span> tournaments</span>}
            </span>
            <button onClick={() => setFilters(prev => ({ ...prev, [`${prefix}State`]: 'all', [`${prefix}VenueType`]: 'all', [`${prefix}GameType`]: 'all', [`${prefix}Radius`]: showBuyIn ? '50' : '100', [`${prefix}MinBuyin`]: '', [`${prefix}MaxBuyin`]: '', [`${prefix}Searched`]: false }))}
              style={{ background: 'none', border: 'none', color: '#8b949e', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>Clear</button>
          </div>
          {results.length > 0 ? (
            <>
              <div style={{ display: 'grid', gap: 12, marginBottom: 24 }}>
                {results.map(v => {
                  const d = userLocation ? pDist(v) : null;
                  return (
                    <div key={v.id} style={{ position: 'relative' }}>
                      {d !== null && d < 99999 && (
                        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, padding: '3px 8px', borderRadius: 6, background: 'rgba(63,185,80,0.15)', border: '1px solid rgba(63,185,80,0.3)', fontSize: 11, fontWeight: 700, color: '#3fb950' }}>
                          {d < 1 ? `${(d * 5280).toFixed(0)} ft` : `${d.toFixed(1)} mi`}
                        </div>
                      )}
                      <VenueCard venue={v} isFavorited={!!favorites['venue-' + v.id]}
                        onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(v.id, v); }}
                        onNavigate={(url) => handleVenueNavigate(url, v)}
                        userLocation={userLocation} checkinCount={checkinCounts[String(v.id)] || 0} reviewStats={reviewStatsMap[String(v.id)]} />
                    </div>
                  );
                })}
              </div>
              {/* NOTE: no client-side "Load More" here — `results` is fully
                  rendered above (it's a client-filtered list, not a page). */}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 12, opacity: 0.3 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No Results Found</p>
              <p style={{ fontSize: 13 }}>Try Expanding Distance, Changing Venue Type, or Selecting a Different State.</p>
            </div>
          )}
          {nearbyTourSeriesCount > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '10px 14px', background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(212,168,83,0.06))', borderRadius: 12, border: '1px solid rgba(245,158,11,0.2)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#f59e0b', letterSpacing: '0.3px' }}>Poker Tours & Series Nearby</div>
                  <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>{nearbyTours.length} tour{nearbyTours.length !== 1 ? 's' : ''} · {nearbySeries.length} series within {pRadius === 'any' ? 'range' : pRadius + ' mi'}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {nearbyTours.map((t, i) => {
                  const td = userLocation ? getNearestTourDistance(t, userLocation) : null;
                  return (
                    <div key={`tour-${t.id || t.tour_code || i}`} style={{ position: 'relative' }}>
                      {td !== null && td < 99999 && (
                        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, padding: '3px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>
                          {td < 1 ? `${(td * 5280).toFixed(0)} ft` : `${td.toFixed(1)} mi`}
                        </div>
                      )}
                      <TourCard tour={t} isFavorited={!!favorites['tour-' + (t.id || t.tour_code)]} onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(t.id || t.tour_code, t, 'tour'); }} onNavigate={(path) => router.push(path)} />
                    </div>
                  );
                })}
                {nearbySeries.map((s, i) => {
                  const sd = userLocation ? haversineMiles(userLocation.lat, userLocation.lng, s.latitude, s.longitude) : null;
                  return (
                    <div key={`series-${s.id || i}`} style={{ position: 'relative' }}>
                      {sd !== null && sd < 99999 && (
                        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, padding: '3px 8px', borderRadius: 6, background: 'rgba(210,168,255,0.15)', border: '1px solid rgba(210,168,255,0.3)', fontSize: 11, fontWeight: 700, color: '#d2a8ff' }}>
                          {sd < 1 ? `${(sd * 5280).toFixed(0)} ft` : `${sd.toFixed(1)} mi`}
                        </div>
                      )}
                      <SeriesCard series={s} index={i} isFavorited={!!favorites['series-' + s.id]} onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(s.id, s, 'series'); }} onNavigate={(path) => router.push(path)} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '30px 16px' }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="1" style={{ marginBottom: 16 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#c9d1d9', marginBottom: 8 }}>{subtitle}</p>
          <p style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.5, maxWidth: 320, margin: '0 auto' }}>
            {subtitleDesc}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 20, flexWrap: 'wrap' }}>
            {/* Real counts only — show a neutral placeholder while venues load
                instead of fabricated "700+" / "47+" figures. */}
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, color: '#d4a853' }}>{venues?.length ? venues.length.toLocaleString() : '—'}</div><div style={{ fontSize: 11, color: '#8b949e' }}>Venues</div></div>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, color: '#3fb950' }}>{venues?.length ? new Set(venues.map(v => v.state).filter(Boolean)).size : '—'}</div><div style={{ fontSize: 11, color: '#8b949e' }}>States</div></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(PodVenueSearchEngine);
