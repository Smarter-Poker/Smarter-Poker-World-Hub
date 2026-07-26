// ═══════════════════════════════════════════════════════════════════════
//  HOME GAMES NEAR ME
// ═══════════════════════════════════════════════════════════════════════
//
//  Phase 21 — dedicated discovery surface for home games. SEPARATE from
//  Poker Near Me (which surfaces venues, charities, tour events, AND
//  home groups as a side union). This page is home-games only.
//
//  Flow
//  ────
//    1. On mount, request browser geolocation.
//    2. On allow: fetch /api/public/home-games/discover with
//       lat/lng/radius_miles. The API:
//         • Filters to public + active groups
//         • Applies the Phase 18 45-day inactivity auto-hide
//         • Haversine-filters by radius + sorts by distance ascending
//         • Jitters returned lat/lng ~0.3mi for host-privacy
//    3. Render cards sorted by distance, each linking to the group's
//       public page (/home-games/{slug} or fallback via club_code).
//    4. On deny: fall back to a manual state/city search. Still works
//       (radius filter is skipped when GPS not available).
//
//  Privacy model
//  ─────────────
//    - Only is_active=true AND is_private=false groups come back.
//    - Private groups are invisible to non-members.
//    - Lat/lng returned are jittered (Phase 2 jitterCoord). Exact host
//      address is only revealed to confirmed RSVPs (Phase 11 approval
//      flow) — not here.
// ═══════════════════════════════════════════════════════════════════════

import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  MapPin,
  Loader2,
  Users,
  Calendar,
  Clock,
  DollarSign,
  AlertCircle,
  Navigation,
  Search as SearchIcon,
  Home,
  ArrowLeft,
} from 'lucide-react';

const RADIUS_OPTIONS = [
  { value: 10,  label: '10 mi' },
  { value: 25,  label: '25 mi' },
  { value: 50,  label: '50 mi' },
  { value: 100, label: '100 mi' },
  { value: 250, label: '250 mi' },
];

// US state abbreviations for the manual-fallback select
const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

function formatStakes(minBuyin, maxBuyin, stakes) {
  if (stakes) return stakes;
  if (minBuyin != null && maxBuyin != null) return `$${minBuyin}–$${maxBuyin}`;
  if (minBuyin != null) return `$${minBuyin}+`;
  return 'Stakes TBD';
}

// Every home-games page lives under /hub/home-games — there is no top-level
// /home-games route and no rewrite for one, so a bare `/home-games/...` href
// is a guaranteed 404.
//
// The canonical destination is the group's social-page slug. Club/invite codes
// are NOT valid segments of /hub/home-games/in/[state] (that route parses its
// segment as a state slug and 404s on anything else), so a group without a
// slug falls back to the state listing it appears on, then to this page.
function groupHref(g) {
  if (g.slug) return `/hub/home-games/${g.slug}`;
  if (g.state) return `/hub/home-games/in/${String(g.state).toLowerCase()}`;
  return '/hub/home-games/near-me';
}

