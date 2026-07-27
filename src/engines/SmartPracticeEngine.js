/**
 * SMART PRACTICE ENGINE — Adaptive Weakness Targeting
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Analyzes user's training session history to identify weaknesses and
 * generate targeted drill configurations. GTO Wizard's "Smart Practice"
 * feature — automatically drills you on your weakest areas.
 *
 * Weakness Dimensions:
 * 1. Position (lowest accuracy by seat: BTN, SB, BB, etc.)
 * 2. Street (most EV loss on flop/turn/river)
 * 3. Action Type (over-folding, under-bluffing, etc.)
 * 4. Hand Class (low accuracy with suited connectors, pocket pairs, etc.)
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

const POSITION_ORDER = ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const STREET_ORDER = ['preflop', 'flop', 'turn', 'river'];
const HAND_CLASSES = [
    'Pocket Pairs', 'Suited Connectors', 'Suited Aces',
    'Broadway', 'Offsuit Connectors', 'Suited Gappers',
];

/**
 * Analyze a user's hand history to build a weakness profile
 * @param {Array} handHistory - Array of hand entries from session data
 * @returns {Object} weakSpotProfile - Ranked weakness dimensions
 */
export function analyzeWeakSpots(handHistory) {
    if (!handHistory || handHistory.length < 5) {
        return { hasData: false, weaknesses: [], topWeakness: null };
    }

    const positionStats = {};
    const streetStats = {};
    const actionStats = {};
    const handClassStats = {};

    handHistory.forEach(hand => {
        const data = hand.handData || hand;
        const position = data.heroPosition || data.position || 'Unknown';
        const street = data.street || 'flop';
        const action = data.action || 'unknown';
        const isCorrect = hand.isCorrect || data.isCorrect || false;
        const evLoss = hand.evLoss || data.evLoss || 0;
        const heroHand = data.heroHand || '';

        // Position tracking
        if (!positionStats[position]) positionStats[position] = { correct: 0, total: 0, evLoss: 0 };
        positionStats[position].total++;
        if (isCorrect) positionStats[position].correct++;
        positionStats[position].evLoss += evLoss;

        // Street tracking
        if (!streetStats[street]) streetStats[street] = { correct: 0, total: 0, evLoss: 0 };
        streetStats[street].total++;
        if (isCorrect) streetStats[street].correct++;
        streetStats[street].evLoss += evLoss;

        // Action tracking
        if (!actionStats[action]) actionStats[action] = { correct: 0, total: 0, evLoss: 0 };
        actionStats[action].total++;
        if (isCorrect) actionStats[action].correct++;
        actionStats[action].evLoss += evLoss;

        // Hand class tracking
        const handClass = classifyHand(heroHand);
        if (!handClassStats[handClass]) handClassStats[handClass] = { correct: 0, total: 0, evLoss: 0 };
        handClassStats[handClass].total++;
        if (isCorrect) handClassStats[handClass].correct++;
        handClassStats[handClass].evLoss += evLoss;
    });

    // Score each dimension (lower accuracy = worse)
    const weaknesses = [];

    Object.entries(positionStats || {}).forEach(([pos, stats]) => {
        if (stats.total >= 3) {
            const accuracy = Math.round((stats.correct / stats.total) * 100);
            weaknesses.push({
                type: 'position',
                label: `${pos} Position`,
                key: pos,
                accuracy,
                evLoss: stats.evLoss,
                total: stats.total,
                severity: 100 - accuracy + (stats.evLoss * 5),
            });
        }
    });

    Object.entries(streetStats || {}).forEach(([street, stats]) => {
        if (stats.total >= 3) {
            const accuracy = Math.round((stats.correct / stats.total) * 100);
            weaknesses.push({
                type: 'street',
                label: `${street.charAt(0).toUpperCase() + street.slice(1)} Play`,
                key: street,
                accuracy,
                evLoss: stats.evLoss,
                total: stats.total,
                severity: 100 - accuracy + (stats.evLoss * 5),
            });
        }
    });

    Object.entries(handClassStats || {}).forEach(([cls, stats]) => {
        if (stats.total >= 3) {
            const accuracy = Math.round((stats.correct / stats.total) * 100);
            weaknesses.push({
                type: 'handClass',
                label: cls,
                key: cls,
                accuracy,
                evLoss: stats.evLoss,
                total: stats.total,
                severity: 100 - accuracy + (stats.evLoss * 5),
            });
        }
    });

    // Sort by severity (highest = weakest)
    weaknesses.sort((a, b) => b.severity - a.severity);

    return {
        hasData: true,
        weaknesses,
        topWeakness: weaknesses[0] || null,
        positionStats,
        streetStats,
        actionStats,
        handClassStats,
        totalHands: handHistory.length,
    };
}

/**
 * Generate a trainer config targeting the user's #1 weakness
 * @param {Object} weakSpotProfile - From analyzeWeakSpots
 * @returns {Object} trainerConfig - Ready to pass to GodModeArena
 */
export function getSmartPracticeConfig(weakSpotProfile) {
    if (!weakSpotProfile?.topWeakness) {
        return null;
    }

    const w = weakSpotProfile.topWeakness;

    const config = {
        label: `◆ Smart: ${w.label}`,
        isSmartPractice: true,
        weakness: w,
    };

    switch (w.type) {
        case 'position':
            config.positions = [w.key];
            config.questionsCount = 15;
            break;
        case 'street':
            config.streets = [w.key];
            config.questionsCount = 15;
            break;
        case 'handClass':
            config.handClasses = [w.key];
            config.questionsCount = 15;
            break;
        default:
            config.questionsCount = 15;
    }

    return config;
}

/**
 * Classify a hero hand like "AKs" into a hand class category
 */
function classifyHand(heroHand) {
    if (!heroHand || heroHand.length < 2) return 'Other';

    const r1 = heroHand[0];
    const r2 = heroHand[1];
    const suffix = heroHand.length >= 3 ? heroHand[2] : '';

    // Pocket pair
    if (r1 === r2) return 'Pocket Pairs';

    // Check ranks
    const broadway = ['A', 'K', 'Q', 'J', 'T'];
    const ranks = '23456789TJQKA';
    const i1 = ranks.indexOf(r1);
    const i2 = ranks.indexOf(r2);
    const gap = Math.abs(i1 - i2);

    if (r1 === 'A' && suffix === 's') return 'Suited Aces';
    if (broadway.includes(r1) && broadway.includes(r2)) return 'Broadway';
    if (gap === 1 && suffix === 's') return 'Suited Connectors';
    if (gap === 1) return 'Offsuit Connectors';
    if (gap <= 3 && suffix === 's') return 'Suited Gappers';

    return 'Other';
}

export default { analyzeWeakSpots, getSmartPracticeConfig, classifyHand };
