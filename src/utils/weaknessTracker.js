/**
 * 📊 CROSS-SESSION WEAKNESS TRACKER
 * ═══════════════════════════════════════════════════════════════════════════
 * Persists position-level mistake data to localStorage so the heatmap can
 * show cumulative weaknesses across multiple training sessions.
 *
 * Shape in localStorage (key: 'sp_weakness_data'):
 * {
 *   positions: { UTG: { mistakes: 14, total: 82 }, BB: { mistakes: 22, total: 95 }, ... },
 *   gameBreakdown: { 'speed-drill': { mistakes: 8, total: 40 }, ... },
 *   lastUpdated: 1712345678901,
 *   totalSessions: 42
 * }
 * ═══════════════════════════════════════════════════════════════════════════
 */

const STORAGE_KEY = 'sp_weakness_data';
const POSITIONS = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const SPOT_TYPES = ['rfi', 'vs3bet', 'bb_defense', '4bet', 'cold_call', 'squeeze'];

function extractPosition(title) {
    if (!title || typeof title !== 'string') return null;
    const upper = title.toUpperCase();
    const positions = ['UTG+1', 'UTG', 'MP', 'HJ', 'LJ', 'CO', 'BTN', 'SB', 'BB', 'EP'];
    for (const pos of positions) {
        if (upper.startsWith(pos + ' ') || upper.startsWith(pos + '+') || upper.includes(' ' + pos + ' ') || upper === pos) {
            return pos === 'EP' ? 'UTG' : pos === 'LJ' ? 'HJ' : pos === 'UTG+1' ? 'UTG' : pos;
        }
    }
    return null;
}

