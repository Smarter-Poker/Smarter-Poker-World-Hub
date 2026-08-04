/**
 * pnm-utils.js — Shared utilities for Poker Near Me components
 * 
 * CONSOLIDATION: Previously, Haversine distance was duplicated across 4 files:
 *   - LiveGamesFeed.jsx (R=3959)
 *   - NearMeNowFeed.jsx (R=3958.8)
 *   - TripCostCalculator.jsx (R=3958.8)
 *   - RoadTripPlanner.jsx (R=3958.8)
 * 
 * This module provides the single source of truth.
 */

/**
 * Haversine formula — distance in miles between two lat/lng coordinates.
 * Uses the mean Earth radius 3958.8 miles (6,371 km).
 * 
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in miles
 */
export function haversineMiles(lat1, lng1, lat2, lng2) {
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return Infinity;
    const R = 3958.8;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Relative time string from a date string.
 * 
 * @param {string|Date} dateStr - ISO date string or Date object
 * @returns {string} Human-readable relative time (e.g., "3m ago", "2h ago")
 */
export function timeAgo(dateStr) {
    if (!dateStr) return '';
    const ts = new Date(dateStr).getTime();
    if (isNaN(ts)) return '';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 0) return 'Just now';
    if (diff < 30) return 'Just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Activity heat level for visual theming of live venue cards.
 * 
 * @param {number} totalTables - Total number of tables running
 * @returns {{ color: string, label: string, border: string, bg: string }}
 */
export function getHeatLevel(totalTables) {
    if (totalTables >= 20) return { color: '#ef4444', label: 'HOT', border: 'rgba(239,68,68,0.5)', bg: 'rgba(239,68,68,0.08)' };
    if (totalTables >= 8) return { color: '#f59e0b', label: 'WARM', border: 'rgba(245,158,11,0.4)', bg: 'rgba(245,158,11,0.06)' };
    if (totalTables >= 3) return { color: '#3fb950', label: 'ACTIVE', border: 'rgba(63,185,80,0.4)', bg: 'rgba(63,185,80,0.06)' };
    return { color: '#ffffff', label: 'OPEN', border: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.05)' };
}

/**
 * Parse the minimum stake value from a game name string.
 * Handles formats like "1/2 No Limit Holdem", "5-10 NLH", "2/5 PLO".
 * 
 * @param {string} gameName - Game name containing stakes
 * @returns {number} The smaller stake value, or 0 if not parseable
 */
export function parseMinStake(gameName) {
    const match = (gameName || '').match(/(\d+)[\/\-](\d+)/);
    if (match) return Math.min(parseInt(match[1]), parseInt(match[2]));
    return 0;
}

// ─── NEW UTILITIES ───

export function getVenueLogoUrl(venue) {
    if (!venue) return null;
    // Priority 1: Supabase venue-logos bucket (hand-curated, verified logos)
    if (venue.logo_url) return venue.logo_url;
    // Priority 2: Profile photo from social page (scraped/external)
    if (venue.profile_photo_url) return venue.profile_photo_url;
    // Priority 3: Cover photo
    if (venue.cover_photo_url) return venue.cover_photo_url;
    
    // We intentionally removed the dynamic s2/favicons fallback here because it generates 
    // generic blue globes without byte-size validation. The backend daemon already tests 
    // Favicon API strictly, and injects verified ones into logo_url/profile_photo_url.
    return null;
}

export function getVenueLogoFallback(venue) {
    // Intentionally removed dynamic fallbacks like icon.horse
    // to force the monogram UI 
    return null;
}

// ─── VENUE-LOCAL CLOCK ───
// Posted room hours are LOCAL to the room. Comparing them against the viewer's
// clock told a New York user that an open Las Vegas room was "Closed". Every
// wall-clock comparison below therefore runs in the VENUE's timezone.

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Resolve "now" (weekday + minutes past midnight) inside an IANA timezone.
 *
 * Uses Intl.DateTimeFormat({ timeZone }).formatToParts — NOT the
 * new Date(d.toLocaleString('en-US', { timeZone })) round-trip, which re-parses
 * a localized string and loses precision around DST and non-en formats.
 *
 * @param {string} timeZone - IANA zone, e.g. "America/Los_Angeles"
 * @param {Date} [at] - Instant to resolve (defaults to now)
 * @returns {{ dayOfWeek: number, minutes: number } | null} null when the zone is
 *          missing, not a string, or not a valid IANA identifier
 */
export function getZonedNow(timeZone, at) {
    if (typeof timeZone !== 'string') return null;
    const tz = timeZone.trim();
    if (!tz) return null;

    const when = at instanceof Date ? at : new Date();
    if (isNaN(when.getTime())) return null;

    let parts;
    try {
        parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            // h23 explicitly: hour12:false resolves to the h24 cycle in en-US on
            // some ICU builds, which emits "24" for midnight.
            hourCycle: 'h23',
        }).formatToParts(when);
    } catch {
        // Invalid IANA string (RangeError) or an engine without data for it.
        // Never let a bad row crash the card — treat it as unknown.
        return null;
    }
    if (!Array.isArray(parts)) return null;

    const valueOf = (type) => {
        const part = parts.find((p) => p && p.type === type);
        return part ? part.value : null;
    };
    const weekday = valueOf('weekday');
    const hourRaw = valueOf('hour');
    const minuteRaw = valueOf('minute');
    if (weekday == null || hourRaw == null || minuteRaw == null) return null;

    const dayOfWeek = WEEKDAY_INDEX[weekday];
    const hour = parseInt(hourRaw, 10) % 24; // belt and braces against a stray "24"
    const minute = parseInt(minuteRaw, 10);
    if (dayOfWeek === undefined || isNaN(hour) || isNaN(minute)) return null;

    return { dayOfWeek, minutes: hour * 60 + minute };
}

