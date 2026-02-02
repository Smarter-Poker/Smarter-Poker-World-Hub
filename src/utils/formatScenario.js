/**
 * Format Scenario Helper
 * ═══════════════════════════════════════════════════════════════════════════
 * Formats poker scenarios for Standard (beginner) or Pro (advanced) view
 * ═══════════════════════════════════════════════════════════════════════════
 */

const POSITION_MAP = {
    'BTN': 'Button',
    'SB': 'Small Blind',
    'BB': 'Big Blind',
    'UTG': 'Under the Gun',
    'MP': 'Middle Position',
    'CO': 'Cutoff',
    'HJ': 'Hijack',
};

/**
 * Format a poker hand for display
 * @param {string} hand - Hand like "AKs" or "A♠K♠"
 * @param {string} viewMode - 'standard' or 'pro'
 */
function formatHand(hand, viewMode) {
    if (!hand) return '';

    // If already has suits, return as-is
    if (hand.includes('♠') || hand.includes('♥') || hand.includes('♦') || hand.includes('♣')) {
        return hand;
    }

    // Pro view keeps shorthand (AKs, QQ, etc)
    if (viewMode === 'pro') {
        return hand;
    }

    // Standard view: expand suited/offsuit
    if (hand.endsWith('s')) {
        return hand.slice(0, -1) + ' suited';
    }
    if (hand.endsWith('o')) {
        return hand.slice(0, -1) + ' offsuit';
    }

    return hand;
}

/**
 * Format position for display
 * @param {string} position - Position like "BTN" or "Button"
 * @param {string} viewMode - 'standard' or 'pro'
 */
function formatPosition(position, viewMode) {
    if (!position) return '';

    if (viewMode === 'pro') {
        // Pro view: use abbreviations
        const abbrev = Object.keys(POSITION_MAP).find(
            key => POSITION_MAP[key].toLowerCase() === position.toLowerCase()
        );
        return abbrev || position;
    }

    // Standard view: use full names
    return POSITION_MAP[position] || position;
}

/**
 * Format entire scenario for display
 * @param {object} scenario - Question scenario object
 * @param {string} viewMode - 'standard' or 'pro'
 */
export function formatScenario(scenario, viewMode = 'standard') {
    if (!scenario) return '';

    const {
        heroPosition,
        heroStack,
        heroHand,
        board,
        pot,
        villainPosition,
        villainStack,
        action,
        gameType,
    } = scenario;

    const parts = [];

    // Position
    if (heroPosition) {
        const label = viewMode === 'standard' ? 'Your Position' : 'Position';
        parts.push(`${label}: ${formatPosition(heroPosition, viewMode)}`);
    }

    // Stack (CRITICAL: Always show "Your Stack" in standard view)
    if (heroStack !== undefined) {
        const label = viewMode === 'standard' ? 'Your Stack' : 'Effective Stack';
        parts.push(`${label}: ${heroStack}bb`);
    }

    // Hand
    if (heroHand) {
        const label = viewMode === 'standard' ? 'Your Hand' : 'Hand';
        parts.push(`${label}: ${formatHand(heroHand, viewMode)}`);
    }

    // Board
    if (board) {
        parts.push(`Board: ${board}`);
    }

    // Pot
    if (pot !== undefined) {
        parts.push(`Pot: ${pot}bb`);
    }

    // Villain info
    if (villainPosition || villainStack) {
        const villainLabel = viewMode === 'standard' ? 'Opponent' : 'Villain';
        if (villainPosition) {
            parts.push(`${villainLabel} Position: ${formatPosition(villainPosition, viewMode)}`);
        }
        if (villainStack !== undefined) {
            parts.push(`${villainLabel} Stack: ${villainStack}bb`);
        }
    }

    // Action
    if (action) {
        const actionLabel = viewMode === 'standard' ? 'Opponent action' : 'Action';
        parts.push(`${actionLabel}: ${action}`);
    }

    return parts.join(' • ');
}
