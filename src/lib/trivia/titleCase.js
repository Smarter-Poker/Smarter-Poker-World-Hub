/**
 * Title Case Utility for Trivia System
 * Capitalizes the first letter of every word while preserving poker acronyms
 */

// Poker/Gaming acronyms to preserve in UPPERCASE
const ACRONYMS = new Set([
    'WSOP', 'WPT', 'EPT', 'GTO', 'ICM', 'EV', 'SPR', 'HUD', 'MTT', 'SNG',
    'PLO', 'NLH', 'NLHE', 'LHE', 'PL', 'NL', 'FL', 'BB', 'SB', 'BTN', 'CO',
    'UTG', 'MP', 'LP', 'EP', 'IP', 'OOP', 'VPIP', 'PFR', 'AF', '3BET', 'ATC',
    'LAG', 'TAG', 'ABC', 'AI', 'AKA', 'APT', 'BRM', 'CBet', 'DON', 'FPS',
    'HH', 'HSP', 'ITM', 'LATB', 'MDF', 'NFD', 'OESD', 'OMC', 'OTB', 'PAD',
    'POF', 'PIO', 'RIO', 'ROI', 'RNG', 'SRP', 'TNT', 'TOC', 'WA', 'WB',
    'USA', 'US', 'UK', 'TV', 'UIGEA', 'DOJ', 'IRS', 'LV', 'LA', 'NYC'
]);

// ═══════════════════════════════════════════════════════════════════════════
// POKER CARD NOTATION DETECTION
// ═══════════════════════════════════════════════════════════════════════════
// The previous single pattern was case-INSENSITIVE and its rank/suit classes
// overlapped ordinary English letters, so plain words matched and were mangled
// on screen: 'that' -> 'ThAT', 'jack' -> 'JAcK', 'ask' -> 'AsK',
// 'task' -> 'TAsK', 'taco' -> 'TAco', 'at' -> 'AT', 'aha' -> 'AhA'.
// These strings appear constantly in question and option text (including the
// name "Jack" in poker-history questions), so answers rendered garbled.
//
// A token is only treated as card notation when it is UNAMBIGUOUS:
//   1. it contains an explicit suit glyph (♥ ♦ ♣ ♠), or
//   2. it is already written in canonical card casing in the SOURCE — i.e.
//      uppercase ranks with lowercase letter suits (Qh, AsKd, T9s) or a
//      pure rank pair with the s/o suffix (AKs, T9o, 72).
// A fully-lowercase alphabetic word can never match.

// Suited/offsuit shorthand: AK, AKs, T9o, 72o — ranks MUST be uppercase.
const CARD_SHORTHAND = /^[AKQJT2-9]{2,3}[so]?$/;

// Explicit cards with letter suits: Qh, AsKd, T9s2c — ranks uppercase,
// suits lowercase, and at least one rank+suit pair present.
const CARD_LETTER_SUITS = /^(?:[AKQJT2-9][hdcs]){1,5}$/;

// Anything containing a real suit glyph is unambiguous regardless of casing.
const SUIT_GLYPH = /[♥♦♣♠]/;
const CARD_GLYPH_NOTATION = /^(?:[AKQJTakqjt2-9][hdcsHDCS♥♦♣♠]?){1,5}[so]?$/;

/**
 * Is this token poker card notation (as opposed to an English word)?
 * Tested against the ORIGINAL token — casing is part of the signal.
 * @param {string} token
 * @returns {boolean}
 */
export function isCardNotation(token) {
    if (!token || typeof token !== 'string') return false;
    if (SUIT_GLYPH.test(token)) return CARD_GLYPH_NOTATION.test(token);
    if (CARD_LETTER_SUITS.test(token)) return true;
    // Pure-rank shorthand must contain at least one letter rank OR be a
    // two-digit hand like '72o'; bare numbers ('72', '2026') are not cards.
    if (CARD_SHORTHAND.test(token)) return /[AKQJT]/.test(token) || /[so]$/.test(token);
    return false;
}

/**
 * Convert text to Title Case (first letter of each word capitalized)
 * Preserves poker acronyms in uppercase
 * @param {string} text - The text to convert
 * @param {boolean} strict - If true, capitalizes EVERY word. If false, keeps small words lowercase (default: true for trivia)
 * @returns {string} - Title cased text with preserved acronyms
 */
export function toTitleCase(text, strict = true) {
    if (!text || typeof text !== 'string') return text || '';

    // Small words to keep lowercase (only used when strict = false)
    const smallWords = ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'of', 'in', 'is'];

    return text
        .split(' ')
        .map((word, index) => {
            if (!word) return word;

            // Check if the word (uppercased) is an acronym - preserve original if matches
            const upperWord = word.toUpperCase();
            if (ACRONYMS.has(upperWord)) {
                return upperWord;
            }

            // Card notation is checked on the RAW token first. The
            // punctuation-stripping below treats a leading digit as
            // punctuation, which used to shred numeric-rank hands
            // ('9c9d' -> '9C9d', '72o' -> '72O').
            if (isCardNotation(word)) {
                return SUIT_GLYPH.test(word)
                    ? word.replace(/[akqjt]/g, m => m.toUpperCase())
                    : word;
            }

            // Handle words starting with punctuation (like quotes)
            const leadingPunct = word.match(/^[^a-zA-Z]*/)?.[0] || '';
            const trailingPunct = word.match(/[^a-zA-Z]*$/)?.[0] || '';
            const coreWord = word.slice(leadingPunct.length, word.length - (trailingPunct.length || 0) || undefined);

            if (!coreWord) return word;

            // Check if core word is card notation (e.g., QhJh, AKs, T9s, A♠K♦)
            if (isCardNotation(coreWord)) {
                // Glyph notation may be typed lowercase ('a♠k♦') — normalise the
                // ranks. Letter-suit and shorthand forms already required
                // uppercase ranks to match, so they pass through untouched
                // (crucially, 'AKs' keeps its lowercase suited marker).
                const fixedCards = SUIT_GLYPH.test(coreWord)
                    ? coreWord.replace(/[akqjt]/g, m => m.toUpperCase())
                    : coreWord;
                return leadingPunct + fixedCards + trailingPunct;
            }

            // Check if core word is an acronym
            const upperCore = coreWord.toUpperCase();
            if (ACRONYMS.has(upperCore)) {
                return leadingPunct + upperCore + trailingPunct;
            }

            // In strict mode or for first word, always capitalize
            if (strict || index === 0) {
                const titleCased = coreWord.charAt(0).toUpperCase() + coreWord.slice(1).toLowerCase();
                return leadingPunct + titleCased + trailingPunct;
            }

            // Keep small words lowercase (non-strict mode)
            const lowerCore = coreWord.toLowerCase();
            if (smallWords.includes(lowerCore)) {
                return leadingPunct + lowerCore + trailingPunct;
            }

            const titleCased = coreWord.charAt(0).toUpperCase() + coreWord.slice(1).toLowerCase();
            return leadingPunct + titleCased + trailingPunct;
        })
        .join(' ');
}

/**
 * Title case an array of options (for trivia answers)
 * @param {string[]} options - Array of answer options
 * @returns {string[]} - Title cased options
 */
export function titleCaseOptions(options) {
    if (!Array.isArray(options)) return options;
    return options.map(opt => toTitleCase(opt));
}

export default { toTitleCase, titleCaseOptions };