/**
 * US state -> IANA timezone. Best-effort: 12 states are split across zones, so this
 * is only a fallback for rows where poker_venues.timezone is NULL. Kept here as the
 * single copy so DailyTournamentsPanel and NearMeNowFeed cannot drift apart.
 */
export const US_STATE_TIMEZONES = {
    'AL': 'America/Chicago', 'AK': 'America/Anchorage', 'AZ': 'America/Phoenix',
    'AR': 'America/Chicago', 'CA': 'America/Los_Angeles', 'CO': 'America/Denver',
    'CT': 'America/New_York', 'DE': 'America/New_York', 'FL': 'America/New_York',
    'GA': 'America/New_York', 'HI': 'Pacific/Honolulu', 'ID': 'America/Denver',
    'IL': 'America/Chicago', 'IN': 'America/Indiana/Indianapolis', 'IA': 'America/Chicago',
    'KS': 'America/Chicago', 'KY': 'America/New_York', 'LA': 'America/Chicago',
    'ME': 'America/New_York', 'MD': 'America/New_York', 'MA': 'America/New_York',
    'MI': 'America/Detroit', 'MN': 'America/Chicago', 'MS': 'America/Chicago',
    'MO': 'America/Chicago', 'MT': 'America/Denver', 'NE': 'America/Chicago',
    'NV': 'America/Los_Angeles', 'NH': 'America/New_York', 'NJ': 'America/New_York',
    'NM': 'America/Denver', 'NY': 'America/New_York', 'NC': 'America/New_York',
    'ND': 'America/Chicago', 'OH': 'America/New_York', 'OK': 'America/Chicago',
    'OR': 'America/Los_Angeles', 'PA': 'America/New_York', 'RI': 'America/New_York',
    'SC': 'America/New_York', 'SD': 'America/Chicago', 'TN': 'America/Chicago',
    'TX': 'America/Chicago', 'UT': 'America/Denver', 'VT': 'America/New_York',
    'VA': 'America/New_York', 'WA': 'America/Los_Angeles', 'WV': 'America/New_York',
    'WI': 'America/Chicago', 'WY': 'America/Denver',
};

