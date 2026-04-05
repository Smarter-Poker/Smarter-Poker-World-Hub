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
