/**
 * PokerIQ Typography & Capitalization Law
 * DETERMINISTIC, NON-OPTIONAL formatter for all user-facing text
 * 
 * Rules:
 * - Default: Title Case
 * - Canonical poker terms: BB, SB, UTG, BTN, EV, ICM, 3-Bet, All-In, C-Bet, etc.
 * - Safe: Never mangle URLs, UUIDs, identifiers
 * - Idempotent: Running twice yields same output
 */

interface FormatOptions {
    raw?: boolean;
    locale?: string;
}

// Canonical ALL CAPS poker positions
const POSITIONS = ['BB', 'SB', 'UTG', 'UTG1', 'UTG2', 'HJ', 'LJ', 'CO', 'BTN', 'BU'];

// Canonical ALL CAPS metrics/acronyms
const METRICS = ['EV', 'ICM', 'ROI', 'VPIP', 'PFR', 'CFR', 'MDF', 'SPR', 'RFI', 'EQR', 'EQ', 'IR', 'OOP', 'IP'];

// Canonical capitalized streets
const STREETS = ['Preflop', 'Flop', 'Turn', 'River'];

// Canonical capitalized actions
const ACTIONS = ['Bet', 'Raise', 'Call', 'Fold', 'Check', 'Jam'];

/**
 * Check if string looks like an identifier/key/path that should not be mutated
 */
function isLikelyIdentifier(str: string): boolean {
    // UUID pattern
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) return true;

    // Hex hash (long alphanumeric)
    if (/^[0-9a-f]{16,}$/i.test(str)) return true;

    // snake_case, kebab-case with multiple separators
    if ((str.match(/_/g) || []).length >= 2) return true;
    if ((str.match(/-/g) || []).length >= 3) return true;

    // camelCase/PascalCase detection (has internal caps)
    if (/^[a-z]+[A-Z]/.test(str) || /^[A-Z][a-z]+[A-Z]/.test(str)) return true;

    // Path-like (multiple slashes)
    if ((str.match(/\//g) || []).length >= 2) return true;

    return false;
}

/**
 * Check if string contains URL or email
 */
function containsUrlOrEmail(str: string): boolean {
    return /(:\/\/|www\.|@.+\.)/.test(str);
}

/**
 * Normalize hand notation (poker canonical)
 * Examples: "akS" => "AKs", "AQO" => "AQo", "TT" => "TT"
 */
function normalizeHandNotation(token: string): string {
    // Pair or two ranks
    if (/^[2-9tjqka]{2}$/i.test(token)) {
        return token.toUpperCase();
    }

    // Two ranks + suited/offsuit suffix
    if (/^[2-9tjqka]{2}[so]$/i.test(token)) {
        return token.slice(0, 2).toUpperCase() + token.slice(2).toLowerCase();
    }

    return token;
}

/**
 * Main formatter implementing PokerIQ Typography Law
 */
export function formatPokerIQTitleCase(input: string, opts: FormatOptions = {}): string {
    // Fast fail-safe: raw mode
    if (opts.raw) return input;

    // Fast fail-safe: contains URL or email
    if (containsUrlOrEmail(input)) return input;

    // Fast fail-safe: looks like identifier
    if (isLikelyIdentifier(input)) return input;

    // Normalize number + unit forms (25bb => 25 BB, 100 bb => 100 BB)
    let result = input.replace(/(\d+)\s*(bb|BB|Bb)\b/g, '$1 BB');
    result = result.replace(/(\d+)\s*(sb|SB|Sb)\b/g, '$1 SB');

    // Normalize bet notation (3bet, 3-bet, 3 Bet => 3-Bet)
    result = result.replace(/\b([345])\s*-?\s*bet(ting)?\b/gi, (match, num, ting) => {
        return ting ? `${num}-Betting` : `${num}-Bet`;
    });

    // Normalize key poker terms
    result = result.replace(/\ball[- ]?in\b/gi, 'All-In');
    result = result.replace(/\bc[- ]?bet\b/gi, 'C-Bet');
    result = result.replace(/\bcheck[- ]?raise\b/gi, 'Check-Raise');
    result = result.replace(/\bdonk([- ]?bet)?\b/gi, 'Donk-Bet');
    result = result.replace(/\biso([- ]?raise)?\b/gi, 'Iso-Raise');

    // Normalize percent spacing (33.3 % => 33.3%)
    result = result.replace(/(\d+\.?\d*)\s+%/g, '$1%');

    // Tokenize preserving punctuation
    const tokens = result.split(/(\s+|[.,;:!?()[\]{}])/);

    const formatted = tokens.map(token => {
        // Preserve whitespace and punctuation
        if (/^\s+$/.test(token) || /^[.,;:!?()[\]{}]+$/.test(token)) {
            return token;
        }

        // Empty token
        if (!token) return token;

        // Check positions (case-insensitive match, output ALL CAPS)
        const upperToken = token.toUpperCase();
        if (POSITIONS.includes(upperToken)) {
            // Handle BU => BTN alias
            return upperToken === 'BU' ? 'BTN' : upperToken;
        }

        // Check metrics (case-insensitive match, output ALL CAPS)
        if (METRICS.includes(upperToken)) {
            return upperToken;
        }

        // Check streets (case-insensitive match, output canonical)
        const lowerToken = token.toLowerCase();
        const streetMatch = STREETS.find(s => s.toLowerCase() === lowerToken);
        if (streetMatch) return streetMatch;

        // Check actions (case-insensitive match, output canonical)
        const actionMatch = ACTIONS.find(a => a.toLowerCase() === lowerToken);
        if (actionMatch) return actionMatch;

        // Hand notation
        const handNormalized = normalizeHandNotation(token);
        if (handNormalized !== token) return handNormalized;

        // Default Title Case for word-like tokens
        if (/[a-zA-Z]/.test(token)) {
            return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
        }

        return token;
    });

    return formatted.join('');
}

export default formatPokerIQTitleCase;
