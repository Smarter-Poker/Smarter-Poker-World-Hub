/**
 * Poker Venues API - Serves ALL verified poker venues (uncapped)
 * Supports filtering, GPS-based search, and daily tournament schedule lookups
 *
 * Query params:
 *   id         - return single venue by numeric ID
 *   state      - filter by state code (e.g., NV, CA) or full name (e.g., Kentucky)
 *   city       - filter by city (case-insensitive partial match)
 *   type       - filter by venue_type (casino, card_room, charity, poker_club)
 *   tournaments - if 'true', only venues with has_tournaments=true
 *   search     - search by name, city, address, or state (case-insensitive)
 *   lat + lng + radius (default 100mi) - GPS-based search with Haversine distance
 *   limit      - max results (default: all, no cap)
 *   featured   - if 'true', only featured venues
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { captureError, addBreadcrumb } from '../../../src/lib/sentry';
import allVenuesData from '../../../data/all-venues.json';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
// Home-group coordinate privacy. See src/lib/home-games/geoPrivacy.js —
// a home group's lat/lng is a person's home address and must never be
// emitted raw from this (public, unauthenticated) endpoint.
import { jitterCoord, publicDistanceToGroup } from '../../../src/lib/home-games/geoPrivacy';
import { homeGameUrl } from '../../../src/lib/home-games/urls';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// --- State abbreviation ↔ full name mapping ---
const STATE_ABBREV_TO_NAME = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
    CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
    IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
    ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
    MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
    NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
    OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
    TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
    WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia'
};
const STATE_NAME_TO_ABBREV = Object.fromEntries(
    Object.entries(STATE_ABBREV_TO_NAME || {}).map(([k, v]) => [v.toLowerCase(), k])
);

/** Resolve a search term to a state abbreviation (if it matches a state name) */
function resolveStateAbbrev(term) {
    const upper = term.toUpperCase();
    if (STATE_ABBREV_TO_NAME[upper]) return upper;
    return STATE_NAME_TO_ABBREV[term.toLowerCase()] || null;
}

// --- Built-in city geocoding lookup for cross-state radius searches ---
// Keyed as "city, state" (lowercase). Used when user searches by city name without GPS.
const BUILTIN_CITY_COORDS = {
    'las vegas, nv':   { lat: 36.1699, lng: -115.1398 },
    'los angeles, ca': { lat: 34.0522, lng: -118.2437 },
    'phoenix, az':     { lat: 33.4484, lng: -112.0740 },
    'houston, tx':     { lat: 29.7604, lng: -95.3698 },
    'miami, fl':       { lat: 25.7617, lng: -80.1918 },
    'new york, ny':    { lat: 40.7128, lng: -74.0060 },
    'chicago, il':     { lat: 41.8781, lng: -87.6298 },
    'denver, co':      { lat: 39.7392, lng: -104.9903 },
    'atlanta, ga':     { lat: 33.7490, lng: -84.3880 },
    'seattle, wa':     { lat: 47.6062, lng: -122.3321 },
    'san francisco, ca': { lat: 37.7749, lng: -122.4194 },
    'dallas, tx':      { lat: 32.7767, lng: -96.7970 },
    'orlando, fl':     { lat: 28.5383, lng: -81.3792 },
    'san diego, ca':   { lat: 32.7157, lng: -117.1611 },
    'tampa, fl':       { lat: 27.9506, lng: -82.4572 },
    'portland, or':    { lat: 45.5051, lng: -122.6750 },
    'nashville, tn':   { lat: 36.1627, lng: -86.7816 },
    'austin, tx':      { lat: 30.2672, lng: -97.7431 },
    'new orleans, la': { lat: 29.9511, lng: -90.0715 },
    'philadelphia, pa':{ lat: 39.9526, lng: -75.1652 },
    'detroit, mi':     { lat: 42.3314, lng: -83.0458 },
    'minneapolis, mn': { lat: 44.9778, lng: -93.2650 },
    'boston, ma':      { lat: 42.3601, lng: -71.0589 },
    'sacramento, ca':  { lat: 38.5816, lng: -121.4944 },
    'reno, nv':        { lat: 39.5296, lng: -119.8138 },
    'atlantic city, nj': { lat: 39.3643, lng: -74.4229 },
    'biloxi, ms':      { lat: 30.3960, lng: -88.8853 },
    'tunica, ms':      { lat: 34.6851, lng: -90.3837 },
    'oklahoma city, ok': { lat: 35.4676, lng: -97.5164 },
    'kansas city, mo': { lat: 39.0997, lng: -94.5786 },
    'cleveland, oh':   { lat: 41.4993, lng: -81.6944 },
    'cincinnati, oh':  { lat: 39.1031, lng: -84.5120 },
    'pittsburgh, pa':  { lat: 40.4406, lng: -79.9959 },
    'shreveport, la':  { lat: 32.5252, lng: -93.7502 },
    'henderson, nv':   { lat: 36.0395, lng: -114.9817 },
};

// --- Geocode memo for city searches not covered by BUILTIN_CITY_COORDS ---
// The Nominatim call used to sit uncached and untimed directly in the venue
// search request path: a slow/throttled upstream stalled the whole request up
// to the platform timeout, and every cache miss re-geocoded the same suburb.
// Negative results are memoised too so a bad term is only ever attempted once
// per lambda lifetime (Nominatim's usage policy caps automated use ~1 req/s).
const GEOCODE_TTL = 24 * 60 * 60 * 1000; // 24h
const GEOCODE_TIMEOUT_MS = 1500;
const GEOCODE_MAX_ENTRIES = 500;
const _geocodeCache = new Map();

