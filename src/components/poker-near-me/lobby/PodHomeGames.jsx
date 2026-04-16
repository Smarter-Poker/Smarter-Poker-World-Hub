import React from 'react';
import dynamic from 'next/dynamic';
import VenueCard from '../VenueCard';
import { cachedFetch } from '../pnm-utils';

const CreateHomeGame = dynamic(() => import('../CreateHomeGame'), { ssr: false });

export default function PodHomeGames({
  filters, setFilters,
  venues, podHomeGames, setPodHomeGames,
  userId,
  userLocation,
  loading, setLoading,
  favorites, handleToggleFavorite,
  checkinCounts, reviewStatsMap,
  handleVenueNavigate,
  onHomeGameCreated
}) {
  const hgSearch = filters.hgSearch || '';
  const hgState = filters.hgState || 'all';
  const hgHasSearched = filters.hgHasSearched || false;
  
  let homeGames = venues.filter(v => v.venue_type === 'home_game');
  if (hgSearch) {
    const lower = hgSearch.toLowerCase();
    homeGames = homeGames.filter(v => (v.name || '').toLowerCase().includes(lower) || (v.city || '').toLowerCase().includes(lower) || (v.state || '').toLowerCase().includes(lower));
  }
  if (hgState !== 'all') homeGames = homeGames.filter(v => v.state === hgState);

  // If we have API fetched results specifically for pod, we use them if we searched via API
  // However, the original code overwrites setPodHomeGames but relies back on filtering `venues`.
  // Wait, let's fix it so it actually uses podHomeGames if it exists, or defaults back to filtered venues.
  // Actually, the original code just read `venues.filter(...)` and ignored `podHomeGames` ! Wait, it fetched and set `setPodHomeGames(newVenues)` but then rendered `homeGames` which was derived from `venues`. This means the fetch result was completely ignored in UI! 
  // We will honor the fetch result if `hgHasSearched` and `podHomeGames` is populated.
  const displayGames = (hgHasSearched && podHomeGames && podHomeGames.length > 0) ? podHomeGames : homeGames;

  const handleSearch = () => {
    setFilters(prev => ({ ...prev, hgHasSearched: true }));
    // Fetch home games from API with venue_type filter
    const hgApiState = hgState !== 'all' ? `&state=${hgState}` : '';
    const hgApiSearch = hgSearch ? `&search=${encodeURIComponent(hgSearch)}` : '';
    const hgApiLoc = userLocation ? `&lat=${userLocation.lat}&lng=${userLocation.lng}` : '';
    const hgUrl = `/api/poker/venues?limit=200&offset=0&venue_type=home_game${hgApiState}${hgApiSearch}${hgApiLoc}`;
    setLoading(true);
    cachedFetch(hgUrl).then(data => {
      const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
      setPodHomeGames(newVenues);
    }).catch(err => console.error('Home games fetch failed:', err))
    .finally(() => setLoading(false));
  };

  return (
    <div>
      {/* Search parameters */}
      <div style={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(48,54,61,0.8)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" placeholder="Search Home Games..." value={hgSearch} autoComplete="off"
            onChange={(e) => setFilters(prev => ({ ...prev, hgSearch: e.target.value }))}
            style={{ flex: 1, minWidth: 120, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(48,54,61,0.6)', background: '#161b22', color: '#c9d1d9', fontSize: 13, fontFamily: 'inherit' }} />
          <select value={hgState}
            onChange={(e) => setFilters(prev => ({ ...prev, hgState: e.target.value }))}
            style={{ background: '#161b22', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, padding: '8px 10px', color: '#c9d1d9', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', minWidth: 90 }}>
            <option value="all">All States</option>
            {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(st => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>
        <button onClick={handleSearch}
          style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: '1px solid rgba(63,185,80,0.4)', background: 'linear-gradient(135deg, #238636, #196c2e)', color: '#ffffff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(35,134,54,0.3)' }}>
          Find Home Games
        </button>
      </div>

      {hgHasSearched ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '6px 10px', background: 'rgba(22,27,34,0.8)', borderRadius: 8, border: '1px solid rgba(48,54,61,0.6)' }}>
            <span style={{ fontSize: 12, color: '#c9d1d9' }}>
              <span style={{ color: '#d4a853', fontWeight: 800 }}>{displayGames.length}</span> home game{displayGames.length !== 1 ? 's' : ''}
            </span>
            <button onClick={() => setFilters(prev => ({ ...prev, hgSearch: '', hgState: 'all', hgHasSearched: false }))}
              style={{ background: 'none', border: 'none', color: '#8b949e', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>Clear</button>
          </div>
          {loading && <div style={{ display: 'grid', gap: 12 }}>
            {[1,2,3].map(n => <div key={n} style={{ height: 80, borderRadius: 12, background: 'linear-gradient(90deg, rgba(30,40,55,0.5) 25%, rgba(50,60,80,0.5) 50%, rgba(30,40,55,0.5) 75%)', backgroundSize: '200% 100%', animation: 'pnm-shimmer 1.5s ease-in-out infinite', border: '1px solid rgba(148,163,184,0.08)' }} />)}
          </div>}
          <div style={{ display: 'grid', gap: 12 }}>
            {displayGames.map(v => (
              <VenueCard
                key={v.id}
                venue={v}
                isFavorited={!!favorites['venue-' + v.id]}
                onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(v.id, v); }}
                onNavigate={(url) => handleVenueNavigate(url, v)}
                userLocation={userLocation}
                checkinCount={checkinCounts[String(v.id)] || 0}
                reviewStats={reviewStatsMap[String(v.id)]}
              />
            ))}
          </div>
          {displayGames.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>
              <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: '#c9d1d9' }}>No Home Games Found</p>
              <p style={{ fontSize: 13 }}>Try a Different Search or State Filter.</p>
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '30px 16px' }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="1" style={{ marginBottom: 14 }}>
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#c9d1d9', marginBottom: 6 }}>Find or List Home Games</p>
          <p style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.5 }}>Search for Home Games Near You or Filter by State. Use the Search Bar Above to Get Started.</p>
        </div>
      )}

      {/* List Your Home Game section */}
      <div style={{ marginTop: 16 }}>
        <button
          onClick={() => setFilters(prev => ({ ...prev, showCreateHomeGame: !prev.showCreateHomeGame }))}
          style={{
            width: '100%', padding: '12px 0',
            borderRadius: 12,
            border: filters.showCreateHomeGame ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(148,163,184,0.12)',
            background: filters.showCreateHomeGame ? 'rgba(34,197,94,0.08)' : 'rgba(212,168,83,0.04)',
            color: filters.showCreateHomeGame ? '#22c55e' : 'rgba(200,214,229,0.6)',
            fontSize: 14, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.2s',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {filters.showCreateHomeGame ? 'Cancel Listing' : 'List Your Home Game'}
        </button>
        {filters.showCreateHomeGame && (
          <div style={{
            marginTop: 12,
            background: 'rgba(13,17,23,0.95)',
            border: '1px solid rgba(34,197,94,0.2)',
            borderRadius: 14,
            overflow: 'hidden',
          }}>
            <CreateHomeGame
              userId={userId}
              onSuccess={(newVenue) => {
                if (newVenue && onHomeGameCreated) {
                  onHomeGameCreated(newVenue);
                }
                setFilters(prev => ({ ...prev, showCreateHomeGame: false, hgHasSearched: true }));
              }}
              onCancel={() => setFilters(prev => ({ ...prev, showCreateHomeGame: false }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
