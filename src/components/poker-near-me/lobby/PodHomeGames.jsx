/**
 * PodHomeGames.jsx — "Home Games" tab inside the PNM lobby.
 *
 * UNIFIED DATA SOURCE: /api/public/home-games/discover
 *   Pulls from commander_home_groups (the canonical home-game table) joined
 *   with their social_pages. This is the SAME feed as /hub/home-games, so a
 *   home game listed via any surface (PNM create form, Commander dashboard,
 *   or social-pages create) appears here automatically — no dual writes,
 *   no separate venue_type='home_game' hack.
 *
 * Poker clubs (venue_type='poker_club' in poker_venues) are a different
 * system and are NOT rendered here. They live in the "Poker Clubs" or
 * "Near You" tab of the PNM lobby.
 */

import React, { useCallback } from 'react';
import dynamic from 'next/dynamic';
import VenueCard from '../VenueCard';
import { cachedFetch } from './PnmApiCache';

const CreateHomeGame = dynamic(() => import('../CreateHomeGame'), { ssr: false });

// Map a commander_home_groups-shaped row (as returned by the public discover
// API) into the venue-shaped object VenueCard expects. This adapter lets us
// keep the existing VenueCard UI while pulling from the canonical home-game
// feed. Navigation is routed to /hub/home-games/[slug].
function adaptHomeGameToVenueShape(g) {
  const stakesArr = g.default_stakes ? [g.default_stakes] : [];
  const gameTypeLabel = (g.default_game_type || '').toString().toUpperCase();
  const gamesOffered = gameTypeLabel ? [gameTypeLabel] : [];
  return {
    id: g.id,
    name: g.name,
    // Tell VenueCard this is a home game (not a poker room / club / casino).
    venue_type: 'home_game',
    city: g.city,
    state: g.state,
    country: g.country || 'US',
    latitude: g.approximate_lat ?? g.latitude ?? null,
    longitude: g.approximate_lng ?? g.longitude ?? null,
    lat: g.approximate_lat ?? g.latitude ?? null,
    lng: g.approximate_lng ?? g.longitude ?? null,
    games_offered: gamesOffered,
    stakes_cash: stakesArr,
    about: g.description || g.tagline || '',
    tagline: g.tagline || '',
    trust_score: 3.0,
    is_active: true,
    is_featured: false,
    cover_photo_url: g.cover_url || null,
    profile_photo_url: g.avatar_url || null,
    logo_url: g.avatar_url || null,
    follower_count: g.saves_count || g.follower_count || 0,
    poker_tables: 1,
    // Canonical identifiers used by onNavigate — prefer slug, fall back to code.
    slug: g.slug || null,
    invite_code: g.invite_code || null,
    club_code: g.club_code || null,
    // Preserve useful extras for card decorations if VenueCard knows them.
    host_display_name: g.host_display_name || null,
    member_count: g.member_count || 0,
    games_hosted: g.games_hosted || 0,
    next_game_date: g.next_game_date || null,
    next_game_title: g.next_game_title || null,
    next_game_seats_left: g.next_game_seats_left ?? null,
  };
}

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

  // Only the canonical home-game feed populates this list. We no longer
  // pull from `venues.filter(v => v.venue_type === 'home_game')` — that
  // table is for commercial poker rooms and never contains home games.
  const displayGames = Array.isArray(podHomeGames) ? podHomeGames : [];

  const handleSearch = useCallback(() => {
    setFilters(prev => ({ ...prev, hgHasSearched: true }));
    const params = new URLSearchParams();
    params.set('limit', '100');
    if (hgState && hgState !== 'all') params.set('state', hgState);
    if (hgSearch && hgSearch.trim()) params.set('search', hgSearch.trim());
    const url = `/api/public/home-games/discover?${params.toString()}`;
    setLoading(true);
    cachedFetch(url)
      .then(data => {
        const groups = Array.isArray(data?.groups) ? data.groups : [];
        setPodHomeGames(groups.map(adaptHomeGameToVenueShape));
      })
      .catch(err => {
        console.warn('[PodHomeGames] discover fetch failed:', err);
        setPodHomeGames([]);
      })
      .finally(() => setLoading(false));
  }, [hgSearch, hgState, setFilters, setLoading, setPodHomeGames]);

  // Unified per-card navigation: always route to the canonical
  // /hub/home-games/[slug] page, never /hub/venues/[id] (which is for
  // commercial venues only).
  const navigateToHomeGame = useCallback((venue) => {
    if (venue?.slug) {
      handleVenueNavigate(`/hub/home-games/${venue.slug}`, venue);
    } else if (venue?.club_code) {
      handleVenueNavigate(`/home-game/${venue.club_code}`, venue);
    } else if (venue?.invite_code) {
      handleVenueNavigate(`/home-game/${venue.invite_code}`, venue);
    }
  }, [handleVenueNavigate]);

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
            <button onClick={() => { setPodHomeGames([]); setFilters(prev => ({ ...prev, hgSearch: '', hgState: 'all', hgHasSearched: false })); }}
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
                onNavigate={() => navigateToHomeGame(v)}
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
          {filters.showCreateHomeGame ? 'Hide' : 'List Your Home Game On Poker Near Me'}
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
              onCancel={() => setFilters(prev => ({ ...prev, showCreateHomeGame: false }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