/**
 * Resolve the timezone to use for a venue's wall-clock math.
 * Prefers the authoritative poker_venues.timezone column, falls back to the venue's
 * state. Returns null when neither is usable so callers can suppress rather than
 * silently use the VIEWER's clock (which is wrong for a nationwide directory).
 *
 * @param {object} venue - object with optional `timezone` and `state`
 * @returns {string|null} IANA timezone identifier, or null
 */
export function resolveVenueTimeZone(venue) {
    if (!venue) return null;
    if (typeof venue.timezone === 'string' && venue.timezone.trim()) return venue.timezone.trim();
    const state = venue.state || venue.venue_state;
    if (typeof state === 'string') {
        const tz = US_STATE_TIMEZONES[state.trim().toUpperCase()];
        if (tz) return tz;
    }
    return null;
}

/**
 * The "we cannot tell" open status. A wrong badge is worse than no badge, so
 * this is returned instead of guessing whenever the venue timezone is missing
 * or invalid.
 *
 * Shape stays compatible with the normal result: `open` is falsy, `label` and
 * `nextChange` are null and `always` is false, so a caller that only reads those
 * renders nothing. New callers should branch on `unknown`.
 */
function unknownOpenStatus() {
    return { open: null, label: null, always: false, nextChange: null, unknown: true };
}

/**
 * Parse operating hours and determine open/closed status.
 * Handles formats: "24/7", "12:00pm - 4:00am", "12pm-4am", etc.
 *
 * All wall-clock comparisons are made in the VENUE's timezone
 * (poker_venues.timezone). That column is nullable — 12 split-timezone states
 * are deliberately NULL — so when it is missing or invalid the open/closed
 * determination is SUPPRESSED rather than guessed from the viewer's clock.
 *
 * Callers must treat BOTH `null` and a result with `unknown: true` as
 * "render no status".
 *
 * @param {object} venue - Venue object with hours, hours_weekday, hours_weekend, timezone
 * @returns {{ open: boolean|null, label: string|null, always: boolean, nextChange: string|null, unknown?: boolean } | null}
 */
