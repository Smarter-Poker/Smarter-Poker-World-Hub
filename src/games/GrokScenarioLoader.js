/**
 * 🎯 Deterministic Scenario Loader (Operation Grok-Sweep — 2026-05)
 * ═══════════════════════════════════════════════════════════════════════════
 * Client-side module for fetching Memory-Matrix preflop training scenarios.
 * Despite the legacy filename (kept for backward-compat with imports), this
 * module no longer talks to Grok. The /api/gto/generate-scenario endpoint
 * is now backed by real solver-derived range tables in
 * src/config/solverRanges.js — same shape, same exports, NO LLM hallucinations.
 *
 * Public API kept identical:
 *   • fetchGrokScenario(level, filters) — name kept; pulls deterministic
 *   • getGrokScenario(level, filters)
 *   • preFetchScenarios(currentLevel, count)
 *   • clearCache()
 *   • getCacheStats()
 *
 * Optional new alias: fetchScenario / getScenario (recommended for new code).
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SCENARIO_API = '/api/gto/generate-scenario';

// Cache for fetched scenarios
let scenarioCache = new Map();

/**
 * Fetch a fresh scenario from the deterministic solver-range API.
 * @param {number} level - The level (1-10)
 * @param {Object} filters - Optional filters (position, stackDepth, format, scenarioType)
 * @returns {Promise<Object|null>} - The scenario or null on failure
 */
export async function fetchScenario(level, filters = {}) {
    try {
        const response = await fetch(SCENARIO_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level,
                position: filters.position || undefined,
                stackDepth: filters.stackDepth || undefined,
                format: filters.format || undefined,
                scenarioType: filters.scenarioType || undefined,
            }),
        });

        const result = await response.json();

        if (result.success && result.scenario) {
            // Cache the scenario for one-shot retrieval
            const cacheKey = `det-${level}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            scenarioCache.set(cacheKey, result.scenario);
            console.debug('[ScenarioLoader] Fetched scenario:', result.scenario.title);
            return result.scenario;
        }

        console.warn('[ScenarioLoader] API error:', result.error);
        return null;
    } catch (error) {
        console.warn('[ScenarioLoader] Fetch error:', error);
        return null;
    }
}

// Legacy alias — same behavior, kept so existing imports keep working.
export const fetchGrokScenario = fetchScenario;

/**
 * Pre-fetch scenarios for upcoming levels (fire-and-forget).
 */
export async function preFetchScenarios(currentLevel, count = 2) {
    const levelsToFetch = [currentLevel, currentLevel + 1].filter(l => l <= 10);
    for (const level of levelsToFetch) {
        for (let i = 0; i < count; i++) {
            fetchScenario(level).catch(e =>
                console.warn('[ScenarioLoader] Pre-fetch failed:', e?.message || e));
        }
    }
}

/**
 * Get a cached scenario or fetch a new one.
 */
export async function getScenario(level, filters = {}) {
    for (const [key, scenario] of scenarioCache.entries()) {
        if (scenario.level === level) {
            scenarioCache.delete(key); // one-time use
            return scenario;
        }
    }
    return fetchScenario(level, filters);
}

// Legacy alias
export const getGrokScenario = getScenario;

/**
 * Clear the scenario cache.
 */
export function clearCache() {
    scenarioCache.clear();
}

/**
 * Get cache stats.
 */
export function getCacheStats() {
    const byLevel = {};
    for (const scenario of scenarioCache.values()) {
        byLevel[scenario.level] = (byLevel[scenario.level] || 0) + 1;
    }
    return { total: scenarioCache.size, byLevel };
}

export default {
    fetchScenario,
    fetchGrokScenario,
    getScenario,
    getGrokScenario,
    preFetchScenarios,
    clearCache,
    getCacheStats,
};
