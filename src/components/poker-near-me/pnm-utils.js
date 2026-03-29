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
    if (!lat1 || !lng1 || !lat2 || !lng2) return 0;
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
    return { color: '#58a6ff', label: 'OPEN', border: 'rgba(88,166,255,0.3)', bg: 'rgba(88,166,255,0.05)' };
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

/**
 * Get venue logo URL with intelligent fallback chain:
 * 1. profile_photo_url (from social page / Commander)
 * 2. cover_photo_url (uploaded venue cover)
 * 3. Google Favicon API (derived from venue website domain)
 * 4. null (component should render gradient placeholder)
 * 
 * @param {object} venue - Venue object
 * @returns {string|null} Logo URL or null
 */
export function getVenueLogoUrl(venue) {
    if (!venue) return null;
    // Priority 1: Profile photo from social page
    if (venue.profile_photo_url) return venue.profile_photo_url;
    // Priority 2: Cover photo
    if (venue.cover_photo_url) return venue.cover_photo_url;
    // Priority 3: Google Favicon service from website domain
    if (venue.website) {
        try {
            let domain = venue.website;
            if (!domain.startsWith('http')) domain = 'https://' + domain;
            const url = new URL(domain);
            return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
        } catch { /* invalid URL */ }
    }
    return null;
}

/**
 * Parse operating hours and determine open/closed status.
 * Handles formats: "24/7", "12:00pm - 4:00am", "12pm-4am", etc.
 * 
 * @param {object} venue - Venue object with hours, hours_weekday, hours_weekend
 * @returns {{ open: boolean, label: string, always: boolean, nextChange: string|null } | null}
 */
export function getOpenStatus(venue) {
    if (!venue) return null;
    
    // 24/7 venues
    if (venue.is_24_hours || venue.hours === '24/7' || venue.hours_weekday === '24/7') {
        return { open: true, label: 'Open 24/7', always: true, nextChange: null };
    }
    
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
    
    // Pick the right hours string
    let hoursStr = null;
    if (isWeekend && venue.hours_weekend) {
        hoursStr = venue.hours_weekend;
    } else if (venue.hours_weekday) {
        hoursStr = venue.hours_weekday;
    } else if (venue.hours) {
        hoursStr = venue.hours;
    }
    
    if (!hoursStr || hoursStr === '24/7') {
        // Most poker venues without listed hours are 24/7 operations
        return { open: true, label: 'Open 24/7', always: true, nextChange: null };
    }
    
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
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    
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
    if (score >= 10) return { score, label: 'Quiet', color: '#58a6ff' };
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
    return { minutes, label: `~${Math.round(minutes / 60)}h ${minutes % 60}m` };
}

/**
 * Save PNM filter state to sessionStorage.
 * @param {string} key - Filter group key
 * @param {object} filters - Filter values to persist
 */
export function saveFilters(key, filters) {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.setItem(`pnm_filters_${key}`, JSON.stringify(filters));
    } catch { /* quota exceeded or private mode */ }
}

/**
 * Load PNM filter state from sessionStorage.
 * @param {string} key - Filter group key
 * @param {object} defaults - Default filter values
 * @returns {object} Merged filter values
 */
export function loadFilters(key, defaults) {
    if (typeof window === 'undefined') return defaults;
    try {
        const saved = sessionStorage.getItem(`pnm_filters_${key}`);
        if (saved) return { ...defaults, ...JSON.parse(saved) };
    } catch { /* parse error */ }
    return defaults;
}