export function getOpenStatus(venue) {
    if (!venue) return null;

    // Venue types that NEVER operate 24/7:
    // - Charity rooms always have cut-off times (legal requirement)
    // - Home games run on a schedule set by the host
    const NEVER_24_7_TYPES = ['charity', 'home_game'];
    const isNever24 = NEVER_24_7_TYPES.includes(venue.venue_type);
    
    // 24/7 venues — only for casinos, card rooms, poker clubs
    if (!isNever24 && (venue.is_24_hours || venue.hours === '24/7' || venue.hours_weekday === '24/7')) {
        return { open: true, label: 'Open 24/7', always: true, nextChange: null };
    }
    
    // "Now" in the ROOM's timezone, not the viewer's. null = zone unknown/invalid.
    const zoned = getZonedNow(venue.timezone);

    // Pick the right hours string.
    // `hasPostedHours` tracks whether the venue posts ANY hours at all — a venue that
    // posts hours but none that apply to the resolved day is "unknown", never 24/7.
    const hasPostedHours = !!(venue.hours_weekend || venue.hours_weekday || venue.hours);
    let hoursStr = null;
    if (zoned) {
        const dayOfWeek = zoned.dayOfWeek; // 0=Sun, 6=Sat
        // [BUG FIX] dayOfWeek === 5 is FRIDAY, not a weekend day.
        // Saturday = 6, Sunday = 0. Friday erroneously used weekend_hours.
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        if (isWeekend && venue.hours_weekend) {
            hoursStr = venue.hours_weekend;
        } else if (venue.hours_weekday) {
            hoursStr = venue.hours_weekday;
        } else if (venue.hours) {
            hoursStr = venue.hours;
        }
    } else {
        // Without the venue clock we do not even know which day it is there, so
        // weekday-vs-weekend cannot be chosen. Only the day-independent cases
        // survive: nothing posted at all, or every posted window is 24/7.
        const posted = [venue.hours_weekend, venue.hours_weekday, venue.hours].filter(Boolean);
        if (posted.length === 0) {
            hoursStr = null;
        } else if (posted.every((h) => h === '24/7')) {
            hoursStr = '24/7';
        } else {
            return unknownOpenStatus();
        }
    }

    if (!hoursStr || hoursStr === '24/7') {
        // BUG FIX: a venue that posts ONLY hours_weekend (common for weekend-only
        // clubs) resolved hoursStr to null on a weekday and then fell through to the
        // "assume 24/7" branch — a room explicitly closed Mon-Fri advertised
        // "Open 24/7". The 24/7 assumption is only safe when NOTHING is posted.
        if (!hoursStr && hasPostedHours) return unknownOpenStatus();
        // For charity/home_game: no hours data = show nothing (never assume 24/7)
        if (isNever24) return null;
        // For casinos/card_rooms/poker_clubs: safe to assume 24/7
        // (timezone-independent — no wall-clock comparison involved)
        return { open: true, label: 'Open 24/7', always: true, nextChange: null };
    }

    // Past this point every branch compares against a wall clock.
    if (!zoned) return unknownOpenStatus();

    // Parse "12:00pm - 4:00am" or "12pm-4am" or "10am - 2am" format
    const timePattern = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*[-–—to]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
    const match = hoursStr.match(timePattern);
    if (!match) return null;
    
    let openHour = parseInt(match[1]);
    const openMin = parseInt(match[2] || '0');
    const openAmPm = match[3].toLowerCase();
    let closeHour = parseInt(match[4]);
    const closeMin = parseInt(match[5] || '0');
    const closeAmPm = match[6].toLowerCase();
    
    // Convert to 24h
    if (openAmPm === 'pm' && openHour !== 12) openHour += 12;
    if (openAmPm === 'am' && openHour === 12) openHour = 0;
    if (closeAmPm === 'pm' && closeHour !== 12) closeHour += 12;
    if (closeAmPm === 'am' && closeHour === 12) closeHour = 0;
    
    const openMinutes = openHour * 60 + openMin;
    const closeMinutes = closeHour * 60 + closeMin;
    const nowMinutes = zoned.minutes;
    
    let isOpen;
    if (closeMinutes > openMinutes) {
        // Same-day hours (e.g., 10am - 10pm)
        isOpen = nowMinutes >= openMinutes && nowMinutes < closeMinutes;
    } else {
        // Overnight hours (e.g., 12pm - 4am)
        isOpen = nowMinutes >= openMinutes || nowMinutes < closeMinutes;
    }
    
    // Format next change time
    const formatTime = (h, m) => {
        const hr = h % 12 || 12;
        const ampm = h >= 12 ? 'PM' : 'AM';
        return m > 0 ? `${hr}:${String(m).padStart(2, '0')} ${ampm}` : `${hr} ${ampm}`;
    };
    
    if (isOpen) {
        return {
            open: true,
            label: 'Open Now',
            always: false,
            nextChange: `Closes ${formatTime(closeHour, closeMin)}`,
        };
    } else {
        return {
            open: false,
            label: 'Closed',
            always: false,
            nextChange: `Opens ${formatTime(openHour, openMin)}`,
        };
    }
}

/**
 * Compute a crowd level from available data points.
 * Returns a 0-100 score and semantic label.
 * 
 * @param {object} venue - Venue with optional live_data, checkinCount
 * @param {number} [checkinCount] - Number of current check-ins
 * @returns {{ score: number, label: string, color: string }}
 */