async function geocodeCity(cityName, stateCode) {
    const key = `${cityName.toLowerCase()}, ${stateCode.toLowerCase()}`;
    const cached = _geocodeCache.get(key);
    if (cached && (Date.now() - cached.at) < GEOCODE_TTL) return cached.coords;

    let coords = null;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS) : null;
    try {
        const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(cityName)}`
            + `&state=${encodeURIComponent(stateCode)}&country=us&format=json&limit=1`;
        const gResp = await fetch(url, {
            headers: { 'User-Agent': 'SmarterPoker/1.0', 'Accept-Language': 'en-US,en' },
            signal: controller ? controller.signal : undefined,
        });
        if (gResp.ok) {
            const data = await gResp.json();
            if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
                coords = { lat: data[0].lat, lng: data[0].lon };
            }
        }
    } catch (e) {
        console.warn('[venues] Dynamic geocode failed:', e?.message || e);
    } finally {
        if (timer) clearTimeout(timer);
    }

    // Bound the memo so a long-lived lambda cannot grow it without limit.
    if (_geocodeCache.size >= GEOCODE_MAX_ENTRIES) {
        const oldest = _geocodeCache.keys().next().value;
        if (oldest !== undefined) _geocodeCache.delete(oldest);
    }
    _geocodeCache.set(key, { coords, at: Date.now() });
    return coords;
}

// --- In-memory cache for JSON venue data with Map index ---
const CACHE_TTL = 60000; // 60 seconds
let _jsonVenueCache = null;
let _jsonVenueCacheTime = 0;
let _venueByIdMap = null;

// Haversine formula for distance calculation (km)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Ensure Title Case formatting for venue names
function toTitleCase(str) {
    if (!str) return str;
    return str.replace(/\w\S*/g, (txt) => {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
}

const DAYS_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Current day-of-week index in US Eastern, so Vercel's UTC clock doesn't drift the schedule. */
function easternTodayIndex() {
    const localCurrentTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    return new Date(localCurrentTime).getDay();
}

/**
 * Resolve a charity social page's `metadata.run_schedule` into today's event
 * (if any) plus the next upcoming event.
 *
 * This used to be inlined inside the `missedLinkedPages` loop, which meant it
 * only ever ran for pages that HAD a linked_venue_id the JSON dataset simply
 * did not carry. Genuinely unlinked charity pages reached the mapper with
 * both fields undefined and were dropped from every result set. Hoisted here
 * so every charity page gets the computation.
 */
function computeCharitySchedule(schedule) {
    const sched = schedule || {};
    const todayIdx = easternTodayIndex();
    const todayKey = DAYS_ORDER[todayIdx];

    // Fallback buy-in from any scheduled day, used when today's row omits one.
    const schedBuyIns = Object.values(sched)
        .map(d => d?.buy_in)
        .filter(b => b != null && b > 0 && b < 10000);
    const fallbackBuyIn = schedBuyIns.length > 0 ? schedBuyIns[0] : null;

    const today = sched[todayKey];
    if (today && today.open && today.location) {
        return {
            isOpenToday: true,
            todayLocation: today.location.trim(),
            todayStartTime: today.start_time || null,
            todayBuyIn: (today.buy_in > 0 ? today.buy_in : fallbackBuyIn) || null,
            nextEvent: null,
        };
    }

    for (let i = 1; i <= 7; i++) {
        const nextDayStr = DAYS_ORDER[(todayIdx + i) % 7];
        const nextDayData = sched[nextDayStr];
        if (nextDayData && nextDayData.open && nextDayData.location) {
            return {
                isOpenToday: false,
                todayLocation: null,
                todayStartTime: null,
                todayBuyIn: null,
                nextEvent: {
                    day: nextDayStr.charAt(0).toUpperCase() + nextDayStr.slice(1),
                    days_away: i,
                    location: nextDayData.location.trim(),
                    start_time: nextDayData.start_time || null,
                    buy_in: (nextDayData.buy_in > 0 ? nextDayData.buy_in : fallbackBuyIn) || null,
                },
            };
        }
    }

    return { isOpenToday: false, todayLocation: null, todayStartTime: null, todayBuyIn: null, nextEvent: null };
}

// ══════════════════════════════════════════════════════════════════════
//  PHASE 19 — HOME GROUP UNION
// ══════════════════════════════════════════════════════════════════════
//
//  Per Dan's directive: "Once a new club, home game or charity is
//  created in Club Commander, it needs to be picked up and displayed
//  inside of Poker Near Me automatically."
//
//  Clubs + charities already live in poker_venues so they flow through
//  the existing path. Home groups live in commander_home_groups (their
//  own schema island — Phase 16A tried shadow poker_venues rows and was
//  reverted). We pick them up at READ time here, no cross-table writes.
//
//  Same pattern Daily Tournaments already uses (venue_daily_tournaments
//  + charity_events_schedule + poker_tour_series_events UNIONed in
//  /api/poker/daily-tournaments.js).
//
//  APPLIES THE PHASE 18 AUTO-HIDE FILTER
//    Public + is_active + NOT stale (45 days):
//      last_activity_at      >= NOW() - 45 days     OR
//      created_at            >= NOW() - 45 days     OR   (new-group grace)
//      visibility_override_until > NOW()                  (host override)
//
//  Home groups are returned under a TOP-LEVEL `home_groups` key on the
//  response envelope, separate from `data`. Two reasons:
//    1. No ID collision — venues use int id, home groups use uuid.
//    2. Backward compatibility — old clients that only read `data` see
//       no change in behavior.
//
//  Home groups are returned with venue-compatible field names where
//  possible (name, city, state, latitude, longitude, profile_photo_url)
//  plus home-group-specific fields (default_game_type, default_stakes,
//  typical_day, typical_time, member_count, frequency, tagline, slug).
//  A `venue_type: 'home_game'` discriminator lets frontend code
//  iterate both arrays and distinguish by type.
// ══════════════════════════════════════════════════════════════════════

const HOME_GROUP_INACTIVITY_DAYS = 45;

async function fetchPublicHomeGroups({ state, city, search, lat, lng, radius, effectiveType }) {
    // When the caller specifically filters to a non-home-game venue type
    // (e.g. ?type=casino), we skip the home-group fetch entirely.
    if (effectiveType && effectiveType !== 'home_game' && effectiveType !== 'home_games') {
        return [];
    }

    const sb = getSupabase();

    const inactivityCutoffIso = new Date(
        Date.now() - HOME_GROUP_INACTIVITY_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    const nowIso = new Date().toISOString();

    let q = sb
        .from('commander_home_groups')
        .select(`
            id,
        club_code,
            name,
            description,
            tagline,
            city,
            state,
            latitude,
            longitude,
            default_game_type,
            default_stakes,
            typical_buyin_min,
            typical_buyin_max,
            frequency,
            typical_day,
            typical_time,
            member_count,
            games_hosted,
            profile_photo_url,
            cover_photo_url,
            created_at,
            last_activity_at,
            visibility_override_until,
            settings,
            owner_id
        `)
        .eq('is_active', true)
        .eq('is_private', false);

    // Phase 18 — 45-day auto-hide filter (OR clause)
    q = q.or(
        `last_activity_at.gte.${inactivityCutoffIso},` +
        `created_at.gte.${inactivityCutoffIso},` +
        `visibility_override_until.gt.${nowIso}`
    );

    // Filter: state
    if (state) {
        q = q.eq('state', (state || '').toUpperCase().slice(0, 2));
    }

    // Filter: city — partial, case-insensitive
    if (city) {
        const escaped = String(city).replace(/[%_\\]/g, (c) => '\\' + c);
        q = q.ilike('city', `%${escaped}%`);
    }

    // Filter: search — name / city / state
    if (search && typeof search === 'string' && search.trim().length > 0) {
        const s = search.trim().replace(/[%_\\]/g, (c) => '\\' + c);
        q = q.or(`name.ilike.%${s}%,city.ilike.%${s}%,state.ilike.%${s}%`);
    }

    q = q.order('member_count', { ascending: false }).limit(500);

    const { data, error } = await q;
    if (error) {
        console.warn('[venues] Home group UNION fetch failed (non-fatal):', error.message);
        return [];
    }

    let rows = data || [];

    // Also fetch linked social_pages (for slug + follower_count + cover_url sync)
    // Only one extra round-trip even with lots of groups.
    if (rows.length > 0) {
        const groupIdStrings = rows.map((g) => String(g.id));
        try {
            const { data: pages } = await sb
                .from('social_pages')
                .select('id, slug, linked_entity_id, follower_count, avatar_url, cover_url')
                .eq('linked_entity_type', 'home_group')
                .in('linked_entity_id', groupIdStrings);
            const pageByGroupId = new Map(
                (pages || []).map((p) => [p.linked_entity_id, p])
            );
            rows = rows.map((g) => {
                const p = pageByGroupId.get(String(g.id));
                return {
                    ...g,
                    slug: p?.slug || null,
                    follower_count: p?.follower_count ?? 0,
                    social_page_id: p?.id || null,
                };
            });
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    }

    // GPS distance + radius filter (reuses the same calculateDistance helper
    // used for regular venues so the math and units match exactly).
    const hasGps = !!(lat && lng);
    if (hasGps) {
        const userLat = parseFloat(lat);
        const userLng = parseFloat(lng);
        const parsedRadius = parseFloat(radius);
        const maxRadius = isNaN(parsedRadius) ? 150 : Math.min(Math.max(0, parsedRadius), 150);

        if (
            !isNaN(userLat) && !isNaN(userLng) &&
            userLat >= -90 && userLat <= 90 &&
            userLng >= -180 && userLng <= 180
        ) {
            // PRIVACY (audit 2026-08-12, finding C-1): a home group's
            // latitude/longitude is a person's HOME ADDRESS. Distance must be
            // measured from the JITTERED coordinate and exposed at WHOLE-MILE
            // precision only.
            //
            // Previously this measured from the real lat/lng and exposed
            // distance_mi at 0.1-mile precision. Because this endpoint is
            // public and unauthenticated, an attacker could query it from 3+
            // GPS points and trilaterate the exact house — defeating the
            // entire privacy model that discover.js implements. See
            // src/lib/home-games/geoPrivacy.js for the full threat model.
            //
            // The unrounded value is kept ONLY as an internal field for the
            // radius filter below, and is stripped before the response.
            rows = rows.map((g) => {
                const d = publicDistanceToGroup(
                    g.id, g.latitude, g.longitude, userLat, userLng
                );
                if (d.miles == null) {
                    return { ...g, distance_km: null, distance_mi: null, _rawDistanceMi: null };
                }
                return {
                    ...g,
                    // Whole-mile / whole-km precision. Do NOT restore decimals.
                    distance_mi: d.miles,
                    distance_km: Math.round(d.raw * 1.60934),
                    _rawDistanceMi: d.raw,
                };
            });

            // If this is a location-browse (no search term), filter by radius.
            // Filter on the unrounded internal value so "within N miles"
            // behaves exactly as before — the rounding only affects what we
            // EXPOSE.
            //
            // NOTE: the previous comment here claimed home groups "always have
            // approximate coords (populated at creation)". That is false —
            // create.js sends `latitude: formData.approximate_lat || undefined`,
            // so a group whose location picker never fired has no coordinates
            // at all. Such a group cannot honestly be called "nearby", so it is
            // dropped rather than padded into the result set.
            if (!search) {
                rows = rows.filter(
                    (g) => g._rawDistanceMi != null && g._rawDistanceMi <= maxRadius
                );
            }
        }
    }

    // Final shape — add venue_type discriminator and normalize fields
    // so the frontend map/list components can render home groups alongside
    // regular venues.
    return rows.map((g) => {
        const settings = g.settings || {};
        let stakes = [];
        let games = [];
        let tournaments = [];
        
        if (Array.isArray(settings.tables)) {
            settings.tables.forEach(t => {
                const gameName = t.game_type ? t.game_type.toUpperCase() : 'POKER';
                if (!games.includes(gameName)) games.push(gameName);
                if (t.stakes) {
                    const stakeStr = `${t.stakes}`;
                    if (!stakes.includes(stakeStr)) stakes.push(stakeStr);
                }
            });
        }
        
        if (Array.isArray(settings.tournaments)) {
            settings.tournaments.forEach((t, i) => {
                tournaments.push({
                    id: 'hg-t-' + i,
                    tournament_name: (t.buy_in ? `$${t.buy_in} ` : '') + (t.tournament_name || 'Bounty Tournament'),
                    start_time: g.typical_time || '',
                    buy_in: t.buy_in || 0,
                    guaranteed: null,
                    _is_today: true // Display always if it's rendered
                });
            });
        }

        // PRIVACY (audit 2026-08-12, finding C-1): never emit a home group's
        // real coordinate. Snap to the shared privacy grid — the SAME helper
        // discover.js uses, so the two endpoints can no longer drift apart and
        // report different points for the same group.
        const _priv = jitterCoord(g.id, g.latitude, g.longitude);

        return {
            id: g.id,                                // UUID (intentionally string, not int)
            name: g.name,
            description: g.description,
            tagline: g.tagline,
            venue_type: 'home_game',                 // Discriminator for frontend
            // UNIFICATION (audit 2026-08-14): the canonical destination for
            // this group, from the ONE shared URL builder. VenueMap's popup
            // reads venue.detailUrl; before this, no home-game adapter set it,
            // so the popup fell through to /hub/venues/<uuid> while the
            // marker's onVenueClick used slug/club_code — the same pin
            // navigated to two different pages.
            detailUrl: homeGameUrl(g),
            club_code: g.club_code || null,
            city: g.city,
            state: g.state,
            // Jittered ~0.3mi. Stable per-group. Do NOT replace with g.latitude.
            latitude: _priv.lat,
            longitude: _priv.lng,
            approximate_lat: _priv.lat,
            approximate_lng: _priv.lng,
            profile_photo_url: g.profile_photo_url,
            cover_photo_url: g.cover_photo_url,
            logo_url: g.profile_photo_url,           // Alias — some components read logo_url
            default_game_type: g.default_game_type,
            default_stakes: g.default_stakes,
            typical_buyin_min: g.typical_buyin_min,
            typical_buyin_max: g.typical_buyin_max,
            frequency: g.frequency,
            typical_day: g.typical_day,
            typical_time: g.typical_time,
            member_count: g.member_count,
            games_hosted: g.games_hosted,
            follower_count: g.follower_count ?? 0,
            slug: g.slug,
            social_page_id: g.social_page_id,
            owner_id: g.owner_id,
            created_at: g.created_at,
            last_activity_at: g.last_activity_at,
            distance_km: g.distance_km,
            distance_mi: g.distance_mi,
            stakes_cash: stakes,
            games_offered: games,
            daily_tournaments: tournaments,
            has_tournaments: tournaments.length > 0,
            settings: settings,
            // Fields that regular venues have but home groups don't —
            // nulled out so the frontend doesn't crash on missing keys.
            address: null,
            zip_code: null,
            phone: null,
            website: null,
            commander_enabled: false,
            is_suppressed: false,
        };
    });
}

// NOTE: the former `findDailyTournaments` fuzzy matcher was removed.
// Its only data source (data/daily-tournament-schedules.json) has been an
// empty array for a long time, so the matcher returned null on its very
// first line and the four-pass scan below it was unreachable. The single
// venue path now flags `schedule_unavailable` instead, so the venue page
// can render "schedule not yet published" rather than an empty list.

/**
 * Cap a result list while preserving relevance order.
 *
 * The poker_venues query is already capped by .range(), but the social-page /
 * home-group merge appends up to 500 more entries afterwards and nothing ever
 * sliced the combined array — so `?limit=5` (the typeahead) came back with
 * hundreds of rows.
 *
 * IMPORTANT: only the MERGED entries may be trimmed. The core rows have already
 * been paged upstream (`.range(offset, offset + maxResults - 1)` for Supabase,
 * `.slice(offset, offset + maxResults)` for the JSON fallback), and the client
 * asks for the next page at `offset + limit` in that same underlying source —
 * so any core row dropped here would be skipped over by the following request
 * and never rendered at all. Merged entries are appended after paging and only
 * on the first page, so trimming those loses nothing that a later page would
 * have carried.
 *
 * Entries are identified by the `_merged_social` marker attached at concat time
 * (not by `is_social_page`, which the linked-page enrichment also sets on real
 * poker_venues rows). The marker is stripped before the response is sent.
 */
function capVenues(list, max) {
    if (!Array.isArray(list) || !(max > 0) || list.length <= max) return list;

    const merged = [];
    const core = [];
    for (const v of list) {
        if (v && v._merged_social === true) merged.push(v);
        else core.push(v);
    }
    if (merged.length === 0) return list.slice(0, max);

    // Reserve roughly 30% of the requested page size for clubs / charities /
    // home games so they are not crowded out, without ever evicting a core row.
    const mergedQuota = Math.max(1, Math.ceil(max * 0.3));
    if (core.length <= max && merged.length <= mergedQuota) return list;

    const kept = new Set(core.slice(0, max));
    merged.slice(0, mergedQuota).forEach(v => kept.add(v));
    return list.filter(v => kept.has(v));
}

/**
 * Load venues from JSON file data with in-memory cache + ID index
 */
function getJsonVenues() {
    const now = Date.now();
    if (_jsonVenueCache && (now - _jsonVenueCacheTime) < CACHE_TTL) {
        return _jsonVenueCache;
    }
    const raw = allVenuesData?.venues || [];
    // Load ALL venues — visibility is controlled exclusively by is_active flag, never hardcoded IDs
    _jsonVenueCache = raw;
    _jsonVenueCacheTime = now;
    // Build O(1) lookup Map
    _venueByIdMap = new Map();
    for (const v of _jsonVenueCache) {
        _venueByIdMap.set(String(v.id), v);
    }
    return _jsonVenueCache;
}

/** Get venue by ID in O(1) — returns reference from cached array */
function getVenueById(venueId) {
    if (!_venueByIdMap) getJsonVenues(); // ensure map is built
    return _venueByIdMap.get(String(venueId)) || null;
}

/**
 * Apply filters to a venues array (used for JSON fallback path)
 */
function applyFilters(venues, { id, state, city, type, tournaments, search, featured }) {
    let filtered = [...venues];

    // Mirror Supabase's is_active + is_suppressed filters.
    // Exception: single-venue lookup by ID always returns the venue regardless of active status.
    if (!id) {
        // Bug #7 Fix: also gate on is_suppressed — suppressed venues must NEVER appear
        // in JSON fallback results, even when Supabase is down.
        filtered = filtered.filter(v => v.is_active !== false && v.is_suppressed !== true);
    }

    if (id) {
        filtered = filtered.filter(v => String(v.id) === String(id));
    }

    if (state) {
        filtered = filtered.filter(v => v.state && v.state.toUpperCase() === state.toUpperCase());
    }

    if (city) {
        const cityLower = city.toLowerCase();
        filtered = filtered.filter(v => v.city && v.city.toLowerCase().includes(cityLower));
    }

    if (type) {
        // Merge card_room into poker_club — they're the same thing
        if (type === 'poker_club') {
            filtered = filtered.filter(v => v.venue_type === 'poker_club' || v.venue_type === 'card_room');
        } else {
            filtered = filtered.filter(v => v.venue_type === type);
        }
    }

    if (tournaments === 'true') {
        filtered = filtered.filter(v => v.has_tournaments === true);
    }

    if (search) {
        const searchLower = search.toLowerCase().trim();
        // Check if search term is a state name/abbreviation
        const searchStateAbbrev = resolveStateAbbrev(search.trim());

        // Handle "City, State" format (e.g., "Chicago, IL" or "Las Vegas, NV")
        const cityStateMatch = search ? search.match(/^([^,]+),\s*(.+)$/) : null;
        if (cityStateMatch) {
            const cityPart = cityStateMatch[1].trim().toLowerCase();
            const statePart = cityStateMatch[2].trim();
            const stateAbbrev = resolveStateAbbrev(statePart);
            filtered = filtered.filter(v => {
                const cityMatch = v.city && v.city.toLowerCase().includes(cityPart);
                const stateMatch = stateAbbrev
                    ? (v.state && v.state.toUpperCase() === stateAbbrev)
                    : (v.state && v.state.toLowerCase().includes(statePart.toLowerCase()));
                // Require both city and state match when "City, State" format is used
                return cityMatch && stateMatch;
            });
        } else {
            filtered = filtered.filter(v =>
                (v.name && v.name.toLowerCase().includes(searchLower)) ||
                (v.city && v.city.toLowerCase().includes(searchLower)) ||
                (v.address && v.address.toLowerCase().includes(searchLower)) ||
                (searchStateAbbrev && v.state && v.state.toUpperCase() === searchStateAbbrev)
            );
        }
    }

    if (featured === 'true') {
        filtered = filtered.filter(v => v.is_featured === true);
    }

    return filtered;
}

export default async function handler(req, res) {
  let homeGroups = [];
  // Captured as soon as the query string is parsed so the degraded fallback in
  // the catch below can honour the caller's filters instead of answering every
  // failure with the entire nationwide list.
  let requestFilters = null;
  let requestMaxResults = 1000;
  try {
    // CDN cache: fresh for 120s, serve stale up to 600s
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    }

    if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed' } });
      }

      try {
          const {
              id: _id,
              state: _state,
              city: _city,
              type: _type,
              venue_type: _venue_type,
              tournaments: _tournaments,
              search: _search,
              lat: _lat,
              lng: _lng,
              radius: _radius = 100,
              limit: _limit = 10000,
              featured: _featured,
              hasNLH: _hasNLH,
              hasPLO: _hasPLO,
              hasMixed: _hasMixed,
          } = req.query;

          // [B1 FIX] Guard against array injection — Next.js parses ?search[]=A&search[]=B as an array.
          // Passing an array to .ilike() silently breaks the Supabase filter (matches nothing).
          const safeStr = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : (v === 0 ? '0' : v);
          const id = safeStr(_id);
          const state = safeStr(_state);
          const city = safeStr(_city);
          const type = safeStr(_type);
          const venue_type = safeStr(_venue_type);
          const tournaments = safeStr(_tournaments);
          const search = safeStr(_search);
          const lat = safeStr(_lat);
          const lng = safeStr(_lng);
          const radius = safeStr(_radius) || 100;
          const limit = safeStr(_limit) || 10000;
          const featured = safeStr(_featured);
          const hasNLH = safeStr(_hasNLH);
          const hasPLO = safeStr(_hasPLO);
          const hasMixed = safeStr(_hasMixed);
          // user_state: optional 2-letter state code derived from GPS label on client (e.g. 'IL')
          // Used to include no-coordinate venues from the same state when GPS browsing.
          const user_state = safeStr(req.query.user_state);

          // [GEOFENCE FIX] City-search auto-geocoding:
          // If no GPS (lat/lng) was provided but search looks like "City, State",
          // resolve the city to built-in coordinates so the bounding-box filter
          // can capture cross-state venues (e.g. "Chicago, IL" → include Hammond IN).
          let effectiveLat = lat;
          let effectiveLng = lng;
          let effectiveRadius = radius;
          if (!lat && !lng && search) {
              // Normalize to "city, state" format for lookup key matching
              // "Chicago, IL" → "chicago, il" | "Chicago,IL" → "chicago, il"
              const rawSearch = search.trim().toLowerCase()
                  .replace(/\s*,\s*/g, ', ')   // normalize comma+space
                  .replace(/[()'"\s;]+$/, '')  // strip trailing junk
                  .replace(/^[()'"\s;]+/, ''); // strip leading junk
              const cityCoords = BUILTIN_CITY_COORDS[rawSearch];
              if (cityCoords) {
                  effectiveLat = String(cityCoords.lat);
                  effectiveLng = String(cityCoords.lng);
                  effectiveRadius = effectiveRadius || '50'; // default 50mi for city searches
              } else {
                  // [GEOFENCE SUBURB FIX] If not in builtin map, but looks like a valid City, State (min 2 chars for city)
                  // dynamically resolve using free Nominatim API so suburban users (e.g. Oak Lawn, IL)
                  // aren't stuck with 0 venues when searching for their city.
                  const cityMatch = rawSearch.match(/^([^,]{2,}),\s*([a-z]{2})$/);
                  if (cityMatch) {
                      const geo = await geocodeCity(cityMatch[1].trim(), cityMatch[2].trim());
                      if (geo) {
                          effectiveLat = String(geo.lat);
                          effectiveLng = String(geo.lng);
                          effectiveRadius = effectiveRadius || '50';
                      }
                      // On a miss/timeout we simply fall through to the state/city
                      // filter path below rather than stalling the whole request.
                  }
              }
          }


          const maxResults = Math.min(parseInt(limit, 10) || 1000, 1000);
          const offset = parseInt(req.query.offset, 10) || 0;
          // Merge 'type' and 'venue_type' so both ?type=casino and ?venue_type=casino work
          const effectiveType = type || venue_type || null;
          requestMaxResults = maxResults;
          requestFilters = { id, state, city, type: effectiveType, tournaments, search, featured };
          let venues = [];

          if (id) {
              const sb = getSupabase();
              const numericId = parseInt(id, 10);
              const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
              if (isUuid) {
                  // Phase 41: Native UUID lookup for Home Games (commander_home_groups)
                  const { data: homeGroup } = await sb.from('commander_home_groups').select(`
                      id, name, description, tagline, city, state, latitude, longitude,
                      profile_photo_url, cover_photo_url, default_game_type, default_stakes,
                      typical_buyin_min, typical_buyin_max, frequency, typical_day, typical_time,
                      member_count, games_hosted, is_active, settings, owner_id
                  `).eq('id', id).maybeSingle();
                  
                  if (homeGroup && homeGroup.is_active !== false) {
                      const { data: page } = await sb.from('social_pages')
                          .select('id, follower_count, slug')
                          .eq('linked_entity_type', 'home_group')
                          .eq('linked_entity_id', homeGroup.id)
                          .maybeSingle();

                      // Derive stakes / games / tournaments from `settings`, the
                      // same way fetchPublicHomeGroups does for the list. This
                      // branch used to hardcode has_tournaments:false and never
                      // read settings.tournaments, so a home game showing
                      // "$40 Bounty Tournament" on Poker Near Me rendered
                      // "schedule not yet published" on its own detail page.
                      const hgSettings = homeGroup.settings || {};
                      const hgStakes = [];
                      const hgGames = [];
                      const hgTournaments = [];
                      if (Array.isArray(hgSettings.tables)) {
                          hgSettings.tables.forEach(t => {
                              const gameName = t.game_type ? String(t.game_type).toUpperCase() : 'POKER';
                              if (!hgGames.includes(gameName)) hgGames.push(gameName);
                              if (t.stakes) {
                                  const stakeStr = `${t.stakes}`;
                                  if (!hgStakes.includes(stakeStr)) hgStakes.push(stakeStr);
                              }
                          });
                      }
                      if (Array.isArray(hgSettings.tournaments)) {
                          hgSettings.tournaments.forEach((t, i) => {
                              hgTournaments.push({
                                  id: 'hg-t-' + i,
                                  tournament_name: (t.buy_in ? `$${t.buy_in} ` : '') + (t.tournament_name || t.name || 'Bounty Tournament'),
                                  start_time: t.scheduled_time || t.time || homeGroup.typical_time || '',
                                  buy_in: t.buy_in || 0,
                                  guaranteed: null,
                                  _is_today: true,
                              });
                          });
                      }

                      venues = [{
                          id: homeGroup.id,
                          name: homeGroup.name,
                          description: homeGroup.description,
                          tagline: homeGroup.tagline,
                          venue_type: 'home_game',
                          city: homeGroup.city,
                          state: homeGroup.state,
                          // PRIVACY (audit C-1): this single-venue-by-id branch
                          // is a SECOND home-game emission site and was still
                          // returning the raw host coordinate after the list
                          // path was fixed. Same shared helper, same guarantee.
                          latitude: jitterCoord(homeGroup.id, homeGroup.latitude, homeGroup.longitude).lat,
                          longitude: jitterCoord(homeGroup.id, homeGroup.latitude, homeGroup.longitude).lng,
                          profile_photo_url: homeGroup.profile_photo_url,
                          cover_photo_url: homeGroup.cover_photo_url,
                          logo_url: homeGroup.profile_photo_url,
                          default_game_type: homeGroup.default_game_type,
                          default_stakes: homeGroup.default_stakes,
                          typical_buyin_min: homeGroup.typical_buyin_min,
                          typical_buyin_max: homeGroup.typical_buyin_max,
                          frequency: homeGroup.frequency,
                          typical_day: homeGroup.typical_day,
                          typical_time: homeGroup.typical_time,
                          member_count: homeGroup.member_count,
                          games_hosted: homeGroup.games_hosted,
                          follower_count: page?.follower_count || 0,
                          slug: page?.slug || null,
                          settings: homeGroup.settings || {},
                          owner_id: homeGroup.owner_id,
                          social_page_id: page?.id || null,
                          address: null,
                          zip_code: null,
                          phone: null,
                          website: null,
                          commander_enabled: false,
                          is_suppressed: false,
                          stakes_cash: hgStakes,
                          games_offered: hgGames,
                          daily_tournaments: hgTournaments,
                          has_tournaments: hgTournaments.length > 0,
                      }];
                  }
              } else if (!isNaN(numericId) && numericId >= 1) {
                  // Numeric ID: standard lookup
                  try {
                      const { data, error } = await sb.from('poker_venues')
                          .select('*')
                          .eq('id', numericId)
                          .maybeSingle();

                      if (!error && data) {
                          // Bug #6 Fix: reject suppressed venues even on direct ID lookup
                          if (data.is_suppressed) {
                              return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Venue not found' } });
                          }
                          venues = [data];
                      } else {
                          throw new Error(error?.message || 'Not found in Supabase');
                      }
                  } catch (dbError) { 
                      console.warn('[App] Handled exception:', dbError?.message || dbError);
                  }

                  // Supabase miss/outage: fall back to the JSON dataset (cloned), and
                  // 404 instead of falling through to the list path, which returned
                  // `data: []` (array) where clients expect a venue object.
                  if (venues.length === 0) {
                      const jsonVenue = getVenueById(numericId);
                      if (jsonVenue && !jsonVenue.is_suppressed) {
                          venues = [{ ...jsonVenue }];
                      } else {
                          return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Venue not found' } });
                      }
                  }
              } else {
                  // Non-numeric ID (slug): search by slug/bravo_slug in JSON data
                  const slug = String(id).toLowerCase();
                  const jsonVenues = getJsonVenues();
                  
                  // Build slug variants: original, pa- stripped, clean
                  const slugVariants = [slug];
                  if (slug.startsWith('pa-')) slugVariants.push(slug.slice(3));
                  
                  // Pass 1: Exact slug/bravo_slug match across all variants
                  let slugMatch = null;
                  for (const sv of slugVariants) {
                      slugMatch = jsonVenues.find(v => 
                          (v.slug && v.slug.toLowerCase() === sv) || 
                          (v.bravo_slug && v.bravo_slug.toLowerCase() === sv) ||
                          (v.name && v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') === sv)
                      );
                      if (slugMatch) break;
                  }
                  
                  // Pass 2: Normalized name match (decode -amp- → &, strip prefixes)
                  if (!slugMatch) {
                      const cleanSlug = (slug.startsWith('pa-') ? slug.slice(3) : slug);
                      const searchName = cleanSlug
                          .replace(/-amp-/g, ' & ')
                          .replace(/-s-/g, "'s ")
                          .replace(/-/g, ' ')
                          .trim();
                      const searchNorm = searchName.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
                      
                      slugMatch = jsonVenues.find(v => {
                          if (!v.name) return false;
                          const vNorm = v.name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
                          return vNorm === searchNorm;
                      });
                      
                      // Pass 3: Significant word overlap (with false-positive guards)
                      if (!slugMatch) {
                          const stopWords = new Set([
                              'casino', 'resort', 'hotel', 'poker', 'room', 'the', 'and', 'at', 'of', 'in',
                              'bar', 'lounge', 'club', 'card', 'house', 'center', 'spa',
                              'las', 'vegas', 'city', 'park', 'lake', 'valley', 'north', 'south', 'east', 'west',
                              'series', 'classic', 'championship', 'tournament',
                          ]);
                          const seriesPattern = /\b(series|classic|championship|circuit)\b/i;
                          const queryWords = searchNorm.split(' ').filter(w => w.length >= 3 && !stopWords.has(w));
                          if (queryWords.length >= 1) {
                              let bestScore = 0;
                              for (const v of jsonVenues) {
                                  if (!v.name) continue;
                                  // Skip tour/series entries
                                  if (seriesPattern.test(v.name)) continue;
                                  if (v.venue_type === 'series' || v.venue_type === 'tour') continue;
                                  const vNorm = v.name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
                                  const vWords = vNorm.split(' ').filter(w => w.length >= 3 && !stopWords.has(w));
                                  const shared = queryWords.filter(w => vWords.includes(w)).length;
                                  const score = shared / Math.max(queryWords.length, vWords.length);
                                  const minShared = queryWords.length >= 2 ? 2 : 1;
                                  if (shared >= minShared && score >= 0.6 && score > bestScore) {
                                      bestScore = score;
                                      slugMatch = v;
                                  }
                              }
                          }
                      }
                  }
                  
                  if (slugMatch) {
                      // Clone: slugMatch is a reference into the module-level JSON cache
                      // and the single-venue path below writes daily_tournaments onto it,
                      // which would leak into later requests.
                      venues = [{ ...slugMatch }];
                  } else {
                      // Try Supabase text search as last resort
                      try {
                          const cleanSlug = (slug.startsWith('pa-') ? slug.slice(3) : slug);
                          const searchName = cleanSlug
                              .replace(/-amp-/g, ' & ')
                              .replace(/-s-/g, 's ')
                              .replace(/-/g, ' ');
                          // [VA1 FIX] Sanitize PostgREST-special chars from slug-derived searchName
                          const sanitizedSlugSearch = searchName.trim().slice(0, 200).replace(/[()'\",.;]/g, '');
                          const { data } = await getSupabase()
                              .from('poker_venues')
                              .select('*')
                              .ilike('name', `%${sanitizedSlugSearch}%`)
                              .limit(1);
                          if (data && data.length > 0) {
                              venues = [data[0]];
                          }
                      } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                      if (venues.length === 0) {
                          return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Venue not found' } });
                      }
                  }
              }
          } else {
              // --- Venue listing: Supabase-first (live 500+ venue dataset) ---
              let usedSupabase = false;
              try {
                  let q = getSupabase()
                      .from('poker_venues')
                      .select('*')
                      .eq('is_active', true)
                      .eq('is_suppressed', false) // Bug #1 Fix: never serve suppressed venues

                  const useBoundingBox = !!(effectiveLat && effectiveLng && effectiveRadius);
                  
                  if (useBoundingBox) {
                      const userLat = parseFloat(effectiveLat);
                      const userLng = parseFloat(effectiveLng);
                      const radiusMi = Math.min(Math.max(0, parseFloat(effectiveRadius) || 50), 150); // server cap: 150mi max
                      if (!isNaN(userLat) && !isNaN(userLng)) {
                          // 1 degree latitude ≈ 69 miles; 1 degree longitude ≈ 69*cos(lat) miles.
                          // Pad by 20% so bounding box is always larger than the radius circle.
                          const latDelta = (radiusMi / 69) * 1.2;
                          const lngDelta = (radiusMi / (69 * Math.cos(userLat * Math.PI / 180))) * 1.2;
                          q = q.gte('latitude', userLat - latDelta)
                               .lte('latitude', userLat + latDelta)
                               .gte('longitude', userLng - lngDelta)
                               .lte('longitude', userLng + lngDelta);
                      }
                  } else {
                      if (state) {
                          q = q.ilike('state', state.length === 2 ? state.toUpperCase() : `%${state}%`);
                      } else if (lat && lng && user_state) {
                          // GPS active without radius — fallback: same-state filter to avoid global top-500
                          q = q.ilike('state', user_state.toUpperCase());
                      }
                  }

                  if (city && !useBoundingBox) {
                      q = q.ilike('city', `%${city}%`);
                  }
                  if (effectiveType) {
                      // Merge card_room into poker_club — they're the same thing
                      if (effectiveType === 'poker_club') {
                          q = q.in('venue_type', ['poker_club', 'card_room']);
                      } else {
                          q = q.eq('venue_type', effectiveType);
                      }
                  } else if (!search && !id) {
                      // Always exclude tour/series parent entries — they are metadata containers,
                      // not playable venues. Tour stops are served by the tour-schedule API.
                      q = q.not('venue_type', 'in', '("tour","series")');
                  }
                  if (tournaments === 'true') q = q.eq('has_tournaments', true);
                  if (featured === 'true') q = q.eq('is_featured', true);
                  if (search) {
                      // [GEOFENCE FIX] Check for "City, State" format BEFORE sanitizing —
                      // the sanitizer strips commas which breaks the comma-based split.
                      // "Chicago, IL".replace(/,/g,'') → "Chicago  IL" → no cityStateMatch.
                      const rawTrimmed = search.trim().slice(0, 200);
                      const cityStateMatch = rawTrimmed.match(/^([^,]+),\s*(.+)$/);

                      if (cityStateMatch) {
                          // Each part is sanitized individually (safe for PostgREST with individual filters)
                          const cityPart = cityStateMatch[1].trim().replace(/[()'\";\s]/g, '');
                          const statePart = cityStateMatch[2].trim().replace(/[()'\";\s]/g, '');
                          const stateAbbrev = resolveStateAbbrev(statePart);
                          // [GEOFENCE FIX] When we have effective coordinates (from real GPS OR auto-geocoded
                          // from city name), skip the state filter entirely — let the bounding box + distance
                          // filter handle inclusion. This allows cross-state venues within the radius to appear.
                          if (effectiveLat && effectiveLng) {
                              // GPS or auto-geocoded: bounding box already applied above. No state restriction.
                              // If it's truly a city search, don't restrict by city name either (bounding box handles it)
                          } else {
                              q = q.ilike('city', `%${cityPart}%`);
                              if (stateAbbrev) q = q.ilike('state', stateAbbrev);
                              else q = q.ilike('state', `%${statePart}%`);
                          }
                      } else {
                          // Not a "City, State" pattern — sanitize fully and do generic text search
                          const sanitizedSearch = rawTrimmed.replace(/[()'\",.;]/g, '');
                          const searchStateAbbrev = resolveStateAbbrev(sanitizedSearch);
                          if (searchStateAbbrev) {
                              q = q.ilike('state', searchStateAbbrev);
                          } else {
                              q = q.or(`name.ilike.%${sanitizedSearch}%,city.ilike.%${sanitizedSearch}%,address.ilike.%${sanitizedSearch}%,state.ilike.%${sanitizedSearch}%`);
                          }
                      }
                  }

                  // No artificial cap — return ALL venues
                  q = q.order('trust_score', { ascending: false, nullsFirst: false }).range(offset, offset + maxResults - 1);
                  const { data: dbVenues, error: dbErr, count: dbCount } = await q;

                  // A successful query is authoritative even when it returns 0 rows for a
                  // page past the end of the result set: treating that as "no data" made
                  // those requests fall back to the JSON dataset (which ignores `offset`),
                  // so infinite scroll restarted from venue #1 and never ended.
                  // On the FIRST page an empty result still falls through to the JSON
                  // dataset — that fallback covers venues the DB does not carry, and
                  // removing it would blank out the listing entirely.
                  if (!dbErr && (offset > 0 || (dbVenues && dbVenues.length > 0))) {
                      // Exclude "Harrahs Joliet" — confirmed no poker room at this location
                      venues = (dbVenues || []).filter(v => !(v.name?.toLowerCase().includes('harrah') && v.name?.toLowerCase().includes('joliet')));
                      usedSupabase = true;
                  }
              } catch (dbErr) {
                  console.warn('[venues] Supabase query failed, falling back to JSON:', dbErr.message);
              }

              // JSON fallback if Supabase returned nothing
              if (!usedSupabase) {
                  venues = applyFilters(getJsonVenues(), { state, city, type: effectiveType, tournaments, search, featured })
                      // Exclude "Harrahs Joliet" — confirmed no poker room at this location
                      .filter(v => !(v.name?.toLowerCase().includes('harrah') && v.name?.toLowerCase().includes('joliet')))
                      // Copy: everything downstream (social-page enrichment, daily_tournaments
                      // injection, name title-casing) mutates these objects, and the JSON array
                      // is a module-level cache shared by every request on this lambda.
                      .map(v => ({ ...v }));
              }
              venues.sort((a, b) => (b.trust_score || 0) - (a.trust_score || 0));

              // The JSON fallback ignored `limit` and `offset` entirely and returned
              // the whole nationwide file on every request. Page it the same way the
              // Supabase branch is paged (which happens in .range()).
              if (!usedSupabase) {
                  venues = venues.slice(offset, offset + maxResults);
              }

              // Only `poker_venues` is paginated (the .range() above). The
              // social-page / home-group merge below is NOT — it used to run on
              // every page of an infinite scroll and re-append the same up-to-500
              // entries each time, duplicating every club/charity/home-game card
              // (and keeping `hasMore` true forever because the page always came
              // back full). The merged entries belong to the first page only.
              if (offset === 0) {
                  // --- Merge public social pages (clubs, charities, home games) ---
                  // Linked pages enrich their parent JSON venue; unlinked pages create new entries
                  try {
                      // Pass the effective GPS box through — the helper's radius logic
                      // was dead code because lat/lng/radius were never supplied.
                      homeGroups = await fetchPublicHomeGroups({
                          state,
                          city,
                          search,
                          effectiveType,
                          lat: effectiveLat,
                          lng: effectiveLng,
                          radius: effectiveRadius,
                      });
                  } catch (e) {
                      console.warn('[venues] Home group UNION failed (non-fatal):', e.message);
                  }
                  const homeGroupMap = new Map();
                  for (const hg of homeGroups) {
                      homeGroupMap.set(String(hg.id), hg);
                  }

                  try {
                      let spQuery = getSupabase()
                          .from('social_pages')
                          .select('id, slug, name, description, avatar_url, page_type, location_city, location_state, follower_count, metadata, linked_venue_id, owner_id, linked_entity_id, linked_entity_type')
                          .eq('is_public', true)
                          .not('location_city', 'is', null);

                  // Apply matching filters to social pages query
                  if (state) spQuery = spQuery.ilike('location_state', state);
                  if (city) spQuery = spQuery.ilike('location_city', `%${city}%`);
                  if (effectiveType && ['club', 'charity', 'home_game'].includes(effectiveType)) {
                      spQuery = spQuery.eq('page_type', effectiveType);
                  } else if (effectiveType && ['poker_club'].includes(effectiveType)) {
                      // poker_club maps to club page_type
                      spQuery = spQuery.eq('page_type', 'club');
                  } else if (effectiveType && !['club', 'charity', 'home_game', 'poker_club'].includes(effectiveType)) {
                      // Type filter is for a poker_venues-only type (e.g. 'casino'), skip social pages
                      spQuery = null;
                  }
                  if (search) {
                      const sanitizedSearch = search.trim().slice(0, 200).replace(/[()'",.;]/g, '');
                      const searchAbbrev = resolveStateAbbrev(sanitizedSearch);
                      const searchStateName = STATE_ABBREV_TO_NAME[sanitizedSearch.toUpperCase()];
                      // Build OR filter: name, city, state (verbatim), plus abbreviation/full-name if resolved
                      let orParts = [`name.ilike.%${sanitizedSearch}%`, `location_city.ilike.%${sanitizedSearch}%`, `location_state.ilike.%${sanitizedSearch}%`];
                      if (searchAbbrev) orParts.push(`location_state.ilike.${searchAbbrev}`);
                      if (searchStateName) orParts.push(`location_state.ilike.${searchStateName}`);
                      spQuery = spQuery?.or(orParts.join(','));
                  }

                  if (spQuery) {
                      const { data: socialPages } = await spQuery.limit(500);
                      if (socialPages && socialPages.length > 0) {
                          const DAYS_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                          // Extract day in US Eastern Time to prevent Vercel UTC drift
                          const localCurrentTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
                          const todayIdx = new Date(localCurrentTime).getDay();
                          const todayKey = DAYS_ORDER[todayIdx];

                          // --- Batch tournament detection ---
                          // Resolve owner_ids → club_ids → tournament counts
                          const ownerIds = [...new Set(socialPages.map(sp => sp.owner_id).filter(Boolean))];
                          let clubsByOwner = {};
                          let tournamentCountByClub = {};
                          if (ownerIds.length > 0) {
                              try {
                                  const { data: clubs } = await getSupabase()
                                      .from('clubs')
                                      .select('id, owner_id, name')
                                      .in('owner_id', ownerIds)
                                      .limit(500);
                                  if (clubs) {
                                      for (const c of clubs) {
                                          if (!clubsByOwner[c.owner_id]) clubsByOwner[c.owner_id] = [];
                                          clubsByOwner[c.owner_id].push(c);
                                      }
                                      const clubIds = clubs.map(c => c.id);
                                      if (clubIds.length > 0) {
                                          const { data: tourneys } = await getSupabase()
                                              .from('tournaments')
                                              .select('club_id')
                                              .in('club_id', clubIds)
                                              .in('status', ['ANNOUNCED', 'RUNNING', 'SCHEDULED'])
                                              .gte('start_time', new Date().toISOString())
                                              .limit(500);
                                          if (tourneys) {
                                              for (const t of tourneys) {
                                                  tournamentCountByClub[t.club_id] = (tournamentCountByClub[t.club_id] || 0) + 1;
                                              }
                                          }
                                      }
                                  }
                              } catch (clubErr) {
                                  console.warn('[venues] Club/tournament lookup failed (non-fatal):', clubErr.message);
                                  captureError(clubErr, { tags: { api: 'poker-venues', stage: 'tournament-detection' } });
                              }
                          }

                          // Helper: check if a social page has upcoming tournaments
                          const pageHasTournaments = (sp) => {
                              const ownerClubs = clubsByOwner[sp.owner_id] || [];
                              // Try name match first, then fallback to any club by this owner
                              const matchedClub = ownerClubs.find(c => c.name.toLowerCase() === sp.name.toLowerCase()) || ownerClubs[0];
                              return matchedClub ? (tournamentCountByClub[matchedClub.id] || 0) > 0 : false;
                          };

                          // Helper: extract game types from run_schedule metadata
                          const extractGames = (schedule) => {
                              const games = new Set();
                              for (const dayData of Object.values(schedule || {})) {
                                  if (dayData && dayData.games && Array.isArray(dayData.games)) {
                                      dayData.games.forEach(g => games.add(g));
                                  }
                              }
                              return [...games];
                          };

                          // Separate linked vs unlinked pages
                          const linkedPages = socialPages.filter(sp => sp.linked_venue_id);
                          const unlinkedPages = socialPages.filter(sp => !sp.linked_venue_id);

                          addBreadcrumb({
                              category: 'poker-venues',
                              message: `Social page merge: ${socialPages.length} total, ${linkedPages.length} linked, ${unlinkedPages.length} unlinked`,
                              data: { total: socialPages.length, linked: linkedPages.length, unlinked: unlinkedPages.length },
                          });

                          // --- Enrich JSON venues that have a linked social page ---
                          const missedLinkedPages = []; // Pages whose linked_venue_id is NOT in JSON
                          // id -> slot index in the response array, so enrichment lands on
                          // the object we actually return.
                          const venueSlotById = new Map();
                          venues.forEach((v, i) => { if (v && v.id != null) venueSlotById.set(String(v.id), i); });
                          for (const sp of linkedPages) {
                              // getVenueById returns a reference INTO the module-level JSON
                              // cache; writing enrichment onto it persisted across requests
                              // (sticky has_tournaments, stale is_today/today_event) and raced
                              // between concurrent requests. Always enrich a COPY.
                              let jsonVenue = null;
                              const slot = venueSlotById.get(String(sp.linked_venue_id));
                              if (slot !== undefined) {
                                  jsonVenue = { ...venues[slot] };
                                  venues[slot] = jsonVenue;
                              } else {
                                  const cachedVenue = getVenueById(sp.linked_venue_id);
                                  if (cachedVenue) jsonVenue = { ...cachedVenue };
                              }
                              if (jsonVenue) {
                                  jsonVenue.is_social_page = true;
                                  jsonVenue.social_page_id = sp.id;
                                  jsonVenue.follower_count = sp.follower_count || jsonVenue.follower_count || 0;
                                  jsonVenue.has_tournaments = jsonVenue.has_tournaments || pageHasTournaments(sp);
                                  if (sp.avatar_url || (sp.metadata && sp.metadata.logo_url)) {
                                      jsonVenue.profile_photo_url = jsonVenue.profile_photo_url || sp.avatar_url || sp.metadata.logo_url;
                                  }
                                  // Inherit coordinates from social page geocoding if JSON venue has none
                                  if (!jsonVenue.latitude && !jsonVenue.longitude) {
                                      const geocoded = (sp.metadata && sp.metadata.geocoded_locations) || {};
                                      const locStr = sp.location_city + (sp.location_state ? ', ' + sp.location_state : '');
                                      const coords = geocoded[locStr] || geocoded[sp.location_city] || null;
                                      if (coords) {
                                          jsonVenue.latitude = coords.lat;
                                          jsonVenue.longitude = coords.lng;
                                      }
                                  }
                                  const schedule = (sp.metadata && sp.metadata.run_schedule) || {};
                                  const schedGames = extractGames(schedule);
                                  if (schedGames.length > 0) {
                                      jsonVenue.games_offered = [...new Set([...(jsonVenue.games_offered || []), ...schedGames])];
                                  }

                                  // Added Charity Date Logic for Linked Pages
                                  if (sp.page_type === 'charity') {
                                      let isOpenToday = false;
                                      let nextEvent = null;
                                      const DAYS_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                                      const localCurrentTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
                                      const todayIdx = new Date(localCurrentTime).getDay();
                                      const todayKey = DAYS_ORDER[todayIdx];

                                      // Compute fallback buy-in from all schedule days
                                      const schedBuyIns = Object.values(schedule || {}).map(d => d?.buy_in).filter(b => b != null && b > 0 && b < 10000);
                                      const schedFallbackBuyIn = schedBuyIns.length > 0 ? schedBuyIns.sort((a,b) => { const f = {}; schedBuyIns.forEach(v => f[v]=(f[v]||0)+1); return (f[b]||0)-(f[a]||0); })[0] : null;
                                      
                                      if (schedule[todayKey] && schedule[todayKey].open && schedule[todayKey].location) {
                                          isOpenToday = true;
                                          // Bug #8 fix: populate today_event so card can show start_time + buy_in
                                          jsonVenue.today_event = {
                                              location: schedule[todayKey].location.trim(),
                                              start_time: schedule[todayKey].start_time || null,
                                              door_open_time: schedule[todayKey].start_time || null,
                                              buy_in: (schedule[todayKey].buy_in > 0 ? schedule[todayKey].buy_in : schedFallbackBuyIn) || null,
                                              state: jsonVenue.state || null,
                                          };
                                      } else {
                                          for (let i = 1; i <= 7; i++) {
                                              const nextIdx = (todayIdx + i) % 7;
                                              const nextDayStr = DAYS_ORDER[nextIdx];
                                              const nextDayData = schedule[nextDayStr];
                                              if (nextDayData && nextDayData.open && nextDayData.location) {
                                                  const dayLabel = nextDayStr.charAt(0).toUpperCase() + nextDayStr.slice(1);
                                                  nextEvent = {
                                                      day: dayLabel,
                                                      days_away: i,
                                                      location: nextDayData.location.trim(),
                                                      start_time: nextDayData.start_time || null,
                                                      door_open_time: nextDayData.start_time || null,
                                                      buy_in: (nextDayData.buy_in > 0 ? nextDayData.buy_in : schedFallbackBuyIn) || null,
                                                  };
                                                  break;
                                              }
                                          }
                                      }
                                      jsonVenue.is_today = isOpenToday;
                                      jsonVenue.next_event = nextEvent;
                                  }
                              } else {
                                  // Linked venue not in JSON dataset — try Supabase poker_venues
                                  missedLinkedPages.push(sp);
                              }
                          }

                          // --- Look up Supabase poker_venues for linked pages not in JSON ---
                          let supabaseVenuesByIdMap = {};
                          if (missedLinkedPages.length > 0) {
                              try {
                                  const missedIds = [...new Set(missedLinkedPages.map(sp => sp.linked_venue_id))];
                                  const { data: pvRows } = await getSupabase()
                                      .from('poker_venues')
                                      .select('id, games_offered, stakes_cash, trust_score, is_featured, has_tournaments, hours_weekday, hours_weekend, poker_tables')
                                      .in('id', missedIds)
                                      .eq('is_active', true)
                                          .limit(100);
                                  if (pvRows) {
                                      for (const pv of pvRows) supabaseVenuesByIdMap[pv.id] = pv;
                                  }
                              } catch (pvErr) {
                                  console.warn('[venues] poker_venues lookup for missed linked pages failed (non-fatal):', pvErr.message);
                                  captureError(pvErr, { tags: { api: 'poker-venues', stage: 'missed-linked-enrichment' } });
                              }
                          }

                          for (const sp of missedLinkedPages) {
                              const pv = supabaseVenuesByIdMap[sp.linked_venue_id];
                              const geocoded = (sp.metadata && sp.metadata.geocoded_locations) || {};
                              const schedule = (sp.metadata && sp.metadata.run_schedule) || {};
                              const hasTourneys = pageHasTournaments(sp) || (pv ? pv.has_tournaments : false);
                              const schedGames = extractGames(schedule);
                              const pvGames = pv ? (pv.games_offered || []) : [];
                              const allGames = [...new Set([...schedGames, ...pvGames])];
                              const primaryLocStr = sp.location_city + (sp.location_state ? ', ' + sp.location_state : '');
                              const primaryCoords = geocoded[primaryLocStr] || geocoded[sp.location_city] || null;

                              // Calculate Charity Open/Next Event Status
                              const charitySched = sp.page_type === 'charity'
                                  ? computeCharitySchedule(schedule)
                                  : { isOpenToday: false, todayLocation: null, todayStartTime: null, todayBuyIn: null, nextEvent: null };
                              const { isOpenToday, todayLocation, todayStartTime, todayBuyIn, nextEvent } = charitySched;

                              unlinkedPages.push({
                                  ...sp,
                                  _enrichedFromPokerVenue: pv || null,
                                  _resolvedGames: allGames,
                                  _resolvedTrustScore: pv ? pv.trust_score : null,
                                  _resolvedIsFeatured: pv ? pv.is_featured : false,
                                  _resolvedHasTournaments: hasTourneys,
                                  _resolvedLatitude: primaryCoords ? primaryCoords.lat : null,
                                  _resolvedLongitude: primaryCoords ? primaryCoords.lng : null,
                                  // BUG-4 FIX: persist charity schedule state so mapper can read it
                                  _charityIsOpenToday: isOpenToday,
                                  _charityTodayLocation: todayLocation,
                                  _charityTodayStartTime: todayStartTime,
                                  _charityTodayBuyIn: todayBuyIn,
                                  _charityNextEvent: nextEvent,
                              });
                          }

                          // --- Map unlinked pages into venue entries ---
                          const mappedPages = [];
                          for (const sp of unlinkedPages) {
                              const geocoded = (sp.metadata && sp.metadata.geocoded_locations) || {};
                              const schedule = (sp.metadata && sp.metadata.run_schedule) || {};
                              const hasTourneys = sp._resolvedHasTournaments != null ? sp._resolvedHasTournaments : pageHasTournaments(sp);
                              const schedGames = sp._resolvedGames || extractGames(schedule);

                              // Determine primary lat/lng from geocoded_locations (or pre-resolved)
                              let primaryLat = sp._resolvedLatitude || null;
                              let primaryLng = sp._resolvedLongitude || null;
                              if (!primaryLat && !primaryLng) {
                                  const primaryLocStr = sp.location_city + (sp.location_state ? ', ' + sp.location_state : '');
                                  const primaryCoords = geocoded[primaryLocStr] || geocoded[sp.location_city] || null;
                                  primaryLat = primaryCoords ? primaryCoords.lat : null;
                                  primaryLng = primaryCoords ? primaryCoords.lng : null;
                              }

                              // Use enriched data when available from poker_venues lookup
                              const trustScore = sp._resolvedTrustScore || null;
                              const isFeatured = sp._resolvedIsFeatured || false;

                              if (sp.page_type === 'charity') {
                                  // Every charity page gets the schedule computation — not only the
                                  // ones promoted out of missedLinkedPages. A charity that registers
                                  // a page with a full metadata.run_schedule but no linked_venue_id
                                  // used to arrive here with both flags undefined and was silently
                                  // dropped from every result set.
                                  const cs = sp._charityIsOpenToday !== undefined
                                      ? {
                                          isOpenToday: sp._charityIsOpenToday,
                                          todayLocation: sp._charityTodayLocation,
                                          todayStartTime: sp._charityTodayStartTime,
                                          todayBuyIn: sp._charityTodayBuyIn,
                                          nextEvent: sp._charityNextEvent,
                                      }
                                      : computeCharitySchedule(schedule);

                                  // Unlinked charities: display if they have an event today OR a future event
                                  if (cs.isOpenToday || cs.nextEvent) {
                                      const isOpen = cs.isOpenToday;
                                      const locKey = isOpen ? cs.todayLocation : cs.nextEvent.location;
                                      const coords = geocoded[locKey] || null;
                                      
                                      // Inherit the latitude/longitude if missing from coords dictionary
                                      let resolveLat = coords ? coords.lat : primaryLat;
                                      let resolveLng = coords ? coords.lng : primaryLng;

                                      mappedPages.push({
                                          id: `sp-${sp.id}-${todayKey}`,
                                          name: sp.name,
                                          city: locKey.split(',')[0]?.trim() || sp.location_city,
                                          state: locKey.split(',')[1]?.trim() || sp.location_state,
                                          venue_type: 'charity',
                                          profile_photo_url: sp.avatar_url,
                                          about: sp.description,
                                          trust_score: trustScore,
                                          is_social_page: true,
                                          social_page_id: sp.id,
                                          follower_count: sp.follower_count || 0,
                                          latitude: resolveLat,
                                          longitude: resolveLng,
                                          games_offered: schedGames || [],
                                          has_tournaments: hasTourneys,
                                          is_featured: isFeatured,
                                          schedule_location: locKey,
                                          schedule_day: todayKey,
                                          is_today: isOpen,
                                          // Bug-9 fix: populate today_event so card can show start_time + buy_in
                                          today_event: isOpen ? {
                                              location: locKey,
                                              start_time: cs.todayStartTime || null,
                                              buy_in: cs.todayBuyIn || null,
                                              state: locKey.split(',')[1]?.trim() || sp.location_state || null,
                                          } : null,
                                          next_event: cs.nextEvent
                                      });
                                  }
                              } else {
                                  let finalGames = schedGames || [];
                                  let finalStakes = [];
                                  let finalHasTourneys = hasTourneys;
                                  let finalDailyTournaments = [];
                                  let finalScheduleString = null;
                                  let hostDisplayName = null;
                                  let hostAvatarUrl = null;
                                  let hostUsername = null;
                                  let hostSocialPageSlug = sp.slug || null;

                                  if (sp.page_type === 'home_game' && sp.linked_entity_id && sp.linked_entity_type === 'home_group') {
                                      const hg = homeGroupMap.get(String(sp.linked_entity_id));
                                      if (hg) {
                                          if (hg.settings) {
                                              if (Array.isArray(hg.settings.tables)) {
                                                  hg.settings.tables.forEach(t => {
                                                      const gName = t.game_type ? t.game_type.toUpperCase() : 'POKER';
                                                      if (!finalGames.includes(gName)) finalGames.push(gName);
                                                      if (t.stakes && !finalStakes.includes(t.stakes)) finalStakes.push(t.stakes);
                                                  });
                                              } else if (hg.default_game_type && hg.default_stakes) {
                                                  finalGames = [hg.default_game_type.toUpperCase()];
                                                  finalStakes = [hg.default_stakes];
                                              }
                                              if (Array.isArray(hg.settings.tournaments) && hg.settings.tournaments.length > 0) {
                                                  finalHasTourneys = true;
                                                  const todayDow = new Date().getDay();
                                                  const dowMap = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 };
                                                  hg.settings.tournaments.forEach((t, i) => {
                                                      // Prefer tournament-specific day(s), fall back to group's typical_day
                                                      const tDay = t.day || t.days || t.typical_day || null;
                                                      const daySource = tDay || hg.typical_day || '';
                                                      const runDays = daySource.split(',').map(d => d.trim().toLowerCase()).filter(d => dowMap[d] !== undefined).map(d => dowMap[d]);
                                                      let isToday = false;
                                                      let daysAway = null;
                                                      if (runDays.length > 0) {
                                                          let minDays = 8;
                                                          runDays.forEach(d => {
                                                              let diff = (d - todayDow + 7) % 7;
                                                              if (diff === 0) isToday = true;
                                                              if (diff < minDays) minDays = diff;
                                                          });
                                                          daysAway = minDays;
                                                      }
                                                      finalDailyTournaments.push({
                                                          id: 'hg-t-' + i,
                                                          tournament_name: t.name || t.tournament_name || 'Bounty Tournament',
                                                          buy_in: t.buy_in || 0,
                                                          start_time: t.scheduled_time || t.time || '00:00:00',
                                                          _tournament_day: tDay || null,
                                                          _is_today: isToday,
                                                          _days_away: daysAway,
                                                      });
                                                  });
                                              }
                                              if (hg.settings.schedule_description) {
                                                  finalScheduleString = hg.settings.schedule_description;
                                              }
                                          }
                                          if (!finalScheduleString && hg.frequency && hg.typical_day) {
                                              const freq = hg.frequency.charAt(0).toUpperCase() + hg.frequency.slice(1).toLowerCase();
                                              const days = hg.typical_day.split(',').map(d => d.trim()).filter(Boolean).map(d => d.charAt(0).toUpperCase() + d.slice(1).toLowerCase()).join(', ');
                                              finalScheduleString = `${freq} On ${days}`;
                                          }
                                          hostDisplayName = sp.name;
                                          hostAvatarUrl = sp.avatar_url;

                                          // Inherit coordinates from commander_home_groups if missing from social_pages geocoding
                                          if (!primaryLat && !primaryLng && hg.latitude && hg.longitude) {
                                              primaryLat = hg.latitude;
                                              primaryLng = hg.longitude;
                                          }
                                      }
                                  }

                                  mappedPages.push({
                                      id: `sp-${sp.id}`,
                                      slug: sp.slug,
                                      name: toTitleCase(sp.name),
                                      city: sp.location_city,
                                      state: sp.location_state,
                                      venue_type: sp.page_type === 'club' ? 'poker_club' : sp.page_type,
                                      profile_photo_url: sp.avatar_url || (sp.metadata && sp.metadata.logo_url) || null,
                                      about: sp.description,
                                      trust_score: trustScore,
                                      is_social_page: true,
                                      social_page_id: sp.id,
                                      follower_count: sp.follower_count || 0,
                                      latitude: primaryLat,
                                      longitude: primaryLng,
                                      games_offered: finalGames,
                                      stakes_cash: finalStakes.length > 0 ? finalStakes : undefined,
                                      has_tournaments: finalHasTourneys,
                                      daily_tournaments: finalDailyTournaments.length > 0 ? finalDailyTournaments : undefined,
                                      schedule: finalScheduleString,
                                      is_featured: isFeatured,
                                      host_display_name: hostDisplayName,
                                      host_avatar_url: hostAvatarUrl,
                                      host_username: hostUsername,
                                      host_social_page_slug: hostSocialPageSlug
                                  });
                              }
                          }
                          // Marker used by capVenues: these entries are appended
                          // AFTER the core page was cut, so they are the only ones
                          // safe to trim when the caller asked for a small limit.
                          venues = venues.concat(mappedPages.map(p => ({ ...p, _merged_social: true })));

                          addBreadcrumb({
                              category: 'poker-venues',
                              message: `Merge complete: ${mappedPages.length} social entries added, ${missedLinkedPages.length} enriched from poker_venues`,
                              data: { mapped: mappedPages.length, missed: missedLinkedPages.length, enriched: Object.keys(supabaseVenuesByIdMap || {}).length },
                          });
                      }
                  }
              } catch (spErr) {
                  console.warn('[venues] Social pages merge failed (non-fatal):', spErr.message);
                  captureError(spErr, { tags: { api: 'poker-venues', stage: 'social-merge' }, level: 'warning' });
              }

              // --- Standalone home groups ---
              // Home groups that DO have a linked social page are already emitted by
              // the mapper above (as `sp-<id>` entries). Groups with no social page
              // were only ever exposed through the top-level `home_groups` envelope,
              // which no frontend reads — so they never rendered anywhere. Fold them
              // into `data` where the list/map components (which already understand
              // the `venue_type: 'home_game'` discriminator) will pick them up.
              try {
                  const standaloneGroups = homeGroups.filter(hg => !hg.social_page_id);
                  if (standaloneGroups.length > 0) {
                      const seenIds = new Set(venues.map(v => String(v.id)));
                      const additions = standaloneGroups
                          .filter(hg => !seenIds.has(String(hg.id)))
                          .map(hg => ({ ...hg, is_social_page: false, _merged_social: true }));
                      venues = venues.concat(additions);
                  }
              } catch (hgErr) {
                  console.warn('[venues] Standalone home group merge failed (non-fatal):', hgErr?.message || hgErr);
              }
              } // end offset === 0 social/home-group merge
          }

          // --- GPS-based distance calculation and filtering ---
          const hasGps = !!(effectiveLat && effectiveLng);
          if (hasGps) {
              const userLat = parseFloat(effectiveLat);
              const userLng = parseFloat(effectiveLng);
              const maxRadius = Math.min(Math.max(0, parseFloat(effectiveRadius) || 100), 150); // Hard cap 150mi limit

              // Validate GPS coordinates
              if (isNaN(userLat) || isNaN(userLng) || userLat < -90 || userLat > 90 || userLng < -180 || userLng > 180) {
                  return res.status(400).json({ success: false, error: 'Invalid GPS coordinates. lat must be -90 to 90, lng must be -180 to 180.' });
              }

              venues = venues.map(venue => {
                  const venueLat = venue.latitude ?? venue.lat;
                  const venueLng = venue.longitude ?? venue.lng;
                  if (venueLat == null || venueLng == null) {
                      return { ...venue, distance_km: null, distance_mi: null };
                  }
                  const distance = calculateDistance(userLat, userLng, parseFloat(venueLat), parseFloat(venueLng));
                  const miles = distance * 0.621371;
                  // PRIVACY (audit C-1): this generic pass runs over the MERGED
                  // list, so it was silently overwriting the whole-mile distance
                  // the home-group path had already computed, restoring 0.1-mile
                  // precision on exactly the rows that must not have it.
                  //
                  // A commercial venue's address is public — 0.1 mile is fine.
                  // A home game's is someone's house: publishing 0.1-mile
                  // distances from several GPS origins is the trilateration
                  // vector the privacy model exists to defeat. Coarsen those.
                  const isHomeGame = venue.venue_type === 'home_game';
                  return {
                      ...venue,
                      distance_km: isHomeGame
                          ? Math.round(distance)
                          : Math.round(distance * 10) / 10,
                      distance_mi: isHomeGame
                          ? Math.round(miles)
                          : Math.round(miles * 10) / 10,
                  };
              });

              if (!search || (search && !lat && !lng)) {
                  // Location-browse OR auto-geocoded city search: filter by radius.
                  // PRIMARY: venues within the radius that have coordinates.
                  const withinRadius = venues.filter(v =>
                      (v.distance_mi != null && v.distance_mi <= maxRadius) ||
                      ['tour', 'series'].includes(v.venue_type)
                  );

                  // FALLBACK: when GPS is active, most venues lack coordinates and get dropped.
                  // Include venues from the user's state (if provided) that have no coordinates,
                  // so the page is never blank just because coordinate data is sparse.
                  let noCoordVenues = [];
                  const effectiveUserState = user_state || state;
                  if (effectiveUserState && lat && lng) { // Only for real GPS (not auto-geocoded)
                      const stateUpper = effectiveUserState.toUpperCase();
                      noCoordVenues = venues.filter(v =>
                          v.distance_mi == null &&
                          !['tour', 'series'].includes(v.venue_type) &&
                          (v.state || '').toUpperCase() === stateUpper
                      );
                  }

                  // Sort: distance-known venues first (nearest to farthest), then no-coord same-state venues
                  withinRadius.sort((a, b) => (a.distance_mi ?? 9999) - (b.distance_mi ?? 9999));
                  noCoordVenues.sort((a, b) => (b.trust_score || 0) - (a.trust_score || 0));
                  venues = [...withinRadius, ...noCoordVenues];
              } else {
                  // Search mode: do not restrict by radius, but hybrid sort results to favor local matches
                  venues.sort((a, b) => {
                      const distA = a.distance_mi ?? 9999;
                      const distB = b.distance_mi ?? 9999;
                      
                      const isLocalA = distA < 100;
                      const isLocalB = distB < 100;
                      
                      // Promote local venues above non-local ones, regardless of slight trust score differences
                      if (isLocalA && !isLocalB) return -1;
                      if (!isLocalA && isLocalB) return 1;
                      
                      // If both are local or both are far, default to established trust ranking
                      const trustA = a.trust_score || 0;
                      const trustB = b.trust_score || 0;
                      
                      if (trustA !== trustB) return trustB - trustA;
                      return distA - distB;
                  });
              }
          }

          // --- Single venue by ID: attach daily tournament schedules + venue news ---
          if (id && venues.length > 0) {
              const venue = venues[0];

              // venue_daily_tournaments / venue_news / venue_game_schedules are all
              // keyed on an int4 venue_id. For a UUID id (home groups) every one of
              // these ran with parseInt(uuid,10) === NaN and errored. Resolve the
              // numeric id once and skip the whole block when there isn't one — the
              // home-group branch above already populated daily_tournaments from
              // `settings`.
              // Test the WHOLE string, not parseInt: a home-group UUID whose
              // first eight hex chars happen to be decimal digits
              // ("12345678-9abc-...") parses to 12345678, which would have run
              // all three int4 queries against an unrelated venue and grafted
              // that venue's tournaments/news/schedule onto the home game page.
              const idStr = String(id).trim();
              const numericVenueId = /^\d+$/.test(idStr) ? parseInt(idStr, 10) : NaN;
              const hasNumericVenueId = !isNaN(numericVenueId) && numericVenueId >= 1;

              if (!hasNumericVenueId) {
                  if (!Array.isArray(venue.daily_tournaments)) venue.daily_tournaments = [];
                  venue.daily_tournaments_source = venue.daily_tournaments_source || null;
                  venue.schedule_unavailable = venue.daily_tournaments.length === 0;
                  if (!venue.venue_news) venue.venue_news = [];
                  if (venue.game_schedule === undefined) venue.game_schedule = null;
                  return res.status(200).json({
                      success: true,
                      data: venue,
                      total: 1,
                      hasGpsData: hasGps,
                  });
              }

              // === LIVE DB FIRST: Query Supabase venue_daily_tournaments ===
              let usedLiveData = false;
              try {
                  const { data: liveTourn, error: ltErr } = await getSupabase()
                      .from('venue_daily_tournaments')
                      .select('*')
                      .eq('venue_id', numericVenueId)
                      .eq('is_active', true)
                      // Match daily-tournaments.js / venue-tournament-calendar.js so a
                      // venue page never shows rows those surfaces already retired.
                      // Accepts both scraped provenances (verified = structured,
                      // inferred = heuristic parse); excludes stale/expired.
                      .in('data_quality', ['scraped_verified', 'scraped_inferred'])
                      .or('is_suppressed.is.null,is_suppressed.eq.false')
                      .order('day_of_week')
                      .limit(100);

                  if (!ltErr && liveTourn && liveTourn.length > 0) {
                      // Transform flat DB rows into the grouped format the frontend expects
                      // Frontend expects: venue.daily_tournaments = [{ source_url, schedules: [{day_of_week, start_time, buy_in, ...}] }]
                      const sourceUrl = liveTourn[0].source_url || null;
                      
                      const seenKeys = new Set();
                      const dedupedSchedules = [];
                      for (const t of liveTourn) {
                          let normGame = (t.game_type || t.tournament_name || 'nlh').toLowerCase().trim();
                          if (normGame.includes('nlh') || normGame.includes('no limit') || normGame.includes('holdem') || normGame.includes("hold'em")) {
                              normGame = 'nlh';
                          } else if (normGame.includes('plo') || normGame.includes('omaha')) {
                              normGame = 'omaha';
                          } else if (normGame.includes('mixed') || normGame.includes('horse')) {
                              normGame = 'mixed';
                          }
                          
                          const key = [
                              (t.start_time || '').toLowerCase().trim(),
                              normGame,
                              (t.buy_in || 0).toString()
                          ].join('|');
                          
                          if (!seenKeys.has(key)) {
                              seenKeys.add(key);
                              dedupedSchedules.push({
                                  day_of_week: t.day_of_week,
                                  start_time: t.start_time,
                                  tournament_name: t.tournament_name,
                                  buy_in: t.buy_in,
                                  rebuy_addon: t.rebuy_addon,
                                  starting_stack: t.starting_stack,
                                  blind_levels: t.blind_levels,
                                  game_type: t.game_type,
                                  format: t.format,
                                  guaranteed: t.guaranteed,
                              });
                          }
                      }
                      
                      venue.daily_tournaments = [{
                          source_url: sourceUrl,
                          schedules: dedupedSchedules,
                      }];
                      venue.daily_tournaments_source = sourceUrl;
                      venue.last_scraped = liveTourn[0].last_scraped || null;
                      usedLiveData = true;
                  }
              } catch (dbErr) {
                  console.warn('[venues] Live tournament DB query failed, using static fallback:', dbErr.message);
              }

              // === NO PUBLISHED SCHEDULE ===
              // There is no static fallback dataset any more. Rather than serving
              // an empty array (indistinguishable from "this venue runs nothing"),
              // flag it so the venue page can say the schedule is not yet published.
              if (!usedLiveData) {
                  venue.daily_tournaments = [];
                  venue.daily_tournaments_source = null;
                  venue.schedule_unavailable = true;
              }

              // === VENUE NEWS from Supabase ===
              try {
                  const { data: newsData } = await getSupabase()
                      .from('venue_news')
                      .select('id, title, content, source_url, image_url, published_at, scraped_at')
                      .eq('venue_id', numericVenueId)
                      .eq('is_active', true)
                      .order('scraped_at', { ascending: false })
                      .limit(10);
                  venue.venue_news = newsData || [];
              } catch (newsErr) {
                  venue.venue_news = [];
              }

              // === VENUE GAME SCHEDULES (per-day cash game listings) ===
              try {
                  const SCHED_DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
                  const { data: schedData } = await getSupabase()
                      .from('venue_game_schedules')
                      .select('id, day_of_week, game_name, start_time, end_time, notes')
                      .eq('venue_id', numericVenueId)
                      .eq('is_active', true)
                      .order('day_of_week')
                      .order('start_time')
                      .limit(200);
                  if (schedData && schedData.length > 0) {
                      const grouped = {};
                      SCHED_DAYS.forEach(d => { grouped[d] = []; });
                      schedData.forEach(row => {
                          if (grouped[row.day_of_week]) grouped[row.day_of_week].push(row);
                      });
                      venue.game_schedule = grouped;
                  } else {
                      venue.game_schedule = null;
                  }
              } catch (schedErr) {
                  venue.game_schedule = null;
              }

              return res.status(200).json({
                  success: true,
                  data: venue,
                  total: 1,
                  hasGpsData: hasGps,
              });
          }

          // === USER RULE: STRICT SERIES DEDUPLICATION & "RUNNING TODAY" ENFORCEMENT ===
          // (Note: To fix the "missing upcoming tours" bug, we ONLY apply the running-today
          // suppression logic to default venue queries, and BYPASS it when 'tour' or 'series' 
          // are explicitly requested via effectiveType).
          
          if (venues.length > 0 && !['tour', 'series'].includes(effectiveType)) {
              // Decouple node execution time from UTC to standardize "running today" on US timelines
              const localCurrentTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
              const todayIdx = new Date(localCurrentTime).getDay();
              const DAYS_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
              const todayKey = DAYS_ORDER[todayIdx];
              let activeSeriesIds = new Set();
              
              try {
                  const seriesResultIds = venues.filter(v => ['series', 'tour'].includes(v.venue_type || '')).map(v => v.id);
                  if (seriesResultIds.length > 0) {
                      // We consider a series "running today" if it has an entry for today in venue_daily_tournaments
                      const { data: todaySeriesTournaments } = await getSupabase()
                          .from('venue_daily_tournaments')
                          .select('venue_id')
                          .in('venue_id', seriesResultIds)
                          .eq('day_of_week', todayKey)
                          .eq('is_active', true)
                          .or('is_suppressed.is.null,is_suppressed.eq.false');
                          
                      if (todaySeriesTournaments) {
                          todaySeriesTournaments.forEach(t => activeSeriesIds.add(t.venue_id));
                      }
                  }
              } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

              const stateGroups = {};
              for (const v of venues) {
                  const st = (v.state || '').toLowerCase();
                  if (!stateGroups[st]) stateGroups[st] = [];
                  stateGroups[st].push(v);
              }
              
              let finalVenues = [];
              for (const st in stateGroups) {
                  const group = stateGroups[st];
                  const seriesElements = group.filter(v => ['series', 'tour'].includes(v.venue_type || ''));
                  const validVenues = new Set(group);
                  
                  if (seriesElements.length > 0) {
                      for (const series of seriesElements) {
                          const isRunningToday = activeSeriesIds.has(series.id);
                          
                          if (!isRunningToday) {
                              // Rule 1: Series ONLY shown if running that day.
                              validVenues.delete(series);
                              continue;
                          }

                          // Rule 2: If running, SERIES pops up, NOT the venue.
                          // Identify the base venue to suppress.
                          let coreName = (series.name || '').toLowerCase()
                              .replace(/poker/g, '').replace(/series/g, '').replace(/championship/g, '')
                              .replace(/classic/g, '').replace(/casino/g, '').replace(/resort/g, '')
                              .replace(/hotel/g, '').replace(/room/g, '').trim();
                              
                          if (coreName.length >= 3) {
                              for (const v of group) {
                                  if (v !== series && !['series', 'tour'].includes(v.venue_type || '')) {
                                      let vCore = (v.name || '').toLowerCase()
                                          .replace(/poker/g, '').replace(/casino/g, '').replace(/resort/g, '')
                                          .replace(/hotel/g, '').replace(/room/g, '').replace(/club/g, '').trim();
                                          
                                      if (vCore && coreName && (vCore.includes(coreName) || coreName.includes(vCore))) {
                                          validVenues.delete(v); // Suppress the casino/base venue
                                      }
                                  }
                              }
                          }
                      }
                  }
                  finalVenues.push(...validVenues);
              }
              venues = finalVenues;
          }

          // (Note: Tours/Series active-today post-filter was removed to fix pagination truncation. 
          // They are now excluded from the default query at the SQL level, and correctly pulled 
          // when specifically requested by `effectiveType`).
          // --- Filter by games (NLH, PLO, Mixed) ---
          if (hasNLH === 'true') {
              venues = venues.filter(v => v.games_offered && v.games_offered.includes('NLH'));
          }
          if (hasPLO === 'true') {
              venues = venues.filter(v => v.games_offered && v.games_offered.includes('PLO'));
          }
          if (hasMixed === 'true') {
              venues = venues.filter(v => v.games_offered && v.games_offered.includes('Mixed'));
          }

          // --- Calculate Charity Open/Next Event Status from Scraped Tournaments ---
          const charityVenues = venues.filter(v => v.venue_type === 'charity');
          if (charityVenues.length > 0) {
              try {
                  const charityIds = charityVenues.map(v => v.id).filter(id => typeof id === 'number');
                  const charityNames = charityVenues.map(v => v.name).filter(Boolean);

                  // Run BOTH joins in parallel: ID-based (linked rows) + name-based (unlinked rows where venue_id=null)
                  const [idResult, nameResult] = await Promise.all([
                      charityIds.length > 0
                          ? getSupabase()
                              .from('venue_daily_tournaments')
                              // Include all display fields: name, buy_in, starting_stack, start_time
                              .select('venue_id, venue_name, day_of_week, start_time, buy_in, tournament_name, starting_stack')
                              .in('venue_id', charityIds)
                              .eq('is_active', true)
                              .in('data_quality', ['scraped_verified', 'scraped_inferred'])
                              .or('is_suppressed.is.null,is_suppressed.eq.false')
                          : Promise.resolve({ data: [] }),
                      charityNames.length > 0
                          ? getSupabase()
                              .from('venue_daily_tournaments')
                              .select('venue_id, venue_name, day_of_week, start_time, buy_in, tournament_name, starting_stack')
                              .is('venue_id', null)
                              .in('venue_name', charityNames)
                              .eq('is_active', true)
                              .in('data_quality', ['scraped_verified', 'scraped_inferred'])
                              .or('is_suppressed.is.null,is_suppressed.eq.false')
                          : Promise.resolve({ data: [] }),
                  ]);

                  // Build name→id map for the null-venue_id rows
                  const nameToId = {};
                  charityVenues.forEach(v => { if (v.name) nameToId[v.name] = v.id; });

                  // Stitch venue_id onto name-matched rows
                  const nameRows = (nameResult.data || []).map(t => ({
                      ...t,
                      venue_id: nameToId[t.venue_name] ?? t.venue_id,
                  })).filter(t => t.venue_id);

                  const upcomingTours = [...(idResult.data || []), ...nameRows];
                      
                  if (upcomingTours && upcomingTours.length > 0) {
                      const localCurrentTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
                      const todayIdx = new Date(localCurrentTime).getDay();
                      const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                      const todayStr = DAYS[todayIdx];
                      
                      const toursByVenue = {};
                      // Sort by start_time ascending so earliest tournament wins on .find()
                      const sorted = [...upcomingTours].sort((a, b) => {
                          const ta = a.start_time || '';
                          const tb = b.start_time || '';
                          return ta.localeCompare(tb);
                      });
                      sorted.forEach(t => {
                          const key = t.venue_id || t.venue_name;
                          if (!toursByVenue[key]) toursByVenue[key] = [];
                          toursByVenue[key].push(t);
                      });
                      
                      venues.forEach(v => {
                          if (v.venue_type !== 'charity') return;
                          
                          const hasTours = toursByVenue[v.id] || toursByVenue[v.name] || [];
                          if (hasTours.length === 0) return; 

                          // Compute fallback buy-in: most common non-zero buy_in across all this venue's tournaments
                          const knownBuyIns = hasTours.map(t => t.buy_in).filter(b => b != null && b > 0 && b < 10000);
                          let fallbackBuyIn = null;
                          if (knownBuyIns.length > 0) {
                              // Use most common value as the fallback
                              const freq = {};
                              knownBuyIns.forEach(b => { freq[b] = (freq[b] || 0) + 1; });
                              fallbackBuyIn = Number(Object.entries(freq || {}).sort((a, b) => b[1] - a[1])[0][0]);
                          }
                          // Helper: resolve buy-in for a tournament row, using fallback when missing
                          const resolveBuyIn = (t) => {
                              if (t.buy_in != null && t.buy_in > 0) return t.buy_in;
                              return fallbackBuyIn;
                          };
                          
                          // Collect ALL tournaments for today (not just the first)
                          const todayTours = hasTours.filter(t => t.day_of_week.toLowerCase() === todayStr);
                          if (todayTours.length > 0) {
                              v.is_today = true;
                              v.next_event = null;
                              v.has_tournaments = true;
                              // Primary today_event uses the first tournament
                              const todayTour = todayTours[0];
                              v.today_event = {
                                  start_time: todayTour.start_time || (v.today_event?.door_open_time) || null,
                                  door_open_time: v.today_event?.door_open_time || null,
                                  tournament_name: todayTour.tournament_name || todayTour.name || null,
                                  buy_in: resolveBuyIn(todayTour) ?? (v.today_event?.buy_in || null),
                                  location: v.today_event?.location || v.city || 'Local Area',
                                  address: v.address || null,
                                  state: v.today_event?.state || v.state || null,
                                  starting_stack: todayTour.starting_stack || null,
                              };
                              // Expose ALL today tournaments (up to 3) for multi-event display
                              v.today_tournaments = todayTours.slice(0, 3).map(t => ({
                                  start_time: t.start_time || null,
                                  tournament_name: t.tournament_name || t.name || null,
                                  buy_in: resolveBuyIn(t),
                                  starting_stack: t.starting_stack || null,
                              }));
                          } else {
                              v.is_today = false;
                              v.has_tournaments = true;
                              // Find closest next day — collect ALL tournaments for that day
                              for (let i = 1; i <= 7; i++) {
                                  const nextIdx = (todayIdx + i) % 7;
                                  const nextDayStr = DAYS[nextIdx];
                                  const nextDayTours = hasTours.filter(t => t.day_of_week.toLowerCase() === nextDayStr);
                                  if (nextDayTours.length > 0) {
                                      const nextTour = nextDayTours[0];
                                      v.next_event = {
                                          day: nextTour.day_of_week,
                                          days_away: i,
                                          start_time: nextTour.start_time || (v.next_event?.door_open_time) || null,
                                          door_open_time: v.next_event?.door_open_time || null,
                                          tournament_name: nextTour.tournament_name || nextTour.name || null,
                                          buy_in: resolveBuyIn(nextTour),
                                          location: v.next_event?.location || v.city || 'Local Area',
                                          address: v.address || null,
                                          state: v.next_event?.state || v.state || null,
                                          starting_stack: nextTour.starting_stack || null,
                                      };
                                      // Expose ALL tournaments for that day (up to 3)
                                      v.next_tournaments = nextDayTours.slice(0, 3).map(t => ({
                                          start_time: t.start_time || null,
                                          tournament_name: t.tournament_name || t.name || null,
                                          buy_in: resolveBuyIn(t),
                                          starting_stack: t.starting_stack || null,
                                      }));
                                      break;
                                  }
                              }
                          }
                      });
                  }
              } catch(e) {
                  console.warn('Error enriching charity next_event:', e);
              }
          }

          // --- Enrich regular venues (casino/card_room/poker_club) with next-tournament preview ---
          // When a venue has has_tournaments=true but no events today, find the nearest upcoming day
          // and attach next_tournament_preview so VenueCard can show "Next: Tue 7PM — $60 NLH"
          const regularTournamentVenues = venues.filter(v =>
              v.has_tournaments === true &&
              !['charity', 'series', 'tour', 'tour_stop', 'poker_tour', 'home_game'].includes(v.venue_type) &&
              // Only enrich venues that don't already have today's daily_tournaments injected (single-venue path)
              !Array.isArray(v.daily_tournaments)
          );
          if (regularTournamentVenues.length > 0) {
              try {
                  const localCurrentTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
                  const todayIdx = new Date(localCurrentTime).getDay();
                  const DAYS_LOWER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                  const todayStr = DAYS_LOWER[todayIdx];

                  const regularIds = regularTournamentVenues.map(v => v.id).filter(id => typeof id === 'number');
                  if (regularIds.length > 0) {
                      // Fetch all active tournament rows for these venues in one query
                      const { data: regTours } = await getSupabase()
                          .from('venue_daily_tournaments')
                          .select('venue_id, day_of_week, start_time, buy_in, tournament_name, game_type, guaranteed')
                          .in('venue_id', regularIds)
                          .eq('is_active', true)
                          .in('data_quality', ['scraped_verified', 'scraped_inferred'])
                          .or('is_suppressed.is.null,is_suppressed.eq.false')
                          .order('start_time', { ascending: true });

                      if (regTours && regTours.length > 0) {
                          // Group by venue_id
                          const byVenue = {};
                          regTours.forEach(t => {
                              if (!byVenue[t.venue_id]) byVenue[t.venue_id] = [];
                              byVenue[t.venue_id].push(t);
                          });

                          venues.forEach(v => {
                              if (!byVenue[v.id]) return;
                              const tours = byVenue[v.id];
                              // Does THIS venue have any tournament today?
                              const hasToday = tours.some(t => t.day_of_week && t.day_of_week.toLowerCase() === todayStr);
                              if (hasToday) {
                                  // Already has today's data — inject today_tournaments for the card
                                  const todayTours = tours.filter(t => t.day_of_week && t.day_of_week.toLowerCase() === todayStr);
                                  v.daily_tournaments = todayTours.map(t => ({
                                      start_time: t.start_time || null,
                                      tournament_name: t.tournament_name || null,
                                      buy_in: t.buy_in != null ? t.buy_in : null,
                                      game_type: t.game_type || null,
                                      guaranteed: t.guaranteed || null,
                                  }));
                              } else {
                                  // No tournament today — find the next scheduled day
                                  for (let i = 1; i <= 7; i++) {
                                      const nextIdx = (todayIdx + i) % 7;
                                      const nextDayStr = DAYS_LOWER[nextIdx];
                                      const nextDayTours = tours.filter(t => t.day_of_week && t.day_of_week.toLowerCase() === nextDayStr);
                                      if (nextDayTours.length > 0) {
                                          const first = nextDayTours[0];
                                          const dayLabel = nextDayStr.charAt(0).toUpperCase() + nextDayStr.slice(1);
                                          v.next_tournament_preview = {
                                              day: dayLabel,
                                              days_away: i,
                                              start_time: first.start_time || null,
                                              tournament_name: first.tournament_name || null,
                                              buy_in: first.buy_in != null ? first.buy_in : null,
                                              game_type: first.game_type || null,
                                              guaranteed: first.guaranteed || null,
                                              total_that_day: nextDayTours.length,
                                          };
                                          break;
                                      }
                                  }
                              }
                          });
                      }
                  }
              } catch (e) {
                  console.warn('[venues] Regular venue next-tournament enrichment failed (non-fatal):', e.message);
              }
          }

          // --- Apply limit and return ---
          // Only count physical playable venues in the total — series and tours are NOT counted as venues
          const total = venues.filter(v => !['series', 'tour'].includes(v.venue_type)).length;
          // Honour `limit`. This used to be a bare .map() — despite the variable
          // name nothing sliced, so the social-page merge blew straight past the
          // requested limit (`?limit=5` returned hundreds of entries).
          const limited = capVenues(venues, maxResults).map(v => {
              if (v.name) v.name = toTitleCase(v.name);
              // Internal capVenues marker — never part of the public shape.
              if (v._merged_social !== undefined) delete v._merged_social;
              return v;
          });

          // ── PHASE 19: HOME GROUP UNION ────────────────────────────────
          // Home groups enrich linked social_pages rows inside `data`, but the
          // documented top-level envelope was hardcoded to [] / 0, so standalone
          // groups (no linked social page) never reached the frontend.
          const homeGroupsOut = Array.isArray(homeGroups) ? homeGroups : [];

          return res.status(200).json({
              success: true,
              data: limited,
              home_groups: homeGroupsOut,
              total,
              total_home_groups: homeGroupsOut.length,
              hasGpsData: hasGps,
              offset,
          });
      } catch (error) {
          console.warn('Venues API error:', error);
          captureError(error, {
              tags: { api: 'poker-venues', stage: 'handler' },
              extra: { query: req.query },
          });

          // Last resort: JSON data, but still gated through applyFilters so
          // is_active=false / is_suppressed=true venues stay hidden.
          //
          // This used to call applyFilters(getJsonVenues(), {}) — an EMPTY filter
          // object — so a failure on `?lat=..&lng=..&state=IL` answered 200 OK with
          // every venue in the country, and the s-maxage header set at the top of
          // the handler let the CDN pin that wrong body against the filtered URL.
          // Now: the caller's filters are honoured, the result is capped, the
          // response is marked degraded, and it is explicitly not cacheable.
          let fallbackVenues = [];
          try {
              fallbackVenues = applyFilters(getJsonVenues(), requestFilters || {})
                  .slice(0, requestMaxResults)
                  .map(v => ({ ...v }));
          } catch (fallbackErr) {
              console.warn('[venues] fallback filter failed:', fallbackErr?.message || fallbackErr);
              fallbackVenues = [];
          }
          if (!res.headersSent) res.setHeader('Cache-Control', 'no-store');
          return res.status(200).json({
              success: true,
              degraded: true,
              data: fallbackVenues,
              home_groups: [],
              total: fallbackVenues.length,
              total_home_groups: 0,
              hasGpsData: false,
          });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