export default function HomeGamesNearMePage() {
  const [status, setStatus]   = useState('idle');   // idle | locating | searching | ready | error | denied
  const [error, setError]     = useState(null);
  const [coords, setCoords]   = useState(null);     // { lat, lng }
  const [groups, setGroups]   = useState([]);
  const [radius, setRadius]   = useState(50);

  // Manual fallback for users who deny geolocation
  const [manualState, setManualState] = useState('');
  const [manualCity,  setManualCity]  = useState('');

  // Last search that was actually issued — lets the error card retry the
  // user's own query instead of re-prompting for geolocation.
  const lastSearchRef = useRef(null);
  // Monotonic request id. Only the newest in-flight search is allowed to
  // commit state, so a slow earlier response (retry + radius change
  // interleaving) can't overwrite newer results.
  const searchSeqRef = useRef(0);

  const search = useCallback(async (args) => {
    const { lat, lng, state, city, radiusMiles } = args || {};
    lastSearchRef.current = args || {};
    const seq = ++searchSeqRef.current;
    setStatus('searching');
    setError(null);
    try {
      const params = new URLSearchParams();
      if (lat != null && lng != null) {
        params.set('lat', String(lat));
        params.set('lng', String(lng));
        params.set('radius_miles', String(radiusMiles || 50));
      }
      if (state) params.set('state', state);
      if (city)  params.set('city', city);
      params.set('limit', '50');

      const res = await fetch(`/api/public/home-games/discover?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'discover failed');
      if (seq !== searchSeqRef.current) return; // superseded by a newer search
      setGroups(json.groups || []);
      setStatus('ready');
    } catch (e) {
      if (seq !== searchSeqRef.current) return; // superseded by a newer search
      setError(e.message || String(e));
      setStatus('error');
    }
  }, []);

  const requestGeolocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setStatus('denied');
      setError('Your browser does not support location. Use manual search below.');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat, lng });
        search({ lat, lng, radiusMiles: radius });
      },
      (err) => {
        setStatus('denied');
        if (err.code === err.PERMISSION_DENIED) {
          setError('Location access denied. You can still search by state/city below.');
        } else {
          setError(err.message || 'Could not get your location.');
        }
      },
      { timeout: 10000, enableHighAccuracy: false, maximumAge: 5 * 60 * 1000 }
    );
  }, [search, radius]);

  // Retry the last query the user actually ran. Falls back to re-requesting
  // geolocation only when no search has been issued yet — a manual searcher
  // who already declined the permission prompt should never be re-prompted.
  const retryLastSearch = useCallback(() => {
    if (lastSearchRef.current) {
      search(lastSearchRef.current);
      return;
    }
    requestGeolocation();
  }, [search, requestGeolocation]);

  // Auto-prompt on mount (respects the browser's permission dialog)
  useEffect(() => { requestGeolocation(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // When the user changes radius, re-search. Also fires after a failed
  // search ('error') — otherwise the pill highlight moves but nothing
  // happens and the only way out is a full page reload.
  useEffect(() => {
    if (coords && (status === 'ready' || status === 'error')) {
      search({ lat: coords.lat, lng: coords.lng, radiusMiles: radius });
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [radius]);

  function handleManualSearch(e) {
    e.preventDefault();
    search({
      state: manualState || undefined,
      city:  manualCity || undefined,
    });
  }

  const isLoading = status === 'locating' || status === 'searching';

  return (
    <div className="min-h-screen bg-[#0A1526] text-white" style={{ fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <Head>
        <title>Home Games Near Me — Smarter Poker</title>
        <meta name="description" content="Find local poker home games near you. Get invited to private games, tournaments, and cash games hosted by players in your area." />
        <meta name="robots" content="index, follow" />
      </Head>

      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-[#1E293B] bg-[#0A1526]/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/hub/home-games/in" className="text-[#94A3B8] hover:text-white flex items-center gap-1">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm">Home Games</span>
          </Link>
          <div className="flex-1" />
          <Link href="https://commander.smarter.poker/commander/register?tier=home_game&from=poker_near_me&return=%2Fhub%2Fcommander%2Fhome-games%2Fcreate" className="cmd-btn cmd-btn-primary h-9 px-4 text-xs">
            Host a Game
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="cmd-panel p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-[#22D3EE]/15 flex items-center justify-center">
              <Home className="w-5 h-5 text-[#22D3EE]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Home Games Near Me</h1>
              <p className="text-sm text-[#64748B]">Find local home games and tournaments hosted by players in your area</p>
            </div>
          </div>
        </div>

        {/* Radius selector (only when GPS granted) */}
        {coords && (
          <div className="cmd-panel p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-[#22D3EE]" />
                <span className="text-sm font-medium text-white">Within</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {RADIUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRadius(opt.value)}
                    disabled={isLoading}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                      radius === opt.value
                        ? 'border-[#22D3EE] bg-[#22D3EE]/15 text-[#22D3EE]'
                        : 'border-[#4A5E78] text-[#94A3B8] hover:bg-[#132240]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Manual fallback — shown whenever we have no GPS fix, not just on the
            first denial. Keyed off `coords` so the form survives a manual
            search (which flips status to searching/ready/error) and the user
            can refine or run another query without reloading the page. */}
        {!coords && status !== 'locating' && (
          <div className="cmd-panel p-5">
            {status === 'denied' && (
              <div className="flex items-start gap-2 mb-4">
                <AlertCircle className="w-5 h-5 text-[#F59E0B] flex-shrink-0 mt-0.5" />
                <p className="text-sm text-[#FCD34D]">{error || 'Search by state or city instead.'}</p>
              </div>
            )}
            <form onSubmit={handleManualSearch} className="grid sm:grid-cols-[120px_1fr_auto] gap-3">
              <select
                value={manualState}
                onChange={(e) => setManualState(e.target.value)}
                className="cmd-input h-10 px-3"
              >
                <option value="">State</option>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input
                type="text"
                value={manualCity}
                onChange={(e) => setManualCity(e.target.value)}
                placeholder="City (optional)"
                className="cmd-input h-10 px-3"
              />
              <button
                type="submit"
                disabled={!manualState && !manualCity}
                className="cmd-btn cmd-btn-primary h-10 px-4 text-sm flex items-center gap-2 disabled:opacity-50"
              >
                <SearchIcon className="w-4 h-4" />
                Search
              </button>
            </form>
          </div>
        )}

        {/* Error banner (non-denied) */}
        {status === 'error' && (
          <div className="cmd-panel p-4 border-l-4 border-[#EF4444]">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-[#EF4444] flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">Search failed</p>
                <p className="text-sm text-[#94A3B8] mt-0.5">{error}</p>
              </div>
              <button
                onClick={retryLastSearch}
                className="cmd-btn cmd-btn-secondary h-8 px-3 text-xs"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="cmd-panel p-8 flex flex-col items-center text-center">
            <Loader2 className="w-8 h-8 text-[#22D3EE] animate-spin mb-3" />
            <p className="text-sm text-white font-medium">
              {status === 'locating' ? 'Finding your location…' : 'Searching nearby home games…'}
            </p>
          </div>
        )}

        {/* Results */}
        {status === 'ready' && groups.length === 0 && (
          <div className="cmd-panel p-8 text-center">
            <Home className="w-10 h-10 text-[#64748B] mx-auto mb-3" />
            <h3 className="text-base font-semibold text-white">No home games found nearby</h3>
            <p className="text-sm text-[#64748B] mt-1">
              {coords ? `Try expanding your radius or starting one yourself.` : 'Try a different state or city.'}
            </p>
            <Link href="https://commander.smarter.poker/commander/register?tier=home_game&from=poker_near_me&return=%2Fhub%2Fcommander%2Fhome-games%2Fcreate" className="cmd-btn cmd-btn-primary h-10 px-5 text-sm inline-flex items-center gap-2 mt-4">
              Host a Home Game
            </Link>
          </div>
        )}

        {status === 'ready' && groups.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-[#64748B] font-medium">
              {groups.length} {groups.length === 1 ? 'game' : 'games'} found
              {coords ? ` within ${radius} miles` : (manualState ? ` in ${manualState}` : '')}
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              {groups.map((g) => (
                <Link key={g.id} href={groupHref(g)} className="block cmd-panel p-0 overflow-hidden hover:border-[#22D3EE]/50 transition-colors">
                  {/* Cover strip */}
                  <div
                    className="h-24 relative"
                    style={{
                      background: g.cover_url
                        ? `url(${g.cover_url}) center/cover`
                        : 'linear-gradient(135deg, #0D192E, #1E293B)',
                    }}
                  >
                    {g.distance_miles != null && (
                      <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-black/60 backdrop-blur-sm">
                        <p className="text-xs font-semibold text-[#22D3EE]">{g.distance_miles} mi</p>
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div
                        className="w-12 h-12 rounded-lg flex-shrink-0 bg-[#1E293B] flex items-center justify-center"
                        style={g.avatar_url ? { background: `url(${g.avatar_url}) center/cover` } : undefined}
                      >
                        {!g.avatar_url && <Home className="w-5 h-5 text-[#64748B]" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-white truncate">{g.name}</h3>
                        <p className="text-xs text-[#94A3B8] mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {g.city}{g.state ? `, ${g.state}` : ''}
                        </p>
                      </div>
                    </div>

                    {g.description && (
                      <p className="text-sm text-[#94A3B8] mt-3 line-clamp-2">{g.description}</p>
                    )}

                    <div className="flex flex-wrap gap-3 mt-3 text-xs text-[#64748B]">
                      {(g.default_game_type || g.default_stakes) && (
                        <div className="flex items-center gap-1">
                          <DollarSign className="w-3.5 h-3.5 text-[#10B981]" />
                          <span>
                            {g.default_game_type ? g.default_game_type.toUpperCase() : ''}
                            {g.default_game_type && g.default_stakes ? ' · ' : ''}
                            {formatStakes(g.typical_buyin_min, g.typical_buyin_max, g.default_stakes)}
                          </span>
                        </div>
                      )}
                      {g.typical_day && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-[#8B5CF6]" />
                          <span>{g.typical_day}{g.typical_time ? ` · ${g.typical_time}` : ''}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-[#22D3EE]" />
                        <span>{g.member_count} {g.member_count === 1 ? 'member' : 'members'}</span>
                      </div>
                    </div>

                    {g.next_game_date && (
                      <div className="mt-3 p-2 rounded-md bg-[#8B5CF6]/10 border border-[#8B5CF6]/25 flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-[#C4B5FD] flex-shrink-0" />
                        <span className="text-xs text-[#C4B5FD] truncate">
                          Next game: {g.next_game_date}{g.next_game_time ? ` · ${g.next_game_time}` : ''}
                          {g.next_game_seats_left != null ? ` · ${g.next_game_seats_left} seats left` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