export function getCrowdLevel(venue, checkinCount = 0) {
    let score = 0;
    
    // Live table data (0-50 points)
    if (venue?.live_data?.tables_running) {
        const tables = venue.live_data.tables_running;
        const maxTables = venue.poker_tables || 20;
        score += Math.min((tables / maxTables) * 50, 50);
    }
    
    // Waitlist data (0-30 points)
    if (venue?.live_data?.players_waiting) {
        score += Math.min(venue.live_data.players_waiting * 3, 30);
    }
    
    // Check-in data (0-20 points)
    if (checkinCount > 0) {
        score += Math.min(checkinCount * 5, 20);
    }
    
    score = Math.min(Math.round(score), 100);
    
    if (score >= 80) return { score, label: 'Packed', color: '#ef4444' };
    if (score >= 60) return { score, label: 'Busy', color: '#f59e0b' };
    if (score >= 35) return { score, label: 'Active', color: '#3fb950' };
    if (score >= 10) return { score, label: 'Quiet', color: '#ffffff' };
    return { score, label: 'Empty', color: '#6b7280' };
}

/**
 * Estimate wait time in minutes based on players waiting and game data.
 * Uses industry heuristic: ~15-20 min per waitlisted player at a given stake level.
 * 
 * @param {number} playersWaiting - Number of players on waitlist
 * @param {number} tablesRunning - Number of tables currently running
 * @returns {{ minutes: number, label: string }}
 */
export function estimateWaitTime(playersWaiting, tablesRunning = 1) {
    if (!playersWaiting || playersWaiting <= 0) {
        return { minutes: 0, label: 'No wait' };
    }
    // Heuristic: ~12 min per waiting player, scaled by table count
    // More tables = faster seat turnover
    const turnoverFactor = Math.max(1, tablesRunning * 0.3);
    const minutes = Math.round((playersWaiting * 12) / turnoverFactor);
    
    if (minutes <= 5) return { minutes, label: '< 5 min' };
    if (minutes <= 15) return { minutes, label: '~15 min' };
    if (minutes <= 30) return { minutes, label: '~30 min' };
    if (minutes <= 60) return { minutes, label: '~1 hour' };
    // BUG FIX: Math.round on the hours component double-counted the remainder that
    // `minutes % 60` already prints — 90 minutes rendered as "~2h 30m". Floor it.
    return { minutes, label: `~${Math.floor(minutes / 60)}h ${minutes % 60}m` };
}

/**
 * Save PNM filter state to localStorage (cross-session persistence).
 * @param {string} key - Filter group key
 * @param {object} filters - Filter values to persist
 */
export function saveFilters(key, filters) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(`pnm_filters_${key}`, JSON.stringify(filters));
    } catch { /* quota exceeded or private mode */ }
}

/**
 * Load PNM filter state from localStorage (cross-session persistence).
 * Falls back to sessionStorage for migration from older versions.
 * @param {string} key - Filter group key
 * @param {object} defaults - Default filter values
 * @returns {object} Merged filter values
 */
export function loadFilters(key, defaults) {
    if (typeof window === 'undefined') return defaults;
    try {
        // Primary: localStorage (new persistent storage)
        const saved = localStorage.getItem(`pnm_filters_${key}`);
        if (saved) return { ...defaults, ...JSON.parse(saved) };
        // Migration: check sessionStorage for existing data from old version
        const legacy = sessionStorage.getItem(`pnm_filters_${key}`);
        if (legacy) {
            const parsed = { ...defaults, ...JSON.parse(legacy) };
            // Migrate to localStorage and clean up sessionStorage
            localStorage.setItem(`pnm_filters_${key}`, legacy);
            sessionStorage.removeItem(`pnm_filters_${key}`);
            return parsed;
        }
    } catch { /* parse error */ }
    return defaults;
}

