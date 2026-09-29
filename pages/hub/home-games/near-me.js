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

import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import PokerNearMeFamilyNav from '../../../src/components/poker-near-me/PokerNearMeFamilyNav';
import PokerNearMeConsole, {
  PokerNearMePanelShell,
  PokerNearMeConsoleIcon,
} from '../../../src/components/poker-near-me/PokerNearMeConsole';
import { useEffect, useState, useCallback, useRef } from 'react';
// The flat lucide set this page used to draw its chrome with is gone: every
// pictogram now comes from the painted Poker Near Me control kit, and anything
// the kit does not paint is printed as a text label instead.
import { hubCollectionSchema } from '../../../src/lib/seo/hubPageSchema';
import { createClient } from '@supabase/supabase-js';
import {
  US_STATES_BY_CODE,
  stateCodeToName,
  buildGeoUrl,
  isGroupPubliclyVisible,
} from '../../../src/lib/home-games/locationUtils';
import {
  fetchAllHomeGameDirectoryRows,
  fetchHomeGameGroupsInChunks,
} from '../../../src/lib/home-games/geoDirectoryServer.mjs';

// AEO phase 3 (2026-09-17): this page had copy and no structured data.
const NEAR_ME_SCHEMA = hubCollectionSchema({
  path: '/hub/home-games/near-me',
  name: 'Poker Home Games Near Me | Smarter.Poker',
  description:
    'Private Poker Home Games Near You: Cash Games And Tournaments Hosted By Players In Your Area, With The Stakes And Schedule Each Host Publishes.',
  trail: [['Hub', '/hub'], ['Home Games', '/hub/home-games'], ['Near Me', '/hub/home-games/near-me']],
});

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
  if (minBuyin != null && maxBuyin != null) return `$${minBuyin}-$${maxBuyin}`;
  if (minBuyin != null) return `$${minBuyin}+`;
  return 'Stakes TBD';
}

