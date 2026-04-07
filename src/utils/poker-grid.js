/**
 * Poker Grid Utilities
 * Helper functions for working with 13x13 poker hand matrices
 */

// Standard poker ranks from highest to lowest
export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

/**
 * Generate a 13x13 matrix of poker hand names
 * Layout:
 * - Diagonal: Pairs (AA, KK, QQ, ..., 22)
 * - Above diagonal: Suited hands (AKs, AQs, ...)
 * - Below diagonal: Offsuit hands (AKo, AQo, ...)
 * 
 * @returns {string[][]} 13x13 array of hand names
 */
export function generateHandMatrix() {
    const matrix = [];
    
    for (let i = 0; i < 13; i++) {
        const row = [];
        for (let j = 0; j < 13; j++) {
            const rank1 = RANKS[i];
            const rank2 = RANKS[j];
            
            if (i === j) {
                // Diagonal: Pairs
                row.push(`${rank1}${rank2}`);
            } else if (i < j) {
                // Above diagonal: Suited
                row.push(`${rank1}${rank2}s`);
            } else {
                // Below diagonal: Offsuit
                row.push(`${rank2}${rank1}o`);
            }
        }
        matrix.push(row);
    }
    
    return matrix;
}

/**
 * Get the [row, col] position for a given hand
 * @param {string} hand - Hand notation (e.g., "AKs", "72o", "QQ")
 * @returns {[number, number]|null} [row, col] or null if invalid
 */
export function getHandPosition(hand) {
    if (!hand || hand.length < 2) return null;
    
    const rank1 = hand[0];
    const rank2 = hand[1];
    const suited = hand.endsWith('s');
    const offsuit = hand.endsWith('o');
    const isPair = hand.length === 2;
    
    const idx1 = RANKS.indexOf(rank1);
    const idx2 = RANKS.indexOf(rank2);
    
    if (idx1 === -1 || idx2 === -1) return null;
    
    if (isPair) {
        // Pairs are on the diagonal
        if (idx1 !== idx2) return null;
        return [idx1, idx2];
    } else if (suited) {
        // Suited hands are above diagonal (row < col)
        return idx1 < idx2 ? [idx1, idx2] : [idx2, idx1];
    } else if (offsuit) {
        // Offsuit hands are below diagonal (row > col)
        return idx1 > idx2 ? [idx1, idx2] : [idx2, idx1];
    }
    
    return null;
}

/**
 * Get the hand name at a given [row, col] position
 * @param {number} row - Row index (0-12)
 * @param {number} col - Column index (0-12)
 * @returns {string|null} Hand name or null if invalid position
 */
export function getHandAtPosition(row, col) {
    if (row < 0 || row > 12 || col < 0 || col > 12) return null;
    
    const rank1 = RANKS[row];
    const rank2 = RANKS[col];
    
    if (row === col) {
        // Diagonal: Pairs
        return `${rank1}${rank2}`;
    } else if (row < col) {
        // Above diagonal: Suited
        return `${rank1}${rank2}s`;
    } else {
        // Below diagonal: Offsuit
        return `${rank2}${rank1}o`;
    }
}

/**
 * Validate hand notation
 * @param {string} hand - Hand notation to validate
 * @returns {boolean} True if valid
 */
export function isValidHand(hand) {
    if (!hand || hand.length < 2 || hand.length > 3) return false;
    
    const rank1 = hand[0];
    const rank2 = hand[1];
    
    if (!RANKS.includes(rank1) || !RANKS.includes(rank2)) return false;
    
    if (hand.length === 2) {
        // Pair
        return rank1 === rank2;
    } else if (hand.length === 3) {
        // Suited or offsuit
        const suffix = hand[2];
        return (suffix === 's' || suffix === 'o') && rank1 !== rank2;
    }
    
    return false;
}

/**
 * Get all 169 unique poker hands
 * @returns {string[]} Array of all hand names
 */
export function getAllHands() {
    const hands = [];
    const matrix = generateHandMatrix();
    
    for (let i = 0; i < 13; i++) {
        for (let j = i; j < 13; j++) {
            hands.push(matrix[i][j]);
        }
    }
    
    return hands;
}

/**
 * Convert a chart grid object to a flat array for display
 * @param {Object} chartGrid - Chart grid JSONB object
 * @returns {Array} Array of {hand, action, freq, size}
 */
export function chartGridToArray(chartGrid) {
    if (!chartGrid) return [];
    
    return Object.entries(chartGrid).map(([hand, data]) => ({
        hand,
        ...data
    }));
}

/**
 * Get action color for visual display
 * @param {string} action - Action type (Fold, Call, Raise, Mixed)
 * @returns {Object} Color object with bg, border, text
 */
export function getActionColor(action) {
    const colors = {
        Fold: {
            bg: 'rgba(100, 100, 100, 0.3)',
            border: '#555',
            text: '#999',
            label: 'FOLD'
        },
        Call: {
            bg: 'rgba(16, 185, 129, 0.5)',
            border: '#10B981',
            text: '#10B981',
            label: 'CALL'
        },
        Raise: {
            bg: 'rgba(239, 68, 68, 0.5)',
            border: '#EF4444',
            text: '#EF4444',
            label: 'RAISE'
        },
        Mixed: {
            bg: 'rgba(168, 85, 247, 0.5)',
            border: '#A855F7',
            text: '#A855F7',
            label: 'MIXED'
        }
    };
    
    return colors[action] || colors.Fold;
}
