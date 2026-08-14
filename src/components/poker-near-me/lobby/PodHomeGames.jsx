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
// Build a rich stakes array from the discover API response.
// The host enters stakes as a freeform string (e.g. "NLH 1/2" or "PLO 2/5").
// We try to split it into per-game rows; if it looks like a single combined
// stake we just keep the whole string as one row. Additional game types
// (typical_buyin_min/max) also generate a formatted row.
function buildStakesArray(g) {
  const rows = [];

  // Primary stake — split on commas/semicolons if the host listed multiple
  if (g.default_stakes) {
    const parts = String(g.default_stakes).split(/[,;]+/).map(s => s.trim()).filter(Boolean);
    parts.forEach(p => rows.push(p));
  }

  // If the host set a buyin range but no stakes string, synthesise one
  if (rows.length === 0 && (g.typical_buyin_min || g.typical_buyin_max)) {
    const gameLabel = (g.default_game_type || 'NLH').toUpperCase();
    const min = g.typical_buyin_min ? `$${g.typical_buyin_min}` : '';
    const max = g.typical_buyin_max ? `$${g.typical_buyin_max}` : '';
    const range = min && max ? `${min}–${max} Buy-In` : (min || max ? `${min || max} Buy-In` : '');
    rows.push(`${gameLabel}${range ? ' · ' + range : ''}`);
  }

  return rows;
}

// Build a games_offered chip array from the discover API response.
function buildGamesOffered(g) {
  const chips = [];
  if (g.default_game_type) {
    chips.push((g.default_game_type || '').toUpperCase());
  }
  return chips;
}

// Build a synthetic daily_tournaments array from the group's next game
// so VenueCard's right column ("Today's Tournaments") shows the upcoming
// game — exactly the same pattern charity cards use.
function buildNextGameTournaments(g) {
  if (!g.next_game_date) return [];
  const today = new Date().toISOString().slice(0, 10);
  // Show if scheduled within the next 7 days (not just today)
  const diffDays = Math.round(
    (new Date(g.next_game_date) - new Date(today)) / 86400000
  );
  if (diffDays < 0 || diffDays > 7) return [];
  return [{
    id: `hg-next-${g.id}`,
    tournament_name: g.next_game_title || `${(g.default_game_type || 'Poker').toUpperCase()} Game`,
    start_time: g.next_game_time || null,
    buy_in: g.typical_buyin_min || 0,
    game_type: (g.default_game_type || 'NLH').toUpperCase(),
    _days_away: diffDays,
    _is_today: diffDays === 0,
  }];
}

function adaptHomeGameToVenueShape(g) {
  const stakesArr = buildStakesArray(g);
  const gamesOffered = buildGamesOffered(g);
  const nextGameTournaments = buildNextGameTournaments(g);

  // Host data comes from the discover API's nested `host` object
  const host = g.host || null;

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
    description: g.description || g.tagline || '',
    tagline: g.tagline || '',
    // No hardcoded trust_score — let VenueCard show "New" for groups with no reviews.
    // Only set if the group has an explicit rating in the future.
    trust_score: g.trust_score || 0,
    is_active: true,
    is_featured: false,
    cover_photo_url: g.cover_url || null,
    profile_photo_url: g.avatar_url || null,
    logo_url: g.avatar_url || null,
    follower_count: g.saves_count || g.follower_count || 0,
    poker_tables: 1,
    // Canonical identifiers used by onNavigate — prefer slug, fall back to code.
    slug: g.slug || null,
    club_code: g.club_code || null,
    // Host info — populated from discover API's `host` join
    host_display_name: host?.display_name || g.host_display_name || null,
    host_avatar_url: host?.avatar_url || null,
    host_id: host?.id || null,
    member_count: g.member_count || 0,
    games_hosted: g.games_hosted || 0,
    next_game_date: g.next_game_date || null,
    next_game_title: g.next_game_title || null,
    next_game_seats_left: g.next_game_seats_left ?? null,
    // Synthetic tournament list for VenueCard right column (next scheduled game)
    has_tournaments: nextGameTournaments.length > 0,
    daily_tournaments: nextGameTournaments,
    // Distance from discover API (Phase 21)
    distance_mi: g.distance_miles ?? null,
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
  handleVenueNavigate
}) {
  // NOTE: no onHomeGameCreated prop — CreateHomeGame routes users through the
  // Club Commander wizard on another page (it never creates a listing
  // in-place), so there is no creation event to forward. New listings appear
  // via the discover API on the next search.
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
    // [WIRING FIX] Without lat/lng the discover endpoint takes its no-GPS branch
    // and returns the 100 largest public groups in the COUNTRY sorted by
    // member_count, with distance_miles null on every row. Sending the user's
    // coordinates switches it to the bounding-box + haversine + nearest-first
    // path, which is what "Find Home Games" is supposed to mean.
    //
    // ONLY for the unscoped browse, though: discover.js applies `state` /
    // `search` AND the GPS bounding box + radius filter together (see the GEO
    // PRE-FILTER block), so attaching coordinates to an explicit "state = NY"
    // or "search = Austin" query from a user sitting in California returns zero
    // rows. This pod is documented as "Search for Home Games Near You OR Filter
    // by State" — an explicit state/search is a request to look somewhere else,
    // and it must not be silently intersected with the user's own location.
    const hasExplicitScope = (hgState && hgState !== 'all') || !!(hgSearch && hgSearch.trim());
    if (!hasExplicitScope && userLocation?.lat != null && userLocation?.lng != null) {
      params.set('lat', String(userLocation.lat));
      params.set('lng', String(userLocation.lng));
      // No radius control exists in this pod, and home games are far sparser
      // than commercial rooms, so the unscoped default is the widest value the
      // rest of PNM allows (150) rather than the venue default of 50 — a
      // tighter box would hand most users an empty list where they previously
      // got a national one. hgRadius is honoured if a caller ever sets it.
      const parsedRadius = parseInt(filters.hgRadius, 10);
      params.set('radius_miles', String(!parsedRadius || isNaN(parsedRadius) ? 150 : Math.min(parsedRadius, 150)));
    }
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
  }, [hgSearch, hgState, filters.hgRadius, userLocation, setFilters, setLoading, setPodHomeGames]);

  // Unified per-card navigation: always route to the canonical
  // /hub/home-games/[slug] page, never /hub/venues/[id] (which is for
  // commercial venues only).
  const navigateToHomeGame = useCallback((venue) => {
    if (venue?.slug) {
      handleVenueNavigate(`/hub/home-games/${venue.slug}`, venue);
    } else if (venue?.club_code) {
      handleVenueNavigate(`/home-game/${venue.club_code}`, venue);
    } else if (venue?.id) {
      // [STUB FIX] slug and club_code are both nullable on
      // commander_home_groups, and the discover API returns slug:null for any
      // group with no linked social_pages row. Without this branch the whole
      // card was rendered clickable but tapping it did nothing at all.
      // /api/poker/venues?id=<uuid> resolves UUIDs against commander_home_groups
      // (Phase 41), so the venue detail page renders these groups correctly.
      handleVenueNavigate(`/hub/venues/${venue.id}`, venue);
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
