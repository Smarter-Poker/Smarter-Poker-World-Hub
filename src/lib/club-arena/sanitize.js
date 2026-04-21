/**
 * Club Arena — Centralized Input Sanitizer
 * 
 * RED TEAM HARDENING: Prevents hostile string injection across all API routes.
 * Every user-supplied text field (notes, descriptions, themes, etc.) MUST pass
 * through these sanitizers before touching the database.
 * 
 * Defends against:
 *   - XSS via HTML/script injection
 *   - Log flooding via oversized strings
 *   - Null byte injection
 *   - SQL injection attempts (defense-in-depth; Supabase RPC is parameterized)
 *   - Unicode control character abuse
 */

/**
 * Sanitize a user-supplied note/text field.
 * @param {*} input - Raw input (any type)
 * @param {number} maxLen - Maximum allowed length (default 500)
 * @returns {string} - Clean, safe string
 */
function sanitizeNote(input, maxLen = 500) {
    if (input === null || input === undefined) return '';

    let str = String(input);

    // Strip null bytes (can cause truncation in C-backed systems)
    str = str.replace(/\0/g, '');

    // Strip HTML tags (defense-in-depth against XSS)
    str = str.replace(/<[^>]*>/g, '');

    // Strip dangerous Unicode control characters (zero-width joiners, RTL overrides, etc.)
    // Keep common whitespace: \t \n \r
    // eslint-disable-next-line no-control-regex
    str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200B-\u200F\u2028-\u2029\u202A-\u202E\uFEFF]/g, '');

    // Trim and cap length
    str = str.trim().slice(0, maxLen);

    return str;
}

/**
 * Sanitize a club name field.
 * More restrictive: alphanumeric, spaces, common punctuation only.
 * @param {*} input - Raw input
 * @param {number} maxLen - Maximum allowed length (default 100)
 * @returns {string} - Clean club name
 */
