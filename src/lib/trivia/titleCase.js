/**
 * Title Case Utility for Trivia System
 * Capitalizes the first letter of every word
 */

/**
 * Convert text to Title Case (first letter of each word capitalized)
 * Handles common articles, prepositions, and conjunctions appropriately
 * @param {string} text - The text to convert
 * @param {boolean} strict - If true, capitalizes EVERY word. If false, keeps small words lowercase (default: true for trivia)
 * @returns {string} - Title cased text
 */
export function toTitleCase(text, strict = true) {
    if (!text || typeof text !== 'string') return text || '';

    // Small words to keep lowercase (only used when strict = false)
    const smallWords = ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'of', 'in', 'is'];

    return text
        .toLowerCase()
        .split(' ')
        .map((word, index) => {
            if (!word) return word;

            // In strict mode or for first word, always capitalize
            if (strict || index === 0) {
                return word.charAt(0).toUpperCase() + word.slice(1);
            }

            // Keep small words lowercase (non-strict mode)
            if (smallWords.includes(word)) {
                return word;
            }

            return word.charAt(0).toUpperCase() + word.slice(1);
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
