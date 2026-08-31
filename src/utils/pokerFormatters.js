/**
 * Shared Poker Formatting Utilities
 * 
 * Centralized formatting functions used across all poker hub pages.
 * Eliminates 20+ duplicate inline functions across Daily Tournaments,
 * Poker Near Me, Events Calendar, Series, Venues, and Lobby pages.
 */

/**
 * Normalize raw game type strings to standardized poker terminology.
 * @param {string} raw - Raw game type from database (e.g., 'holdem', 'nlh', 'plo')
 * @returns {string} Formatted game type (e.g., "Hold'em", "NLH", "PLO")
 */
export function formatGameType(raw) {
    if (!raw) return 'NLH';
    const lower = raw.toLowerCase().trim();
    if (lower === 'holdem' || lower === "hold'em" || lower === "texas hold'em" || lower === 'texas holdem') return "Hold'em";
    if (lower === 'nlh' || lower === 'no limit holdem' || lower === "no limit hold'em" || lower === 'no-limit holdem') return 'NLH';
    if (lower === 'plo' || lower === 'pot limit omaha') return 'PLO';
    if (lower === 'omaha' || lower === 'omaha hi-lo') return 'Omaha';
    if (lower === 'horse') return 'HORSE';
    if (lower === 'mixed' || lower === 'mixed games') return 'Mixed';
    if (lower === 'stud' || lower === '7-card stud' || lower === 'seven card stud') return 'Stud';
    if (lower === 'deepstack' || lower === 'deep stack') return 'Deep Stack';
    if (lower === 'razz') return 'Razz';
    if (lower === 'badugi') return 'Badugi';
    if (lower === 'limit holdem' || lower === "limit hold'em") return "Limit Hold'em";
    if (lower === 'unknown') return 'NLH';
    // Capitalize first letter of each word for anything else
    return raw.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Format raw time strings to 12-hour AM/PM format.
 * Handles: "16:00:00" (HH:MM:SS), "4:00am", "4:00 PM", etc.
 * @param {string} timeStr - Raw time string
 * @returns {string} Formatted time (e.g., "4:00 PM")
 */
export function formatTime(timeStr) {
    if (!timeStr) return '';
    // Handle HH:MM:SS format from database
    const colonParts = timeStr.split(':');
    if (colonParts.length >= 2 && !timeStr.match(/[AP]M/i)) {
        let h = parseInt(colonParts[0], 10);
        const m = colonParts[1].replace(/\D/g, '').padStart(2, '0');
        if (!isNaN(h)) {
            const ampm = h >= 12 ? 'PM' : 'AM';
            if (h === 0) h = 12;
            else if (h > 12) h -= 12;
            return `${h}:${m} ${ampm}`;
        }
    }
    // Handle existing AM/PM strings — ensure proper capitalization and spacing
    return timeStr.replace(/(\d+:\d+)\s*([ap]m)/i, (_, time, p) => `${time} ${p.toUpperCase()}`);
}

/**
 * Format monetary amounts with K/M abbreviations.
 * @param {number} amount - Dollar amount
 * @returns {string} Formatted string (e.g., "$1.5K", "$2M", "$500")
 */
export function formatMoney(amount) {
    if (!amount) return '';
    if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(amount % 1000000 === 0 ? 0 : 1) + 'M';
    if (amount >= 1000) return '$' + (amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1) + 'K';
    return '$' + amount.toLocaleString();
}

/**
 * Format venue type strings — strips underscores/hyphens and title-cases.
 * @param {string} raw - Raw venue type (e.g., "poker_club", "card_room")
 * @returns {string|null} Formatted string or null if empty/Unknown
 */
export function formatVenueType(raw) {
    if (!raw || raw === 'Unknown') return null;
    return raw.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Format a date string to short display format.
 * @param {string} dateStr - ISO date string
 * @returns {string} Formatted date (e.g., "Mar 29")
 */
export function formatShortDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format a date range for display.
 * @param {string} startDate - Start date ISO string
 * @param {string} endDate - End date ISO string
 * @returns {string} Formatted range (e.g., "Mar 15 – Apr 2, 2026")
 */
export function formatDateRange(startDate, endDate) {
    if (!startDate) return 'TBD';
    const start = new Date(startDate);
    if (isNaN(start.getTime())) return startDate;
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!endDate) return startStr;
    const end = new Date(endDate);
    if (isNaN(end.getTime())) return startStr;
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startStr} - ${endStr}`;
}

/**
 * Decode HTML entities from scraped data.
 * Handles common entities that appear in tournament/series names from PokerAtlas.
 * @param {string} str - String potentially containing HTML entities
 * @returns {string} Decoded string
 */
export function decodeHtml(str) {
    if (!str) return str;
    return str
        .replace(/&ndash;/gi, '\u2013')
        .replace(/&mdash;/gi, '\u2014')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#([0-9]{1,7});/gi, (match, numStr) => String.fromCharCode(parseInt(numStr, 10)))
        .replace(/&#x([0-9a-f]{1,6});/gi, (match, hexStr) => String.fromCharCode(parseInt(hexStr, 16)));
}