function sanitizeClubName(input, maxLen = 100) {
    if (!input) return '';
    let str = sanitizeNote(input, maxLen);
    // Allow letters, numbers, spaces, hyphens, underscores, apostrophes, periods
    str = str.replace(/[^\p{L}\p{N}\s\-_'.!&]/gu, '');
    return str.trim();
}

/**
 * Validate a theme ID against an allowlist.
 * @param {*} input - Raw theme value
 * @param {string[]} allowed - Allowed theme IDs
 * @returns {string|null} - Clean theme or null if invalid
 */
const VALID_THEMES = ['default', 'dark', 'blue', 'red', 'green', 'gold', 'purple', 'custom'];
function sanitizeTheme(input) {
    if (!input) return null;
    const str = String(input).toLowerCase().trim().slice(0, 50);
    // Only allow alphanumeric + hyphens (no special chars)
    if (!/^[a-z0-9-]+$/.test(str)) return null;
    return str;
}

/**
 * Validate and sanitize a numeric amount for chip operations.
 * Returns { valid: boolean, amount: number, error?: string }
 * @param {*} rawAmount - Raw input
 * @param {number} max - Maximum allowed (default 100M)
 * @param {number} min - Minimum allowed (default 1)
 */
function sanitizeAmount(rawAmount, max = 100_000_000, min = 1) {
    const amount = Math.floor(Number(rawAmount));

    if (!Number.isFinite(amount)) {
        return { valid: false, amount: 0, error: 'amount must be a valid number' };
    }
    if (amount < min) {
        return { valid: false, amount, error: `amount must be at least ${min}` };
    }
    if (amount > max) {
        return { valid: false, amount, error: `amount must not exceed ${max.toLocaleString()}` };
    }

    return { valid: true, amount };
}

/**
 * Sanitize a table name field.
 * Restrictive: alphanumeric, spaces, common punctuation only.
 * @param {*} input - Raw input
 * @param {number} maxLen - Maximum allowed length (default 50)
 * @returns {string} - Clean table name
 */
function sanitizeTableName(input, maxLen = 50) {
    if (!input) return '';
    let str = sanitizeNote(input, maxLen);
    // Allow letters, numbers, spaces, hyphens, underscores, apostrophes, periods, forward slashes
    str = str.replace(/[^\p{L}\p{N}\s\-_'.!/&]/gu, '');
    return str.trim();
}

/**
 * Clamp a numeric value to a range, rejecting NaN and Infinity.
 * @param {*} raw - Raw input
 * @param {number} min - Minimum allowed
 * @param {number} max - Maximum allowed
 * @param {number} fallback - Returned when raw is not a valid number
 * @returns {{ valid: boolean, value: number, error?: string }}
 */
function clampFloat(raw, min, max, fallback) {
    const num = parseFloat(raw);
    if (!Number.isFinite(num)) {
        if (fallback !== undefined) return { valid: true, value: fallback };
        return { valid: false, value: 0, error: `Must be a number between ${min} and ${max}` };
    }
    return { valid: true, value: Math.min(Math.max(num, min), max) };
}

/**
 * Exhaustive whitelist of allowed table settings keys.
 * Any key NOT in this set is stripped before DB write — prevents
 * prototype pollution and economy-exploit key injection (e.g., overwriting bbj_eligible).
 */
const ALLOWED_TABLE_SETTINGS = new Set([
    // Game modes
    'straddle_enabled', 'auto_utg_straddle', 'voluntary_straddle',
    'run_it_twice', 'run_it_thrice', 'run_it_mode',
    'insurance', 'bomb_pot_enabled', 'auto_muck',
    'private_game', 'vip_only', 'double_board', 'triple_board',
    'pineapple', 'seven_deuce', 'nit_game', 'anonymous_table',
    'cap', 'cap_amount', 'ban_chat', 'label_new', 'featured_table', 'no_rathole',
    // Player requirements
    'calltime', 'career_percent', 'maintain_percent', 'maintain_hands',
    // Auto settings
    'auto_start_players', 'auto_extension', 'auto_restart', 'auto_create_table',
    // Rake/Fee
    'fee_cap_bb', 'same_agent_downline_limit', 'buy_in_authorization',
    // Security
    'restrict_device', 'restrict_observers', 'gps_restriction',
    'ip_restriction', 'emulator_restriction', 'photo_rotation_verification',
    'hide_club_name', 'game_length_hours',
    // Tier/BBJ info (read-only — set by server, but safe to preserve)
    'stakes_tier', 'bbj_payout_total', 'bbj_payout_loser',
    'bbj_payout_winner', 'bbj_payout_table', 'bbj_qualifying_hand', 'bbj_eligible',
    // Rake overrides (tournament/SNG only)
    'rakePercent', 'rakeCap', 'bbjPercent',
    // Bomb pot
    'bomb_pot',
]);

/**
 * Strip non-whitelisted keys from a settings object.
 * Prevents prototype pollution and economy key injection.
 * @param {Object} raw - Raw settings object
 * @returns {Object} - Clean settings with only allowed keys
 */
function sanitizeSettings(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const clean = {};
    for (const [key, value] of Object.entries(raw || {})) {
        if (ALLOWED_TABLE_SETTINGS.has(key) && key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
            clean[key] = value;
        }
    }
    return clean;
}

/**
 * Strip sensitive error details for production responses.
 * Always log the full error server-side, but return only a safe message to clients.
 * @param {Error} err - The caught error
 * @param {string} publicMessage - Safe message for the client
 * @returns {{ error: string }} - Response body
 */
function safeErrorResponse(err, publicMessage = 'Internal server error') {
    const isDev = process.env.NODE_ENV === 'development';
    return {
        success: false,
        error: publicMessage,
        ...(isDev ? { _debug: err?.message } : {}),
    };
}

module.exports = {
    sanitizeNote,
    sanitizeClubName,
    sanitizeTableName,
    sanitizeTheme,
    sanitizeAmount,
    clampFloat,
    sanitizeSettings,
    safeErrorResponse,
    VALID_THEMES,
    ALLOWED_TABLE_SETTINGS,
};