// ─── CURATED INITIALS COLOR PALETTE ───
const INITIALS_PALETTE = [
    { bg: 'rgba(255,255,255,0.25)', border: 'rgba(255,255,255,0.5)', text: '#ffffff' },   // Gold
    { bg: 'rgba(0,212,255,0.2)', border: 'rgba(0,212,255,0.5)', text: '#00d4ff' },       // Cyan
    { bg: 'rgba(239,68,68,0.2)', border: 'rgba(239,68,68,0.5)', text: '#ef4444' },       // Red
    { bg: 'rgba(34,197,94,0.2)', border: 'rgba(34,197,94,0.5)', text: '#22c55e' },       // Green
    { bg: 'rgba(139,92,246,0.2)', border: 'rgba(139,92,246,0.5)', text: '#8b5cf6' },     // Purple
    { bg: 'rgba(59,130,246,0.2)', border: 'rgba(59,130,246,0.5)', text: '#3b82f6' },     // Blue
    { bg: 'rgba(236,72,153,0.2)', border: 'rgba(236,72,153,0.5)', text: '#ec4899' },     // Pink
    { bg: 'rgba(245,158,11,0.2)', border: 'rgba(245,158,11,0.5)', text: '#f59e0b' },     // Amber
    { bg: 'rgba(20,184,166,0.2)', border: 'rgba(20,184,166,0.5)', text: '#14b8a6' },     // Teal
    { bg: 'rgba(249,115,22,0.2)', border: 'rgba(249,115,22,0.5)', text: '#f97316' },     // Orange
    { bg: 'rgba(168,85,247,0.2)', border: 'rgba(168,85,247,0.5)', text: '#a855f7' },     // Violet
    { bg: 'rgba(6,182,212,0.2)', border: 'rgba(6,182,212,0.5)', text: '#06b6d4' },       // Sky
];

/**
 * Get a curated color for venue initials based on venue ID.
 * Provides better visual diversity than random hash-based colors.
 * 
 * @param {number|string} venueId - Venue ID for consistent color mapping
 * @returns {{ bg: string, border: string, text: string }}
 */
export function getInitialsColor(venueId) {
    const idx = (typeof venueId === 'number' ? venueId : Math.abs(String(venueId).split('').reduce((a, c) => a + c.charCodeAt(0), 0))) % INITIALS_PALETTE.length;
    return INITIALS_PALETTE[idx];
}

/**
 * Check if venue data is stale (exceeds 30-minute threshold).
 * 
 * @param {string} lastUpdated - ISO timestamp of last data update
 * @returns {{ stale: boolean, age: string, minutes: number }}
 */
