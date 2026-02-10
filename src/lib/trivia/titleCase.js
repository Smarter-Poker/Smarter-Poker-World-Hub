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

// Regex for poker card notation: e.g., QhJh, A♠K♦, 9♣9♦, AKs, AKo, T♠9♣2♦
// Matches rank(suit) patterns — ranks are A,K,Q,J,T,2-9, suits are h,d,c,s or ♥♦♣♠
const CARD_PATTERN = /^[AKQJT2-9][hdcs♥♦♣♠]?[AKQJT2-9]?[hdcs♥♦♣♠]?[AKQJT2-9]?[hdcs♥♦♣♠]?[AKQJT2-9]?[hdcs♥♦♣♠]?[so]?$/i;

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

            // Handle words starting with punctuation (like quotes)
            const leadingPunct = word.match(/^[^a-zA-Z]*/)?.[0] || '';
            const trailingPunct = word.match(/[^a-zA-Z]*$/)?.[0] || '';
            const coreWord = word.slice(leadingPunct.length, word.length - (trailingPunct.length || 0) || undefined);

            if (!coreWord) return word;

            // Check if core word is a card notation (e.g., QhJh, AKs, T9s)
            if (CARD_PATTERN.test(coreWord)) {
                // Uppercase all rank letters (A,K,Q,J,T) in card notation
                const fixedCards = coreWord.replace(/[akqjt]/gi, m => m.toUpperCase());
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
