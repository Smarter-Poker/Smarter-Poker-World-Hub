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