// Date/time from the API are raw DB values — `commander_home_games.scheduled_date`
// is a `date` and `start_time`/`typical_time` are `time` — so they render as
// '2026-08-12' and '19:00:00' unless formatted. Same helpers as the public
// group page (pages/hub/home-games/[slug].js). The date is parsed with an
// explicit T00:00:00 so it is local midnight, not UTC midnight shifted back a
// day for western timezones.
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(String(dateStr) + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  if (!Number.isFinite(h)) return String(t);
  const date = new Date();
  date.setHours(h || 0, m || 0, 0, 0);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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

// A FEED PAGE SHOWS ITS FEED (2026-09-22). This page is driven by the
// visitor's location, so the server cannot know which games are near them,
// and a crawler measured 93 words here: a heading and a search form. What the
// server can know is where public home games exist at all. It lists those
// cities, each linking to its /hub/home-games/in/[state]/[city] page, using
// the same visibility rule as that directory (public page, active non-private
// group, not auto-hidden). Only a city, a state and a count leave the server:
// no group names, hosts, ids, addresses or coordinates.
export async function getServerSideProps({ res }) {
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  const empty = { props: { publicCities: [] } };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return empty;
  try {
    const supabase = createClient(url, key);
    const pageResult = await fetchAllHomeGameDirectoryRows((from, to) => supabase
      .from('social_pages')
      .select('id, location_state, location_city, linked_entity_id')
      .eq('page_type', 'home_game')
      .eq('is_public', true)
      .not('location_state', 'is', null)
      .not('location_city', 'is', null)
      .order('id', { ascending: true })
      .range(from, to));
    if (pageResult.error || !pageResult.complete) return empty;
    const groupIds = pageResult.rows.map((p) => p.linked_entity_id).filter(Boolean);
    const groupResult = await fetchHomeGameGroupsInChunks(groupIds, (ids) => supabase
      .from('commander_home_groups')
      .select('id, is_active, is_private, last_activity_at, created_at, visibility_override_until')
      .in('id', ids));
    if (groupResult.error || !groupResult.complete) return empty;
    const groupMap = Object.fromEntries(groupResult.rows.map((g) => [String(g.id), g]));

    const byCity = new Map();
    for (const p of pageResult.rows) {
      const code = String(p.location_state || '').toUpperCase();
      const city = String(p.location_city || '').trim();
      if (!US_STATES_BY_CODE[code] || !city) continue;
      if (!isGroupPubliclyVisible(groupMap[String(p.linked_entity_id)])) continue;
      const href = buildGeoUrl(code, city);
      if (!href || href.split('/').length < 6) continue;
      const rec = byCity.get(href) || { href, city, stateName: stateCodeToName(code), count: 0 };
      rec.count += 1;
      byCity.set(href, rec);
    }
    const publicCities = Array.from(byCity.values())
      .sort((a, b) => a.stateName.localeCompare(b.stateName) || a.city.localeCompare(b.city));
    return { props: { publicCities } };
  } catch (e) {
    console.warn('[home-games/near-me] city directory unavailable:', e?.message || e);
    return empty;
  }
}

export default function HomeGamesNearMePage({ publicCities = [] }) {
  const [status, setStatus]   = useState('idle');   // idle | locating | searching | ready | error | denied
  const [error, setError]     = useState(null);
  const [coords, setCoords]   = useState(null);     // { lat, lng }
  const [groups, setGroups]   = useState([]);
  const [radius, setRadius]   = useState(50);

  // Which search the results on screen belong to. Geolocation used to be a
  // one-way door: once `coords` was set the manual form unmounted forever and
  // there was no way to browse another city (the single most common secondary
  // intent on a nationwide directory). `mode` decouples "we know where you are"
  // from "you are currently browsing near yourself".
  const [mode, setMode] = useState('nearby'); // 'nearby' | 'manual'
  // User explicitly opened the "search another city" panel while a GPS fix is held.
  const [manualOpen, setManualOpen] = useState(false);

  // Manual search — the fallback when geolocation is denied, and the explicit
  // "search another city" path when it was granted.
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
        setMode('nearby');
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
    if (mode === 'nearby' && coords && (status === 'ready' || status === 'error')) {
      search({ lat: coords.lat, lng: coords.lng, radiusMiles: radius });
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [radius]);

  function handleManualSearch(e) {
    e.preventDefault();
    // Switch the whole surface into manual mode so the header copy, the radius
    // pills and the empty state all describe the query the user actually ran.
    setMode('manual');
    search({
      state: manualState || undefined,
      city:  manualCity || undefined,
    });
  }

  // Back to "near me" without re-prompting for permission — we already hold
  // the fix in `coords`.
  function handleUseMyLocation() {
    if (!coords) {
      requestGeolocation();
      return;
    }
    setMode('nearby');
    search({ lat: coords.lat, lng: coords.lng, radiusMiles: radius });
  }

  // The manual form is always reachable: as the fallback when we have no fix,
  // and on demand (via "Search another city") when we do.
  const showManualForm = (!coords && status !== 'locating') || mode === 'manual' || manualOpen;
  const isNearbyMode = mode === 'nearby' && !!coords;

  const isLoading = status === 'locating' || status === 'searching';

  return (
    <div className="min-h-screen bg-[#0A1526] text-white" style={{ fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {/* audit M-5: this was the ONLY home-games surface using a raw next/head
          instead of SEOHead, so it emitted no <link rel="canonical">, no
          Open Graph and no Twitter tags — despite being the page every other
          home-games BreadcrumbList nominates as the "Home Games" node. */}
      <SEOHead
        title="Home Games Near Me"
        description="Find Local Poker Home Games Near You On Smarter.Poker: Private Cash Games And Tournaments Hosted By Players In Your Area, With The Stakes And Schedule Each Host Publishes. Free To Find And Free To Host."
        canonical="/hub/home-games/near-me"
        jsonLd={NEAR_ME_SCHEMA}
      />

      <PokerNearMeFamilyNav className="pnm-family-nav--standalone" />

      {/* Top bar */}
      <div className="pnm-location-topbar sticky top-0 z-10 border-b border-[#1E293B] bg-[#0A1526]/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/hub/home-games/in" className="text-[#94A3B8] flex items-center gap-1" style={{ minHeight: 44 }}>
            <PokerNearMeConsoleIcon name="back" />
            <span className="text-sm">Home Games</span>
          </Link>
          <div className="flex-1" />
          <Link href="https://commander.smarter.poker/commander/register?tier=home_game&from=poker_near_me&return=%2Fhub%2Fcommander%2Fhome-games%2Fcreate" className="cmd-btn cmd-btn-primary h-11 px-4 text-xs">
            Host A Game
          </Link>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6" data-pnm-secondary-foundation="interaction-v1">
        {/* Header. This is a public Poker Near Me route, so its chassis is the
            painted Poker Near Me console, not the Club Commander panel system
            it used to borrow. The crest, rails and closing cap are master art;
            the heading and the copy below are the only live DOM here. */}
        <PokerNearMeConsole
          crest="locator"
          eyebrow="Poker Near Me"
          title="Home Games Near Me"
          titleAs="h1"
          titleId="home-games-near-me-title"
          pill="Near Me"
          pillInk="blue"
          foot="foot"
        >
          <p className="pnc-copy">
            Find Local Home Games And Tournaments Hosted By Players In Your Area.
          </p>
        </PokerNearMeConsole>

        {/* Radius selector (only while browsing near the user's own position) */}
        {isNearbyMode && (
          <PokerNearMePanelShell>
            <div className="flex items-center justify-between gap-3 flex-wrap" style={{ paddingBottom: '3cqw' }}>
              <div className="flex items-center gap-2">
                <PokerNearMeConsoleIcon name="location" />
                <span className="pnc-label">Within</span>
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
              <button
                type="button"
                onClick={() => setManualOpen(true)}
                className="cmd-btn cmd-btn-secondary h-11 px-4 text-xs"
              >
                Search Another City
              </button>
            </div>
          </PokerNearMePanelShell>
        )}

        {/* Manual search — the fallback when we have no GPS fix, and an
            always-available escape hatch once we do. Granting location used to
            unmount this form permanently, leaving no way to browse another
            city (for a trip, say) short of a full page reload. */}
        {showManualForm && (
          <PokerNearMePanelShell>
            {coords && (
              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <p className="text-sm font-medium text-white">Search Another City</p>
                <button
                  type="button"
                  onClick={() => { setManualOpen(false); handleUseMyLocation(); }}
                  disabled={isLoading}
                  className="cmd-btn cmd-btn-secondary h-8 px-3 text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <PokerNearMeConsoleIcon name="location" />
                  Back To Near Me
                </button>
              </div>
            )}
            {status === 'denied' && (
              <div className="flex items-start gap-2 mb-4">
                <PokerNearMeConsoleIcon name="location" />
                <p className="pnc-copy pnc-ink--gold" role="status">{error || 'Search By State Or City Instead.'}</p>
              </div>
            )}
            <form onSubmit={handleManualSearch} className="grid sm:grid-cols-[120px_1fr_auto] gap-3" style={{ paddingBottom: '3cqw' }}>
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
                className="cmd-btn cmd-btn-primary h-11 px-4 text-sm flex items-center gap-2 disabled:opacity-50"
              >
                <PokerNearMeConsoleIcon name="search" />
                Search
              </button>
            </form>
          </PokerNearMePanelShell>
        )}

        {/* Error banner (non-denied) */}
        {status === 'error' && (
          <PokerNearMePanelShell role="alert">
            <div className="flex items-start gap-2" style={{ paddingBottom: '3cqw' }}>
              <PokerNearMeConsoleIcon name="info" />
              <div className="flex-1">
                <p className="pnc-label pnc-ink--red">Search Failed</p>
                <p className="pnc-copy">{error}</p>
              </div>
              <button
                type="button"
                onClick={retryLastSearch}
                className="cmd-btn cmd-btn-secondary h-11 px-4 text-xs"
              >
                Retry
              </button>
            </div>
          </PokerNearMePanelShell>
        )}

        {/* Loading state */}
        {isLoading && (
          <PokerNearMePanelShell aria-busy="true">
            <div className="flex flex-col items-center text-center" style={{ paddingBottom: '3cqw' }}>
              <PokerNearMeConsoleIcon name="location" />
              <p className="pnc-copy pnc-copy--center" role="status" aria-live="polite">
                {status === 'locating' ? 'Finding Your Location…' : 'Searching Nearby Home Games…'}
              </p>
            </div>
          </PokerNearMePanelShell>
        )}

        {/* Results */}
        {status === 'ready' && groups.length === 0 && (
          <PokerNearMePanelShell>
            <div className="text-center" style={{ paddingBottom: '3cqw' }}>
              <PokerNearMeConsoleIcon name="home" />
              <h2 className="pnc-label">No Home Games Found Nearby</h2>
              <p className="pnc-copy pnc-copy--center">
                {isNearbyMode ? 'Try Expanding Your Radius, Or Start A Game Yourself.' : 'Try A Different State Or City.'}
              </p>
              <Link href="https://commander.smarter.poker/commander/register?tier=home_game&from=poker_near_me&return=%2Fhub%2Fcommander%2Fhome-games%2Fcreate" className="cmd-btn cmd-btn-primary h-11 px-5 text-sm inline-flex items-center gap-2 mt-4">
                Host A Home Game
              </Link>
            </div>
          </PokerNearMePanelShell>
        )}

        {status === 'ready' && groups.length > 0 && (
          <div className="space-y-3">
            <p className="pnc-label">
              {groups.length} {groups.length === 1 ? 'Game' : 'Games'} Found
              {isNearbyMode
                ? ` Within ${radius} Miles`
                : (manualCity || manualState
                  ? ` In ${[manualCity, manualState].filter(Boolean).join(', ')}`
                  : '')}
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              {groups.map((g) => (
                <PokerNearMePanelShell key={g.id} as={Link} href={groupHref(g)} className="block">
                  <div style={{ paddingBottom: '3cqw' }}>
                    <div className="flex items-start gap-3">
                      {/* The host's own photo is real data, so it prints; the
                          fallback is the kit's painted home holder, never a
                          drawn glyph. */}
                      {g.avatar_url ? (
                        <img
                          src={g.avatar_url}
                          alt=""
                          width={44}
                          height={44}
                          loading="lazy"
                          decoding="async"
                          style={{ width: 44, height: 44, flex: '0 0 44px', objectFit: 'cover' }}
                        />
                      ) : (
                        <PokerNearMeConsoleIcon name="home" />
                      )}

                      <div className="flex-1 min-w-0">
                        <h3 className="pnc-data-row__value" style={{ textAlign: 'left' }}>{g.name}</h3>
                        <p className="pnc-copy">
                          {g.city}{g.state ? `, ${g.state}` : ''}
                          {g.distance_miles != null ? ` · ${g.distance_miles} Mi` : ''}
                        </p>
                      </div>
                    </div>

                    {g.description && (
                      <p className="pnc-copy line-clamp-2" style={{ marginTop: '2cqw' }}>{g.description}</p>
                    )}

                    {(g.default_game_type || g.default_stakes) && (
                      <div className="pnc-data-row">
                        <span className="pnc-data-row__label">Stakes</span>
                        <span className="pnc-data-row__value">
                          {g.default_game_type ? g.default_game_type.toUpperCase() : ''}
                          {g.default_game_type && g.default_stakes ? ' · ' : ''}
                          {formatStakes(g.typical_buyin_min, g.typical_buyin_max, g.default_stakes)}
                        </span>
                      </div>
                    )}
                    {g.typical_day && (
                      <div className="pnc-data-row">
                        <span className="pnc-data-row__label">Schedule</span>
                        <span className="pnc-data-row__value">{g.typical_day}{g.typical_time ? ` · ${formatTime(g.typical_time)}` : ''}</span>
                      </div>
                    )}
                    <div className="pnc-data-row">
                      <span className="pnc-data-row__label">Members</span>
                      <span className="pnc-data-row__value">{g.member_count} {g.member_count === 1 ? 'Member' : 'Members'}</span>
                    </div>

                    {g.next_game_date && (
                      <div className="pnc-data-row">
                        <span className="pnc-data-row__label">Next Game</span>
                        <span className="pnc-data-row__value">
                          {formatDate(g.next_game_date)}{g.next_game_time ? ` · ${formatTime(g.next_game_time)}` : ''}
                          {g.next_game_seats_left != null ? ` · ${g.next_game_seats_left} Seats Left` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </PokerNearMePanelShell>
              ))}
            </div>
          </div>
        )}
        {/* Where public home games exist today. Server rendered (see
            getServerSideProps): each link is a real city directory page. */}
        {publicCities.length > 0 && (
          <PokerNearMePanelShell as="section" aria-labelledby="home-games-by-city">
            <div style={{ paddingBottom: '3cqw' }}>
              <h2 id="home-games-by-city" className="pnc-label">Browse Home Games By City</h2>
              <ul className="grid sm:grid-cols-2 gap-2" style={{ marginTop: '2cqw' }}>
                {publicCities.map((c) => (
                  <li key={c.href}>
                    <Link href={c.href} className="pnc-copy flex items-center gap-2" style={{ minHeight: 44 }}>
                      <PokerNearMeConsoleIcon name="location" />
                      <span>Poker Home Games In {c.city}, {c.stateName}</span>
                      <span className="pnc-ink--muted">({c.count} {c.count === 1 ? 'Game' : 'Games'})</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/hub/home-games/in" className="pnc-label inline-flex items-center" style={{ marginTop: '3cqw', minHeight: 44 }}>
                All States
              </Link>
            </div>
          </PokerNearMePanelShell>
        )}
      </main>
    </div>
  );
}
