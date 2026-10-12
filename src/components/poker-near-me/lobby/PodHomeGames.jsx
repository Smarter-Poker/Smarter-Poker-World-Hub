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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import VenueCard from '../VenueCard';
import { cachedFetch } from './PnmApiCache';
import { homeGameUrl } from '../../../lib/home-games/urls';
import LobbyPodConsole, {
  LobbyPodAction,
  LobbyPodCardList,
  LobbyPodControlPanel,
  LobbyPodField,
  LobbyPodPanel,
  LobbyPodResultsBar,
  LobbyPodState,
  PNM_US_STATE_CODES,
} from './LobbyPodConsole';

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
    const range = min && max ? `${min}-${max} Buy-In` : (min || max ? `${min || max} Buy-In` : '');
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
    // UNIFICATION (audit 2026-08-14): canonical destination from the shared
    // builder, so VenueMap popups and card buttons agree with the marker.
    detailUrl: homeGameUrl(g),
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
    // discover nests host as {id, display_name, avatar_url}; the old
    // `g.host_display_name` tail read a key discover never emits.
    host_display_name: host?.display_name || null,
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
  const [discoverError, setDiscoverError] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [nextOffset, setNextOffset] = useState(null);
  const [discoverTotal, setDiscoverTotal] = useState(null);
  const requestRef = useRef(null);
  useEffect(() => () => { requestRef.current = null; }, []);

  // Only the canonical home-game feed populates this list. We no longer
  // pull from `venues.filter(v => v.venue_type === 'home_game')` — that
  // table is for commercial poker rooms and never contains home games.
  const displayGames = Array.isArray(podHomeGames) ? podHomeGames : [];

  const fetchPage = useCallback(async (request, offset) => {
    if (requestRef.current !== request || request.busy) return;
    request.busy = true;
    setDiscovering(true);
    setDiscoverError('');
    const params = new URLSearchParams(request.params);
    params.set('offset', String(offset));
    try {
      const data = await cachedFetch(`/api/public/home-games/discover?${params.toString()}`);
      if (requestRef.current !== request) return;
      if (!Array.isArray(data?.groups) || data.success === false) throw new Error('Invalid discover response');
      const pagination = data.pagination;
      if (typeof pagination?.has_more !== 'boolean') throw new Error('Invalid discover pagination');
      let next = null;
      if (pagination?.has_more === true) {
        next = pagination.next_offset;
        if (!Number.isSafeInteger(next) || next <= offset || request.offsets.has(next)) {
          throw new Error('Invalid discover continuation');
        }
      } else if (pagination?.has_more != null && pagination.has_more !== false) {
        throw new Error('Invalid discover pagination');
      }
      const rows = new Map(request.rows.map(row => [String(row.id), row]));
      for (const group of data.groups) {
        if (group?.id == null || String(group.id).trim() === '') throw new Error('Missing home game identity');
        const id = String(group.id);
        if (!rows.has(id)) rows.set(id, adaptHomeGameToVenueShape(group));
      }
      request.rows = [...rows.values()];
      request.offsets.add(offset);
      request.next = next;
      setPodHomeGames(request.rows);
      setNextOffset(next);
      const total = pagination?.total ?? data.total;
      setDiscoverTotal(Number.isSafeInteger(total) && total >= request.rows.length ? total : null);
    } catch (err) {
      if (requestRef.current !== request) return;
      console.warn('[PodHomeGames] discover fetch failed:', err);
      setDiscoverError(request.rows.length
        ? 'More Home Games Are Temporarily Unavailable. Your Loaded Games Were Kept.'
        : 'Home Game Search Is Temporarily Unavailable.');
    } finally {
      if (requestRef.current === request) {
        request.busy = false;
        setDiscovering(false);
      }
    }
  }, [setPodHomeGames]);

  const handleClearSearch = useCallback(() => {
    requestRef.current = null;
    setDiscovering(false);
    setDiscoverError('');
    setNextOffset(null);
    setDiscoverTotal(null);
    setPodHomeGames([]);
    setFilters(prev => ({ ...prev, hgSearch: '', hgState: 'all', hgHasSearched: false }));
  }, [setFilters, setPodHomeGames]);

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
    const request = { params: params.toString(), rows: [], offsets: new Set(), next: null, busy: false };
    requestRef.current = request;
    setPodHomeGames([]);
    setNextOffset(null);
    setDiscoverTotal(null);
    void fetchPage(request, 0);
  }, [hgSearch, hgState, filters.hgRadius, userLocation, setFilters, setPodHomeGames, fetchPage]);

  const handleLoadMore = useCallback(() => {
    const request = requestRef.current;
    if (request && request.next != null) void fetchPage(request, request.next);
  }, [fetchPage]);

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
    <LobbyPodConsole className="pnm-lobby-pod--home-games">
      <LobbyPodControlPanel
        title="Home Game Discovery"
        description="Search The Canonical Club Commander Home Game Directory."
        icon="home"
      >
        <div className="pnm-lobby-pod__field-row">
          <LobbyPodField label="Home Game Search" icon="search">
            <input
              type="text"
              aria-label="Search Home Games"
              placeholder="Search Home Games..."
              value={hgSearch}
              autoComplete="off"
              onChange={(e) => setFilters(prev => ({ ...prev, hgSearch: e.target.value }))}
            />
          </LobbyPodField>
          <LobbyPodField label="State" icon="filter">
            <select
              aria-label="Filter Home Games By State"
              value={hgState}
              onChange={(e) => setFilters(prev => ({ ...prev, hgState: e.target.value }))}
            >
              <option value="all">All States</option>
              {PNM_US_STATE_CODES.map(st => <option key={st} value={st}>{st}</option>)}
            </select>
          </LobbyPodField>
        </div>
        <div className="pnm-lobby-pod__actions">
          <LobbyPodAction variant="primary" onClick={handleSearch} disabled={discovering}>
            {discovering ? 'Searching Home Games' : 'Find Home Games'}
          </LobbyPodAction>
        </div>
      </LobbyPodControlPanel>

      {hgHasSearched ? (
        <>
          <LobbyPodResultsBar
            onClear={handleClearSearch}
            clearLabel="Clear Home Game Search"
          >
            <strong>{displayGames.length}</strong> {displayGames.length === 1 ? 'Home Game' : 'Home Games'}
            {nextOffset != null ? ` Loaded${discoverTotal != null ? ` Of ${discoverTotal}` : ''}. More Games Available.` : ''}
          </LobbyPodResultsBar>

          {discoverError ? (
            <LobbyPodState
              kind="error"
              title="Home Game Search Unavailable"
              action={(
                <LobbyPodAction variant="danger" onClick={nextOffset != null ? handleLoadMore : handleSearch} disabled={discovering}>
                  {discovering ? 'Retrying Search' : nextOffset != null ? 'Retry More Home Games' : 'Retry Search'}
                </LobbyPodAction>
              )}
            >
              <p>{discoverError}</p>
            </LobbyPodState>
          ) : null}

          {discovering ? (
            <LobbyPodState kind="loading" title="Searching Home Games">
              <p>Checking The Club Commander Directory For Matching Public Games.</p>
            </LobbyPodState>
          ) : null}

          {displayGames.length > 0 ? (
            <LobbyPodCardList>
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
            </LobbyPodCardList>
          ) : null}

          {nextOffset != null && !discoverError ? (
            <div className="pnm-lobby-pod__actions">
              <LobbyPodAction onClick={handleLoadMore} disabled={discovering}>
                {discovering ? 'Loading More Home Games' : 'Load More Home Games'}
              </LobbyPodAction>
            </div>
          ) : null}

          {displayGames.length === 0 && !discovering && !discoverError ? (
            <LobbyPodState kind="empty" title="No Home Games Found">
              <p>Try A Different Search Or State Filter.</p>
            </LobbyPodState>
          ) : null}
        </>
      ) : (
        <LobbyPodState kind="intro" title="Find Or List Home Games">
          <p>Search For Home Games Near You Or Filter By State. Use The Search Controls Above To Get Started.</p>
        </LobbyPodState>
      )}

      <section className="pnm-lobby-pod__create-region" aria-label="List Your Home Game">
        <LobbyPodAction
          variant={filters.showCreateHomeGame ? 'primary' : 'secondary'}
          onClick={() => setFilters(prev => ({ ...prev, showCreateHomeGame: !prev.showCreateHomeGame }))}
          aria-expanded={Boolean(filters.showCreateHomeGame)}
        >
          {filters.showCreateHomeGame ? 'Hide Home Game Setup' : 'List Your Home Game'}
        </LobbyPodAction>
        {filters.showCreateHomeGame && (
          <LobbyPodPanel
            as="div"
            className="pnm-lobby-pod__create-panel"
            bodyClassName="pnm-lobby-pod__create-body"
          >
            <CreateHomeGame
              onCancel={() => setFilters(prev => ({ ...prev, showCreateHomeGame: false }))}
            />
          </LobbyPodPanel>
        )}
      </section>
    </LobbyPodConsole>
  );
}
