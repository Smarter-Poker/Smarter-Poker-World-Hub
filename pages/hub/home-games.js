/**
 *  HOME GAMES — Find Poker Home Games Near You
 *  Same layout as Poker Near Me but filtered to home games only.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import SEOHead from '../../src/components/seo/SEOHead';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';

// AEO phase 3 (2026-09-17): 4,942 server-rendered words, the largest page
// on the site, and no structured data at all.
const HOME_GAMES_SCHEMA = hubProductSchema({
    path: '/hub/home-games',
    name: 'Smarter.Poker Home Games',
    description:
        'Find Private Poker Home Games Near You, Join The Local Community, Or Host Your Own With Invites, Seating And Results Handled For You. Free To Play, No Real-Money Gambling.',
    trail: [['Hub', '/hub'], ['Home Games', '/hub/home-games']],
});
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { useAvatar } from '../../src/contexts/AvatarContext';
import { getAccessToken } from '../../src/lib/authUtils';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import PokerNearMeFamilyNav from '../../src/components/poker-near-me/PokerNearMeFamilyNav';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getVenueFavorites, addVenueFavorite, removeVenueFavorite } from '../../src/services/pokerNearMeFavorites';
import useTrainingBus from '../../src/hooks/useTrainingBus';
// LocationEnableModal owns its full-screen chrome and close-control clearance
// with env(safe-area-inset-top, 0px) inside the shared accessible dialog.
import LocationEnableModal from '../../src/components/ui/LocationEnableModal';

const VenueMap = dynamic(() => import('../../src/components/poker-near-me/VenueMap'), { ssr: false });
import { MapErrorBoundary } from '../../src/components/poker-near-me/VenueMap';
import HostHomeGameButton from '../../src/components/poker-near-me/HostHomeGameButton';
import PokerNearMeConsole, {
    PokerNearMeConsoleIcon,
    PokerNearMePanelShell,
} from '../../src/components/poker-near-me/PokerNearMeConsole';
import { homeGameUrl } from '../../src/lib/home-games/urls';
import { US_STATES_BY_CODE } from '../../src/lib/home-games/locationUtils';
import HubPageSummary from '../../src/components/seo/HubPageSummary';

const PAGE_SIZE = 12;

// ═══════════════════════════════════════════════════════════════════
// HomeGameCard — venue-card density pattern (redesigned 2026-05-12).
// Old design: a flat 16:9 fallback cover dominated the card and the
// adapter stripped default_game_type/stakes/frequency/typical_day/
// time/buyin/games_hosted before they reached the card, so the body
// had nothing to show. New design mirrors the poker-near-me venue
// card: compact 48x48 avatar + name + host + city/state header,
// optional NEXT GAME status row when scheduled, two-column STAKES |
// SCHEDULE grid, member/follower/games-hosted footer with a Details
// action. Cover photo (when uploaded) renders as a thin 90px banner
// instead of the 16:9 dominant area. All data comes from
// /api/public/home-games/discover.
// ═══════════════════════════════════════════════════════════════════
function HomeGameCard({ venue, onNavigate, onFavorite, isFavorited, favoriteRequiresSignIn = false }) {
    // ── Format helpers ──────────────────────────────────────────────
    const formatTime = (t) => {
        if (!t) return null;
        const parts = String(t).split(':');
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1] || '0', 10);
        if (isNaN(h)) return null;
        const isPM = h >= 12;
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return `${h12}:${String(m).padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`;
    };
    const formatDays = (d) => {
        if (!d) return null;
        const map = { monday: 'MON', tuesday: 'TUE', wednesday: 'WED', thursday: 'THU', friday: 'FRI', saturday: 'SAT', sunday: 'SUN' };
        return String(d).split(',')
            .map(x => map[x.trim().toLowerCase()] || x.trim().slice(0, 3).toUpperCase())
            .join('/');
    };
    const formatBuyin = () => {
        const lo = venue.typical_buyin_min;
        const hi = venue.typical_buyin_max;
        if (lo != null && hi != null) return `$${lo}-$${hi}`;
        if (lo != null) return `$${lo}+`;
        if (hi != null) return `Up To $${hi}`;
        return null;
    };

    // ── Derived values ──────────────────────────────────────────────
    const stakesLine = [
        venue.default_game_type ? venue.default_game_type.toUpperCase() : '',
        venue.default_stakes || '',
    ].filter(Boolean).join(' ');
    const buyinLine = formatBuyin();
    const daysLine = formatDays(venue.typical_day);
    const timeLine = formatTime(venue.typical_time);
    const nextTimeLine = formatTime(venue.next_game_time);
    const freqLabel = venue.frequency
        ? venue.frequency.charAt(0).toUpperCase() + venue.frequency.slice(1)
        : null;
    const nextGameDate = venue.next_game_date
        ? new Date(venue.next_game_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        : null;
    const seatsLeft = venue.next_game_seats_left;
    const isFull = seatsLeft === 0;
    const hasSeats = seatsLeft != null && seatsLeft > 0;
    const hasNextGame = !!nextGameDate;

    // ── Handlers ────────────────────────────────────────────────────
    const handleCardClick = (e) => {
        if (e?.target?.closest?.('button, a')) return;
        if (onNavigate) onNavigate();
    };
    const handleKey = (e) => {
        if (e.target === e.currentTarget && e.key === 'Enter') {
            e.preventDefault();
            if (onNavigate) onNavigate();
        }
    };

    return (
        <PokerNearMePanelShell
            as="article"
            className="hgd-card"
            bodyClassName="hgd-card__surface"
            tabIndex={0}
            role="link"
            aria-label={`Open ${venue.name || 'Home Game'} Details`}
            onClick={handleCardClick}
            onKeyDown={handleKey}
        >
            {venue.cover_url && (
                <figure className="hgd-card__cover">
                    <img src={venue.cover_url} alt="" loading="lazy" />
                </figure>
            )}

            <header className="hgd-card__header">
                <div className="hgd-card__avatar" aria-hidden="true">
                    {venue.avatar_url ? (
                        <img src={venue.avatar_url} alt="" loading="lazy" />
                    ) : (
                        <span>{(venue.name || 'H').charAt(0)}</span>
                    )}
                </div>
                <div className="hgd-card__identity">
                    <h3 title={venue.name}>{venue.name}</h3>
                    <p>{venue.host_display_name ? `Hosted By ${venue.host_display_name}` : 'Home Game'}</p>
                    <div className="hgd-card__location">
                        <PokerNearMeConsoleIcon name="location" />
                        <span>{venue.city || ''}{venue.state ? `, ${venue.state}` : ''}</span>
                        <strong>Home Game</strong>
                    </div>
                </div>
                <div className="hgd-card__commands">
                    {venue.distance_miles != null && (
                        <span className="hgd-card__distance">
                            <PokerNearMeConsoleIcon name="directions" />
                            {Math.round(Number(venue.distance_miles))} Mi
                        </span>
                    )}
                    {onFavorite && (
                        <button
                            type="button"
                            className={`hgd-icon-button${isFavorited ? ' is-active' : ''}`}
                            onClick={(e) => { e.stopPropagation(); onFavorite(e); }}
                            aria-label={favoriteRequiresSignIn
                                ? 'Sign In To Save Home Game'
                                : isFavorited ? 'Remove From Saved Home Games' : 'Save Home Game'}
                            aria-pressed={isFavorited}
                        >
                            <PokerNearMeConsoleIcon name="saved" />
                        </button>
                    )}
                </div>
            </header>

            {hasNextGame && (
                <div className="hgd-card__next-game">
                    <PokerNearMeConsoleIcon name="calendar" />
                    <div>
                        <span>Next Game</span>
                        <strong>{nextGameDate}{nextTimeLine ? ` · ${nextTimeLine}` : ''}</strong>
                        {venue.next_game_title ? <small>{venue.next_game_title}</small> : null}
                    </div>
                    {hasSeats ? <b>{seatsLeft} Seat{seatsLeft === 1 ? '' : 's'} Left</b> : null}
                    {isFull ? <b className="is-full">Full</b> : null}
                </div>
            )}

            <div className="hgd-card__facts">
                <section>
                    <span>Stakes</span>
                    <strong>{stakesLine || 'Not Listed'}</strong>
                    {buyinLine ? <small>Buy-In {buyinLine}</small> : null}
                    {venue.max_players ? <small>{venue.max_players} Max Players</small> : null}
                </section>
                <section>
                    <span>Schedule</span>
                    <strong>{freqLabel || 'On Demand'}</strong>
                    {daysLine ? <small>{daysLine}</small> : null}
                    {timeLine ? <small>{timeLine}</small> : null}
                </section>
            </div>

            <footer className="hgd-card__footer">
                <div className="hgd-card__stats">
                    <span><strong>{venue.member_count || 0}</strong> Members</span>
                    <span><strong>{venue.saves_count || 0}</strong> Followers</span>
                    {venue.games_hosted > 0 ? <span><strong>{venue.games_hosted}</strong> Hosted</span> : null}
                </div>
                <button
                    type="button"
                    className="hgd-painted-button hgd-painted-button--secondary hgd-card__details"
                    onClick={(e) => { e.stopPropagation(); if (onNavigate) onNavigate(); }}
                >
                    <PokerNearMeConsoleIcon name="more" />
                    <span>Details</span>
                </button>
            </footer>
        </PokerNearMePanelShell>
    );
}

// ═══════════════════════════════════════════════════════════════════
// Mock seed data removed. Real home games are now loaded from
// /api/public/home-games/discover which joins commander_home_groups
// with social_pages. See migration unify_home_games_with_social_pages.
// ═══════════════════════════════════════════════════════════════════

export default function HomeGamesPage() {
    const router = useRouter();
    const { user } = useAvatar();
    useTrainingBus();
    const userId = user?.id;

    // Data states
    const [venues, setVenues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [loadRevision, setLoadRevision] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [userLocation, setUserLocation] = useState(null);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [gpsLocationLabel, setGpsLocationLabel] = useState(null);
    const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
    const [sortBy, setSortBy] = useState('default');
    const [favorites, setFavorites] = useState({});

    // audit F-12: getVenueFavorites was imported but never called, so this
    // map stayed empty for the whole session — every heart rendered unfilled
    // even for venues the user had already favourited, and tapping one
    // re-added a duplicate instead of toggling it off. Hydrate on sign-in.
    useEffect(() => {
        if (!userId) { setFavorites({}); return; }
        let cancelled = false;
        (async () => {
            try {
                const rows = await getVenueFavorites(userId);
                if (cancelled) return;
                const map = {};
                for (const r of rows || []) {
                    // Key must match toggleFavorite's: 'venue-' + venueId.
                    // Use venue_id ONLY — r.id is the favourite row's own PK
                    // and would build a key that never matches a venue.
                    if (r.venue_id != null) map['venue-' + r.venue_id] = true;
                }
                setFavorites(map);
            } catch (e) {
                console.warn('[home-games] favorites hydrate failed:', e?.message || e);
            }
        })();
        return () => { cancelled = true; };
    }, [userId]);
    const [showLocationModal, setShowLocationModal] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    // Filters
    const [filters, setFilters] = useState({
        radius: 'Any',
        gameType: 'all',
        selectedState: 'all',
    });

    // Load home games from the unified public discovery API. This hits
    // /api/public/home-games/discover which joins commander_home_groups
    // with their social_pages (auto-created by the unify migration).
    // Each result carries lat/lng (if set), slug (canonical URL), and
    // the next upcoming session for inline RSVP teasers.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const ac = new AbortController();
        const token = getAccessToken();
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        setLoading(true);
        setLoadError('');

        // audit H-1: this used to request `?limit=100` with NO lat/lng and a
        // `[]` dep array. Without coordinates discover takes its non-GPS
        // branch — order by member_count, limit 100 — so the page was a
        // NATIONAL TOP-100 LIST that was then filtered client-side. A user in
        // a small market whose local game is not in the national top 100 saw
        // "0 Home Games Found" at any radius, and the State dropdown
        // contradicted /hub/home-games/in/[state], which queries the DB
        // directly. GPS was acquired later but never triggered a refetch.
        //
        // Same fix already shipped in PodHomeGames; it was never applied here.
        // Scoped queries (explicit state or a search term) intentionally skip
        // the geo params so they search nationally, as the pod does.
        const params = new URLSearchParams({ limit: '100' });
        const scoped = (filters.selectedState && filters.selectedState !== 'all')
                       || !!searchQuery.trim();
        if (filters.selectedState && filters.selectedState !== 'all') {
            params.set('state', filters.selectedState);
        }
        if (searchQuery.trim()) params.set('search', searchQuery.trim());
        if (
            !scoped
            && filters.radius !== 'Any'
            && userLocation?.lat != null
            && userLocation?.lng != null
        ) {
            params.set('lat', String(userLocation.lat));
            params.set('lng', String(userLocation.lng));
            params.set('radius_miles', String(Math.min(Number(filters.radius) || 100, 500)));
        }
        setDisplayCount(PAGE_SIZE);

        (async () => {
            const rows = [];
            let offset = 0;
            let hasMore = true;
            let pageCount = 0;
            while (hasMore && pageCount < 501) {
                params.set('offset', String(offset));
                const response = await fetch(
                    `/api/public/home-games/discover?${params.toString()}`,
                    { signal: ac.signal, headers },
                );
                const json = await response.json();
                if (!response.ok || !json?.success) {
                    throw new Error(json?.error || `discover failed (${response.status})`);
                }
                const pageRows = Array.isArray(json.groups) ? json.groups : [];
                rows.push(...pageRows);
                hasMore = json?.pagination?.has_more === true;
                offset = Number(json?.pagination?.next_offset);
                if (hasMore && (!Number.isFinite(offset) || offset < 0)) {
                    throw new Error('discover pagination cursor is invalid');
                }
                pageCount += 1;
            }
            if (hasMore) throw new Error('discover pagination exceeded its safety bound');

            // A row can move between pages while activity changes. Keep the
            // first occurrence so a live refresh never renders duplicate cards.
            const uniqueRows = Array.from(new Map(rows.map((row) => [String(row.id), row])).values());
                // Adapt to the shape VenueCard/VenueMap expect: they look for
                // id, name, city, state, latitude, longitude, venue_type.
                const adapted = uniqueRows.map(g => ({
                    id: g.id,
                    slug: g.slug,                       // canonical URL key
                    club_code: g.club_code,             // share fallback
                    name: g.name,
                    description: g.description,
                    city: g.city,
                    state: g.state,
                    // commander_home_groups stores coords on the group row;
                    // they're not exposed publicly by the discover endpoint
                    // yet (privacy). Cards still render without a pin.
                    latitude: g.latitude ?? null,
                    longitude: g.longitude ?? null,
                    distance_miles: g.distance_miles ?? null,
                    venue_type: 'home_game',
                    // Pass through raw game/schedule fields so HomeGameCard
                    // can format them inline. The prior adapter flattened
                    // these into `games_offered` and `schedule` strings that
                    // HomeGameCard never consumed, so the card body had no
                    // data to show.
                    default_game_type: g.default_game_type,
                    default_stakes: g.default_stakes,
                    typical_buyin_min: g.typical_buyin_min,
                    typical_buyin_max: g.typical_buyin_max,
                    frequency: g.frequency,
                    typical_day: g.typical_day,
                    typical_time: g.typical_time,
                    max_players: g.max_players || null,
                    // Host
                    host_display_name: g.host?.display_name || null,
                    host_avatar_url: g.host?.avatar_url || null,
                    // Social counts
                    member_count: g.member_count || 0,
                    saves_count: g.follower_count || 0,
                    games_hosted: g.games_hosted || 0,
                    // Next scheduled game
                    next_game_date: g.next_game_date,
                    next_game_time: g.next_game_time,
                    next_game_title: g.next_game_title,
                    next_game_seats_left: g.next_game_seats_left,
                    // Media
                    cover_url: g.cover_url,
                    avatar_url: g.avatar_url,
                    // Legacy passthrough — kept for any downstream consumers
                    // (sort/filter logic, share cards, etc.) that still
                    // reference these flattened representations.
                    games_offered: g.default_game_type
                        ? [`${(g.default_game_type || '').toUpperCase()}${g.default_stakes ? ' ' + g.default_stakes : ''}`.trim()]
                        : [],
                    schedule: [g.frequency, g.typical_day].filter(Boolean).join(' · ') || null,
                    trust_score: null,
                    // UNIFICATION (audit 2026-08-14):
                    // - detailUrl: canonical destination from the shared
                    //   builder — VenueMap's popup reads it; without it the
                    //   popup went to /hub/venues/<uuid> while the marker
                    //   handler used slug/club_code.
                    // - distance_mi: alias — VenueCard reads distance_mi,
                    //   this adapter only emitted distance_miles.
                    // - has_tournaments: MapTabPanel's tournaments chip
                    //   filters on it; omitting it dropped every row here
                    //   from that chip.
                    detailUrl: homeGameUrl(g),
                    distance_mi: g.distance_miles ?? null,
                    has_tournaments: !!g.next_game_date,
                }));
                setVenues(adapted);
                setLoadError('');
                setLoading(false);
        })().catch((e) => {
                if (e?.name === 'AbortError') return;
                console.warn('[home-games] discover load failed:', e);
                setVenues([]);
                setLoadError('Home Games Could Not Be Loaded. Please Try Again.');
                setLoading(false);
            });
        return () => ac.abort();
        // Re-query when the user's location or scope changes. Previously `[]`,
        // so the GPS fix acquired below never reached the API.
    }, [userLocation, filters.selectedState, filters.radius, searchQuery, loadRevision]);

    // Restore a recent, previously accepted location without prompting. Fresh
    // geolocation requests are always initiated by the visible Enable GPS
    // control; never steal focus with a browser prompt or recovery dialog on
    // page load, including after the user dismissed that prompt before.
    const gpsAutoRef = useRef(false);
    useEffect(() => {
        if (gpsAutoRef.current) return;
        gpsAutoRef.current = true;
        // Try saved location
        try {
            const saved = localStorage.getItem('sp-user-gps');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.lat && parsed.lng && parsed.time && (Date.now() - parsed.time) < 86400000) {
                    setUserLocation({ lat: parsed.lat, lng: parsed.lng });
                    setGpsLocationLabel(parsed.label || `${parsed.lat.toFixed(3)}, ${parsed.lng.toFixed(3)}`);
                    return;
                }
            }
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        try {
            if (localStorage.getItem('pnm_location_prompt_dismissed') === '1') return;
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        // No saved location: wait for an explicit Enable GPS action.
    }, []);

    const requestGpsLocation = () => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;
        setGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setUserLocation(loc);
                setGpsLoading(false);
                // Reverse geocode
                fetch(`https://nominatim.openstreetmap.org/reverse?lat=${loc.lat}&lon=${loc.lng}&format=json`)
                    .then(r => r.json())
                    .then(data => {
                        const city = data?.address?.city || data?.address?.town || data?.address?.village || '';
                        const state = data?.address?.state || '';
                        const stateAbbr = state.length > 2 ? getStateAbbr(state) : state;
                        const label = city && stateAbbr ? `${city}, ${stateAbbr}` : `${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`;
                        setGpsLocationLabel(label);
                        try {
                            localStorage.setItem('sp-user-gps', JSON.stringify({ ...loc, time: Date.now(), label }));
                        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                    })
                    .catch(() => {
                        setGpsLocationLabel(`${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`);
                    });
            },
            (err) => {
                setGpsLoading(false);
                if (err && err.code === 1) {
                    // The location instructions are themselves a modal dialog.
                    // Retire any expanded discovery map before mounting them so
                    // focus, Escape and scroll locking always have one owner.
                    window.dispatchEvent(new Event('pnm:close-map-fullscreen'));
                    setShowLocationModal(true);
                }
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
        );
    };

    // State abbreviation helper
    const getStateAbbr = (stateName) => {
        const states = {
            'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
            'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
            'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
            'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
            'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
            'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
            'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
            'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
            'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
            'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
        };
        return states[stateName] || stateName;
    };

    // Toggle favorite (Optimistic with Rollback)
    const toggleFavorite = async (venueId, e, venueData) => {
        if (e) e.stopPropagation();
        if (!userId) {
            router.push(`/auth/login?redirect=${encodeURIComponent('/hub/home-games')}`);
            return;
        }
        const key = 'venue-' + venueId;
        const isFav = !!favorites[key];
        if (isFav) {
            const backup = favorites[key];
            setFavorites(prev => { const n = { ...prev }; delete n[key]; return n; });
            try { 
                await removeVenueFavorite(userId, venueId); 
            } catch (e) { 
                console.warn('[App] Failed to remove favorite, rolling back:', e?.message || e); 
                setFavorites(prev => ({ ...prev, [key]: backup }));
            }
        } else {
            setFavorites(prev => ({ ...prev, [key]: Date.now() }));
            try { 
                await addVenueFavorite(userId, venueId, venueData); 
            } catch (e) { 
                console.warn('[App] Failed to add favorite, rolling back:', e?.message || e); 
                setFavorites(prev => { const n = { ...prev }; delete n[key]; return n; });
            }
        }
    };

    // Haversine distance
    const haversineMiles = (lat1, lng1, lat2, lng2) => {
        const R = 3958.8;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    // Sort venues
    const sortedVenues = useMemo(() => {
        let filtered = [...venues];

        // Apply search filter locally
        if (searchQuery) {
            const lower = searchQuery.toLowerCase();
            filtered = filtered.filter(v =>
                (v.name || '').toLowerCase().includes(lower) ||
                (v.city || '').toLowerCase().includes(lower) ||
                (v.state || '').toLowerCase().includes(lower)
            );
        }

        // Apply state filter
        if (filters.selectedState && filters.selectedState !== 'all') {
            filtered = filtered.filter(v => v.state === filters.selectedState);
        }

        // Calculate distance if we have user location
        if (userLocation) {
            filtered = filtered.map(v => ({
                ...v,
                _distance: (v.latitude && v.longitude)
                    ? haversineMiles(userLocation.lat, userLocation.lng, v.latitude, v.longitude)
                    : 99999
            }));

            // Apply radius filter
            if (filters.radius !== 'Any') {
                filtered = filtered.filter(v => v._distance <= Number(filters.radius));
            }
        }

        // Sort
        switch (sortBy) {
            case 'distance':
                filtered.sort((a, b) => (a._distance || 99999) - (b._distance || 99999));
                break;
            case 'name-az':
                filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                break;
            case 'name-za':
                filtered.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
                break;
            case 'trust-desc':
                filtered.sort((a, b) => (b.trust_score || 0) - (a.trust_score || 0));
                break;
            default:
                if (userLocation) {
                    filtered.sort((a, b) => (a._distance || 99999) - (b._distance || 99999));
                }
        }

        return filtered;
    }, [venues, searchQuery, filters, sortBy, userLocation]);

    const displayed = sortedVenues.slice(0, displayCount);
    const remaining = sortedVenues.length - displayed.length;

    // Handle search
    const handleSearchChange = (e) => {
        setSearchQuery(e.target.value);
    };

    const handleSearch = (e) => {
        e.preventDefault();
    };

    // Get unique states from home game venues
    const availableStates = useMemo(() => Object.keys(US_STATES_BY_CODE).sort(), []);

    return (
        <>
            <SEOHead
                title="Poker Home Games Near You: Find Or Host One"
                description="Find Private Poker Home Games Near You On Smarter.Poker, Join The Local Community, Or Host Your Own Game With Invites, Seating And Results Handled For You. Free To Play, No Real-Money Gambling."
                canonical="/hub/home-games"
                jsonLd={HOME_GAMES_SCHEMA}
            />

            <div className="hgd-backdrop" aria-hidden="true" />

            <div className="hg-page hgd-page" data-pnm-home-games-directory="true">
                <UniversalHeader
                    pageDepth={1}
                    onMenuClick={() => setMenuOpen(true)}
                    onBackClick={() => router.back()}
                />

                <PokerNearMeFamilyNav />

                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    user={user}
                />

                <main className="hgd-directory" data-pnm-secondary-foundation="interaction-v1">
                    <section className="hgd-hero-stage" aria-labelledby="home-games-directory-title">
                        <PokerNearMeConsole
                            className="hgd-hero"
                            eyebrow="Private Poker Discovery"
                            title="Home Games"
                            titleId="home-games-directory-title"
                            titleAs="h1"
                            subtitle="Find Local Games, Follow Trusted Hosts, Or Open Your Own Table"
                            pill={loading ? 'Searching' : `${sortedVenues.length} Found`}
                            crest="club"
                            foot="foot"
                        />
                    </section>

                    <div className="hgd-layout">
                        <PokerNearMePanelShell
                            as="aside"
                            className="hgd-filter-console"
                            bodyClassName="hgd-filter-console__body"
                            aria-label="Home Game Discovery Controls"
                        >
                            <header className="hgd-panel-heading">
                                <PokerNearMeConsoleIcon name="filter" />
                                <div>
                                    <span>Discovery Controls</span>
                                    <strong>Refine The Directory</strong>
                                </div>
                            </header>

                            {!userLocation ? (
                                <button
                                    type="button"
                                    className="hgd-painted-button hgd-painted-button--secondary hgd-gps-button"
                                    onClick={requestGpsLocation}
                                    disabled={gpsLoading}
                                >
                                    <PokerNearMeConsoleIcon name="location" />
                                    <span>{gpsLoading ? 'Locating...' : 'Enable GPS'}</span>
                                </button>
                            ) : null}

                            {userLocation && gpsLocationLabel ? (
                                <div className="hgd-location-readout" aria-live="polite">
                                    <PokerNearMeConsoleIcon name="location" />
                                    <div>
                                        <span>Your Location</span>
                                        <strong>{gpsLocationLabel}</strong>
                                    </div>
                                    <button
                                        type="button"
                                        className="hgd-icon-button"
                                        onClick={() => {
                                            setUserLocation(null);
                                            setGpsLocationLabel(null);
                                        }}
                                        aria-label="Clear Location"
                                        title="Clear Location"
                                    >
                                        <PokerNearMeConsoleIcon name="close" />
                                    </button>
                                </div>
                            ) : null}

                            <form className="hgd-search-well" role="search" onSubmit={handleSearch}>
                                <PokerNearMeConsoleIcon name="search" />
                                <input
                                    type="search"
                                    placeholder="Search Home Games..."
                                    value={searchQuery}
                                    onChange={handleSearchChange}
                                    autoComplete="off"
                                    aria-label="Search Home Games"
                                />
                            </form>

                            <div className="hgd-filter-console__section">
                                <span>Filters</span>
                                <div className="hgd-filter-field">
                                    <label htmlFor="home-games-radius">Radius</label>
                                    <div className="hgd-select-well">
                                        <select
                                            id="home-games-radius"
                                            value={filters.radius}
                                            disabled={!userLocation}
                                            aria-describedby={!userLocation ? 'home-games-radius-hint' : undefined}
                                            onChange={e => setFilters({ ...filters, radius: e.target.value === 'Any' ? 'Any' : Number(e.target.value) })}
                                        >
                                            <option value={25}>25 Mi</option>
                                            <option value={50}>50 Mi</option>
                                            <option value={100}>100 Mi</option>
                                            <option value={200}>200 Mi</option>
                                            <option value={500}>500 Mi</option>
                                            <option value="Any">Any</option>
                                        </select>
                                    </div>
                                    {!userLocation ? (
                                        <small id="home-games-radius-hint">Enable Location To Filter By Distance.</small>
                                    ) : null}
                                </div>

                                <div className="hgd-filter-field">
                                    <label htmlFor="home-games-state">State</label>
                                    <div className="hgd-select-well">
                                        <select
                                            id="home-games-state"
                                            value={filters.selectedState}
                                            onChange={e => setFilters(f => ({ ...f, selectedState: e.target.value }))}
                                        >
                                            <option value="all">All States</option>
                                            {availableStates.map(st => (
                                                <option key={st} value={st}>{st}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <HostHomeGameButton className="hgd-host-action" />
                        </PokerNearMePanelShell>

                        <section className="hgd-results" aria-label="Home Game Search Results">
                            {loading ? (
                                <PokerNearMePanelShell
                                    as="section"
                                    className="hgd-state-console"
                                    bodyClassName="hgd-state-console__body"
                                    aria-live="polite"
                                    aria-busy="true"
                                >
                                    <PokerNearMeConsoleIcon name="globe" className="hgd-state-console__spinner" />
                                    <h2>Finding Home Games Near You</h2>
                                    <p>Scanning The Community Directory And Privacy-Safe Map.</p>
                                </PokerNearMePanelShell>
                            ) : loadError ? (
                                <PokerNearMePanelShell
                                    as="section"
                                    className="hgd-state-console"
                                    bodyClassName="hgd-state-console__body"
                                    role="alert"
                                >
                                    <PokerNearMeConsoleIcon name="info" />
                                    <h2>Directory Connection Interrupted</h2>
                                    <p>{loadError}</p>
                                    <button
                                        type="button"
                                        className="hgd-painted-button hgd-painted-button--primary"
                                        onClick={() => setLoadRevision(value => value + 1)}
                                    >
                                        <PokerNearMeConsoleIcon name="globe" />
                                        <span>Try Again</span>
                                    </button>
                                </PokerNearMePanelShell>
                            ) : (
                                <>
                                    <div className="hgd-map-stage">
                                        <MapErrorBoundary>
                                            <VenueMap
                                                venues={sortedVenues}
                                                userLocation={userLocation}
                                                hideLegend={true}
                                                radiusMiles={filters.radius}
                                                mapEyebrow="Community Game Map"
                                                mapTitle="Home Games Near You"
                                                mapDetail={`${sortedVenues.length} Privacy Safe Locations · Exact Addresses Stay Private`}
                                                onVenueClick={(venue) => router.push(homeGameUrl(venue))}
                                            />
                                        </MapErrorBoundary>
                                    </div>

                                    <PokerNearMePanelShell
                                        as="section"
                                        className="hgd-results-console"
                                        bodyClassName="hgd-results-console__body"
                                        aria-label="Result Count And Sorting"
                                    >
                                        <div className="hgd-results-count">
                                            <PokerNearMeConsoleIcon name="community" />
                                            <span>{sortedVenues.length} Home Game{sortedVenues.length !== 1 ? 's' : ''} Found</span>
                                        </div>
                                        <div className="hgd-sort-control">
                                            <label htmlFor="home-games-sort">Sort</label>
                                            <div className="hgd-select-well">
                                                <select
                                                    id="home-games-sort"
                                                    value={sortBy}
                                                    onChange={e => setSortBy(e.target.value)}
                                                >
                                                    <option value="default">{userLocation ? 'Nearest First' : 'Default'}</option>
                                                    <option value="distance">Distance (Nearest)</option>
                                                    <option value="trust-desc">Trust Score (High To Low)</option>
                                                    <option value="name-az">Name (A To Z)</option>
                                                    <option value="name-za">Name (Z To A)</option>
                                                </select>
                                            </div>
                                        </div>
                                    </PokerNearMePanelShell>

                                    {sortedVenues.length === 0 ? (
                                        <PokerNearMePanelShell
                                            as="section"
                                            className="hgd-state-console"
                                            bodyClassName="hgd-state-console__body"
                                        >
                                            <PokerNearMeConsoleIcon name="home" />
                                            <h2>No Home Games Found</h2>
                                            <p>Adjust Your Filters Or Expand Your Search Radius.</p>
                                            <HostHomeGameButton />
                                        </PokerNearMePanelShell>
                                    ) : (
                                        <div className="hgd-cards-section">
                                            <div className="hgd-card-grid">
                                                {displayed.map((venue, i) => (
                                                    <HomeGameCard
                                                        key={venue.id || i}
                                                        venue={venue}
                                                        isFavorited={!!favorites['venue-' + venue.id]}
                                                        favoriteRequiresSignIn={!userId}
                                                        onFavorite={(e) => toggleFavorite(venue.id, e, venue)}
                                                        onNavigate={() => router.push(homeGameUrl(venue))}
                                                    />
                                                ))}
                                            </div>
                                            {remaining > 0 ? (
                                                <div className="hgd-load-more">
                                                    <button
                                                        type="button"
                                                        className="hgd-painted-button hgd-painted-button--secondary"
                                                        onClick={() => setDisplayCount(prev => prev + PAGE_SIZE)}
                                                    >
                                                        <PokerNearMeConsoleIcon name="more" />
                                                        <span>Show More ({remaining} Remaining)</span>
                                                    </button>
                                                </div>
                                            ) : null}
                                        </div>
                                    )}
                                </>
                            )}
                        </section>
                    </div>

                    <PokerNearMePanelShell
                        as="footer"
                        className="hgd-location-console"
                        bodyClassName="hgd-location-console__body"
                    >
                        <PokerNearMeConsoleIcon name="location" />
                        <div>
                            <span>Location Signal</span>
                            <strong>{gpsLocationLabel || 'GPS Not Enabled'}</strong>
                        </div>
                    </PokerNearMePanelShell>
                </main>

                <LocationEnableModal
                    isOpen={showLocationModal}
                    onClose={() => setShowLocationModal(false)}
                    onRetry={() => {
                        setShowLocationModal(false);
                        requestGpsLocation();
                    }}
                />
            </div>

            <HubPageSummary page="home-games" />
        </>
    );
}