export function isStaleData(lastUpdated) {
    if (!lastUpdated) return { stale: true, age: 'No data', minutes: Infinity };
    const ts = new Date(lastUpdated).getTime();
    if (isNaN(ts)) return { stale: true, age: 'No data', minutes: Infinity };
    const minutes = Math.floor((Date.now() - ts) / 60000);
    const stale = minutes > 30;
    let age = '';
    if (minutes < 1) age = 'just now';
    else if (minutes < 60) age = `${minutes}m ago`;
    else age = `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
    return { stale, age, minutes };
}

/**
 * Map a search radius (in miles) to an appropriate Leaflet zoom level.
 * Calibrated for US geography at mid-latitudes (~37°N).
 * 
 * Zoom levels approximate visible diameter:
 *   5 mi  → zoom 12 (neighborhood level)
 *   10 mi → zoom 11 (city district)
 *   25 mi → zoom 10 (metro area)
 *   50 mi → zoom 9  (metro region)
 *   100 mi → zoom 8 (multi-county)
 *   200 mi → zoom 7 (state-level)
 *   250 mi → zoom 6 (multi-state)
 *   500 mi → zoom 5 (regional US)
 *   'any'  → zoom 4 (continental US)
 * 
 * @param {number|string} radiusMiles - Radius in miles, or 'any'/'Any' for full US
 * @returns {number} Leaflet zoom level (4-12)
 */
export function radiusToZoom(radiusMiles) {
    // 'any' or invalid → show full US
    if (!radiusMiles || radiusMiles === 'any' || radiusMiles === 'Any') return 4;
    
    const miles = Number(radiusMiles);
    if (isNaN(miles) || miles <= 0) return 4;
    
    // Sorted lookup table: [maxRadius, zoomLevel]
    const ZOOM_TABLE = [
        [5, 12],
        [10, 11],
        [25, 10],
        [50, 9],
        [100, 8],
        [200, 7],
        [250, 6],
        [500, 5],
    ];
    
    for (const [maxMiles, zoom] of ZOOM_TABLE) {
        if (miles <= maxMiles) return zoom;
    }
    
    // Beyond 500 miles → full US overview
    return 4;
}

/**
 * Escape HTML special characters for safe injection into innerHTML strings.
 * Prevents XSS via venue names, tour names, or other user-facing data.
 */
export function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Compute the Levenshtein distance between two strings.
 * Used for zero-latency fuzzy search on the client.
 */
export function levenshteinDistance(a, b) {
    if (!a?.length) return b?.length || 0;
    if (!b?.length) return a?.length || 0;
    
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(matrix[i][j - 1] + 1, // insertion
                             matrix[i - 1][j] + 1) // deletion
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

/**
 * Fuzzy matches a search query against a target string.
 * Uses exact substring priority fallback to Levenshtein distance for typos.
 * Returns a score where lower is better (0 = exact match). Returns Infinity if no valid match.
 */
export function fuzzyMatchScore(query, target) {
    if (!query || !target) return Infinity;
    
    const q = query.toLowerCase().trim();
    const t = target.toLowerCase().trim();
    
    if (t === q) return 0;
    if (t.includes(q)) {
        // BUG FIX: this used to return q.length / t.length, which — with "lower is
        // better" — ranked the MOST verbose name best: "bell" scored
        // "Bellagio Poker Room Las Vegas" (0.14) ahead of "Bellagio" (0.5).
        // Score by match position first (prefix matches win) then by how much of the
        // target the query covers. Stays inside 0.05-0.45 so a whole-string hit
        // always outranks the flat 0.5 returned by the word-level hit below.
        const positionPenalty = t.indexOf(q) / t.length;   // 0 for a prefix match
        const coveragePenalty = 1 - (q.length / t.length); // 0 when the query IS the target
        return 0.05 + (0.2 * positionPenalty) + (0.2 * coveragePenalty);
    }
    
    // Check if any word in target matches query closely
    const targetWords = t.split(/\s+/);
    let bestDist = Infinity;
    
    for (const w of targetWords) {
        if (w.includes(q)) return 0.5;
        const dist = levenshteinDistance(q, w);
        // If typo is small relative to word length
        if (dist <= 2 && q.length >= 3) {
            bestDist = Math.min(bestDist, dist);
        }
    }
    
    // Overall string distance
    const totalDist = levenshteinDistance(q, t);
    if (totalDist <= 3 && q.length >= 4) {
        bestDist = Math.min(bestDist, totalDist);
    }
    
    return bestDist === Infinity ? Infinity : bestDist;
}

/**
 * Get the distance (in miles) from a user location to the nearest stop of a poker tour.
 * Tours may have a direct lat/lng, a headquarters location, or an array of stops.
 *
 * @param {object} tour - Tour object (may have latitude/longitude, stops, venues arrays)
 * @param {{ lat: number, lng: number }} userLocation - User's GPS coordinates
 * @returns {number|null} Distance in miles to the nearest tour stop, or null if no coordinates
 */
export function getNearestTourDistance(tour, userLocation) {
    if (!tour || !userLocation?.lat || !userLocation?.lng) return null;

    let minDist = null;

    // Direct lat/lng on the tour object (headquarters or primary location)
    if (tour.latitude != null && tour.longitude != null) {
        const d = haversineMiles(userLocation.lat, userLocation.lng, tour.latitude, tour.longitude);
        if (isFinite(d)) minDist = d;
    }

    // Array of stops or venues with their own coordinates
    const stopArrays = [tour.stops, tour.venues, tour.tour_stops].filter(Array.isArray);
    for (const arr of stopArrays) {
        for (const stop of arr) {
            if (stop?.latitude != null && stop?.longitude != null) {
                const d = haversineMiles(userLocation.lat, userLocation.lng, stop.latitude, stop.longitude);
                if (isFinite(d) && (minDist === null || d < minDist)) minDist = d;
            }
        }
    }

    return minDist;
}