function getStoredData() {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function getDefaultData() {
    const positions = {};
    POSITIONS.forEach(p => { positions[p] = { mistakes: 0, total: 0 }; });
    return { positions, gameBreakdown: {}, lastUpdated: Date.now(), totalSessions: 0 };
}

/**
 * Record session results into the cumulative weakness tracker
 * @param {string} gameMode - e.g. 'speed-drill', 'pressure-cooker'
 * @param {Array} mistakes - Array of mistake objects (same shape games use)
 * @param {number} totalAnswers - Total questions answered this session
 */
export function recordSessionWeakness(gameMode, mistakes, totalAnswers) {
    if (typeof window === 'undefined') return;
    try {
        const data = getStoredData() || getDefaultData();

        // Track per-position mistakes
        const positionMistakes = {};
        const positionTotals = {};

        mistakes.forEach(m => {
            const raw = m.position || m.spot || m.title || '';
            const pos = extractPosition(raw);
            if (pos) {
                positionMistakes[pos] = (positionMistakes[pos] || 0) + 1;
            }
        });

        // Distribute total answers proportionally across detected positions
        // (We can't know exact per-position totals from the game, so we
        //  increment each position that had at least one mistake, plus
        //  give a baseline to all positions based on total answers)
        const detectedPositions = Object.keys(positionMistakes);
        if (detectedPositions.length > 0 && totalAnswers > 0) {
            // Add mistakes to cumulative
            detectedPositions.forEach(pos => {
                if (!data.positions[pos]) data.positions[pos] = { mistakes: 0, total: 0 };
                data.positions[pos].mistakes += positionMistakes[pos];
            });

            // Distribute total answers roughly across all positions
            // (better than nothing — gives a decent denominator)
            const perPosition = Math.max(1, Math.round(totalAnswers / POSITIONS.length));
            POSITIONS.forEach(pos => {
                if (!data.positions[pos]) data.positions[pos] = { mistakes: 0, total: 0 };
                data.positions[pos].total += perPosition;
            });
        }

        // Track per-game breakdown
        if (!data.gameBreakdown[gameMode]) data.gameBreakdown[gameMode] = { mistakes: 0, total: 0 };
        data.gameBreakdown[gameMode].mistakes += mistakes.length;
        data.gameBreakdown[gameMode].total += totalAnswers;

        data.totalSessions = (data.totalSessions || 0) + 1;
        data.lastUpdated = Date.now();

        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('[WeaknessTracker] Save failed:', e);
    }
}

/**
 * Get cumulative weakness data for the heatmap
 * Returns array of { key, label, mistakes, total, ratio } or null
 */
export function getCumulativeWeakness() {
    if (typeof window === 'undefined') return null;
    const data = getStoredData();
    if (!data || !data.positions) return null;

    const result = POSITIONS.map(pos => {
        const d = data.positions[pos] || { mistakes: 0, total: 0 };
        return {
            key: pos,
            label: pos,
            mistakes: d.mistakes,
            total: d.total,
            ratio: d.total > 0 ? d.mistakes / d.total : 0,
        };
    });

    // Only return if there's actual data
    const hasMistakes = result.some(r => r.mistakes > 0);
    return hasMistakes ? result : null;
}

/**
 * Get game-by-game breakdown
 */
export function getGameBreakdown() {
    if (typeof window === 'undefined') return null;
    const data = getStoredData();
    return data?.gameBreakdown || null;
}

/**
 * Get total sessions count
 */
export function getTotalSessions() {
    if (typeof window === 'undefined') return 0;
    const data = getStoredData();
    return data?.totalSessions || 0;
}

/**
 * Reset all weakness data
 */
export function resetWeaknessData() {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// SPOT-TYPE WEAKNESS TRACKING — Feeds into adaptive difficulty system
// ═══════════════════════════════════════════════════════════════════════════

const SPOT_WEAKNESS_KEY = 'sp_spot_weakness';

/**
 * Extract the spot type from a scenario or mistake object.
 * Checks spotType field first, then falls back to title/context matching.
 */
function extractSpotType(obj) {
    if (!obj) return null;
    if (obj.spotType && SPOT_TYPES.includes(obj.spotType)) return obj.spotType;

    const title = (obj.title || obj.position || obj.context || '').toLowerCase();
    if (title.includes('squeeze') || title.includes('sqz')) return 'squeeze';
    if (title.includes('4-bet') || title.includes('4bet')) return '4bet';
    if (title.includes('cold call') || title.includes('cold-call') || title.includes('flat')) return 'cold_call';
    if (title.includes('bb defense') || title.includes('bb def')) return 'bb_defense';
    if (title.includes('3-bet') || title.includes('3bet') || title.includes('vs3bet')) return 'vs3bet';
    if (title.includes('open') || title.includes('rfi')) return 'rfi';
    return null;
}

/**
 * Record a single hand result with full spot metadata.
 * Called after each hand in training games for granular tracking.
 *
 * @param {object} params
 * @param {string} params.position - Hero position (UTG, CO, BTN, etc.)
 * @param {string} params.spotType - Spot type (rfi, vs3bet, bb_defense, etc.)
 * @param {string} params.hand - Hand notation (AKs, 77, etc.)
 * @param {boolean} params.isCorrect - Whether the user got it right
 * @param {string} params.userAction - What the user chose
 * @param {string} params.correctAction - What the correct action was
 */
export function recordHandResult({ position, spotType, hand, isCorrect, userAction, correctAction }) {
    if (typeof window === 'undefined') return;
    try {
        const raw = localStorage.getItem(SPOT_WEAKNESS_KEY);
        const data = raw ? JSON.parse(raw) : { spots: {}, hands: {}, updated: 0 };

        // Track by position × spotType
        const spotKey = `${position || 'UNK'}_${spotType || 'unknown'}`;
        if (!data.spots[spotKey]) data.spots[spotKey] = { correct: 0, total: 0, mistakes: [] };
        data.spots[spotKey].total += 1;
        if (isCorrect) {
            data.spots[spotKey].correct += 1;
        } else {
            // Keep last 20 mistakes per spot for analysis
            data.spots[spotKey].mistakes.push({ hand, userAction, correctAction, ts: Date.now() });
            if (data.spots[spotKey].mistakes.length > 20) {
                data.spots[spotKey].mistakes = data.spots[spotKey].mistakes.slice(-20);
            }
        }

        // Track by hand category (which hands does the user struggle with?)
        if (!isCorrect && hand) {
            if (!data.hands[hand]) data.hands[hand] = { wrong: 0, total: 0 };
            data.hands[hand].wrong += 1;
            data.hands[hand].total += 1;
        } else if (hand) {
            if (!data.hands[hand]) data.hands[hand] = { wrong: 0, total: 0 };
            data.hands[hand].total += 1;
        }

        data.updated = Date.now();
        localStorage.setItem(SPOT_WEAKNESS_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('[SpotWeakness] Save failed:', e);
    }
}

/**
 * Get the user's weakest spots, sorted by error rate (descending).
 * Returns array of { position, spotType, accuracy, total, mistakes }
 *
 * Used by DeterministicGTOEngine to bias training toward weak areas.
 */
export function getWeakestSpots(minTotal = 5) {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(SPOT_WEAKNESS_KEY);
        if (!raw) return [];
        const data = JSON.parse(raw);
        if (!data.spots) return [];

        return Object.entries(data.spots)
            .filter(([, v]) => v.total >= minTotal)
            .map(([key, v]) => {
                const [position, spotType] = key.split('_');
                return {
                    position,
                    spotType,
                    accuracy: v.total > 0 ? Math.round(v.correct / v.total * 100) : 0,
                    total: v.total,
                    mistakes: v.mistakes || [],
                };
            })
            .sort((a, b) => a.accuracy - b.accuracy); // Weakest first
    } catch {
        return [];
    }
}

/**
 * Get the user's most-missed hands, sorted by error rate (descending).
 * Returns array of { hand, errorRate, wrong, total }
 */
export function getWeakestHands(minTotal = 3) {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(SPOT_WEAKNESS_KEY);
        if (!raw) return [];
        const data = JSON.parse(raw);
        if (!data.hands) return [];

        return Object.entries(data.hands)
            .filter(([, v]) => v.total >= minTotal)
            .map(([hand, v]) => ({
                hand,
                errorRate: v.total > 0 ? Math.round(v.wrong / v.total * 100) : 0,
                wrong: v.wrong,
                total: v.total,
            }))
            .sort((a, b) => b.errorRate - a.errorRate); // Most errors first
    } catch {
        return [];
    }
}

/**
 * Check if the user has a specific weakness that should influence spot selection.
 * Returns the spot type the user should practice more, or null.
 */
export function getAdaptiveSpotBias() {
    const weakest = getWeakestSpots(5);
    if (weakest.length === 0) return null;

    // If any spot has <60% accuracy with enough data, bias toward it
    const veryWeak = weakest.filter(s => s.accuracy < 60);
    if (veryWeak.length > 0) {
        // Return the weakest spot's type
        return {
            spotType: veryWeak[0].spotType,
            position: veryWeak[0].position,
            accuracy: veryWeak[0].accuracy,
        };
    }

    return null;
}
