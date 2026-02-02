/**
 * 🤖 Grok Scenario Loader
 * 
 * Client-side module for fetching Grok-generated scenarios.
 * Handles caching, fallback to static scenarios, and loading states.
 */

// API endpoint for live Grok generation
const GROK_API = '/api/gto/generate-scenario';

// Cache for generated scenarios
let scenarioCache = new Map();

/**
 * Fetch a fresh scenario from Grok API
 * @param {number} level - The level (1-10)
 * @param {Object} filters - Optional filters (position, stackDepth, format)
 * @returns {Promise<Object|null>} - The generated scenario or null on failure
 */
export async function fetchGrokScenario(level, filters = {}) {
    try {
        const response = await fetch(GROK_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level,
                position: filters.position || undefined,
                stackDepth: filters.stackDepth || undefined,
                format: filters.format || undefined,
            }),
        });

        const result = await response.json();

        if (result.success && result.scenario) {
            // Cache the scenario
            const cacheKey = `grok-${level}-${Date.now()}`;
            scenarioCache.set(cacheKey, result.scenario);

            console.log('[GrokLoader] Generated scenario:', result.scenario.title);
            return result.scenario;
        } else {
            console.error('[GrokLoader] API error:', result.error);
            return null;
        }
    } catch (error) {
        console.error('[GrokLoader] Fetch error:', error);
        return null;
    }
}

/**
 * Pre-fetch scenarios for upcoming levels
 * @param {number} currentLevel - The current level
 * @param {number} count - Number of scenarios to pre-fetch per level
 */
export async function preFetchScenarios(currentLevel, count = 2) {
    const levelsToFetch = [currentLevel, currentLevel + 1].filter(l => l <= 10);

    for (const level of levelsToFetch) {
        for (let i = 0; i < count; i++) {
            // Fire and forget - don't await
            fetchGrokScenario(level).catch(() => { });
        }
    }
}

/**
 * Get a cached scenario or fetch a new one
 * @param {number} level - The level (1-10)
 * @param {Object} filters - Optional filters
 * @returns {Promise<Object|null>} - The scenario
 */
export async function getGrokScenario(level, filters = {}) {
    // Check cache first for quick retrieval
    for (const [key, scenario] of scenarioCache.entries()) {
        if (scenario.level === level) {
            // Remove from cache (one-time use)
            scenarioCache.delete(key);
            return scenario;
        }
    }

    // No cached scenario, fetch fresh
    return fetchGrokScenario(level, filters);
}

/**
 * Clear the scenario cache
 */
export function clearCache() {
    scenarioCache.clear();
}

/**
 * Get cache stats
 */
export function getCacheStats() {
    const byLevel = {};
    for (const scenario of scenarioCache.values()) {
        byLevel[scenario.level] = (byLevel[scenario.level] || 0) + 1;
    }
    return {
        total: scenarioCache.size,
        byLevel,
    };
}

export default {
    fetchGrokScenario,
    getGrokScenario,
    preFetchScenarios,
    clearCache,
    getCacheStats,
};
