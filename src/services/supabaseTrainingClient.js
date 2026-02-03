/**
 * 🎯 Supabase Training Client — Scenario Fetcher
 * ═══════════════════════════════════════════════════════════════════
 * Fetches training scenarios from Supabase.
 * Includes caching and fail-closed error handling.
 * ═══════════════════════════════════════════════════════════════════
 */

import { supabase } from '@/src/lib/supabase';
import { validateScenarioSchema } from '@/src/utils/training/timelineMapper';

// In-memory cache for session
const scenarioCache = new Map();

/**
 * Fetch a single scenario by ID
 * @param {string} scenarioId - UUID of the scenario
 * @returns {Promise<{ success: boolean, scenario?: Object, error?: string }>}
 */
export async function fetchScenario(scenarioId) {
    // Check cache first
    if (scenarioCache.has(scenarioId)) {
        return { success: true, scenario: scenarioCache.get(scenarioId) };
    }

    try {
        const { data, error } = await supabase
            .from('training_scenarios')
            .select('*')
            .eq('id', scenarioId)
            .single();

        if (error) {
            console.error('[TrainingClient] Supabase error:', error);
            return { success: false, error: `Database error: ${error.message}` };
        }

        if (!data) {
            return { success: false, error: `Scenario ${scenarioId} not found` };
        }

        // Validate schema (fail-closed)
        const validation = validateScenarioSchema(data);
        if (!validation.valid) {
            console.error('[TrainingClient] Schema validation failed:', validation.errors);
            return {
                success: false,
                error: `Invalid scenario data: ${validation.errors.join(', ')}`
            };
        }

        // Increment use count (fire and forget)
        supabase
            .from('training_scenarios')
            .update({ use_count: (data.use_count || 0) + 1 })
            .eq('id', scenarioId)
            .then(() => { });

        // Cache and return
        scenarioCache.set(scenarioId, validation.sanitized);
        return { success: true, scenario: validation.sanitized };

    } catch (err) {
        console.error('[TrainingClient] Unexpected error:', err);
        return { success: false, error: `Unexpected error: ${err.message}` };
    }
}

/**
 * Fetch a random scenario for a specific game
 * @param {string} gameId - Game identifier (e.g., 'cash_001')
 * @returns {Promise<{ success: boolean, scenario?: Object, error?: string }>}
 */
export async function fetchRandomScenarioForGame(gameId) {
    try {
        // Get count first
        const { count, error: countError } = await supabase
            .from('training_scenarios')
            .select('*', { count: 'exact', head: true })
            .eq('game_id', gameId);

        if (countError || count === 0) {
            return {
                success: false,
                error: `No scenarios found for game ${gameId}`
            };
        }

        // Fetch random one
        const randomOffset = Math.floor(Math.random() * count);
        const { data, error } = await supabase
            .from('training_scenarios')
            .select('*')
            .eq('game_id', gameId)
            .range(randomOffset, randomOffset)
            .single();

        if (error || !data) {
            return { success: false, error: 'Failed to fetch random scenario' };
        }

        const validation = validateScenarioSchema(data);
        if (!validation.valid) {
            return {
                success: false,
                error: `Invalid scenario: ${validation.errors.join(', ')}`
            };
        }

        scenarioCache.set(data.id, validation.sanitized);
        return { success: true, scenario: validation.sanitized };

    } catch (err) {
        console.error('[TrainingClient] Error fetching random scenario:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Fetch all cached scenarios (for preloading)
 * @param {string} gameId - Optional game filter
 * @param {number} limit - Max scenarios to fetch
 * @returns {Promise<{ success: boolean, scenarios?: Object[], error?: string }>}
 */
export async function fetchCachedScenarios(gameId = null, limit = 10) {
    try {
        let query = supabase
            .from('training_scenarios')
            .select('*')
            .eq('cached', true)
            .order('use_count', { ascending: false })
            .limit(limit);

        if (gameId) {
            query = query.eq('game_id', gameId);
        }

        const { data, error } = await query;

        if (error) {
            return { success: false, error: error.message };
        }

        const validScenarios = [];
        for (const scenario of data || []) {
            const validation = validateScenarioSchema(scenario);
            if (validation.valid) {
                scenarioCache.set(scenario.id, validation.sanitized);
                validScenarios.push(validation.sanitized);
            }
        }

        return { success: true, scenarios: validScenarios };

    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Clear the in-memory cache
 */
export function clearCache() {
    scenarioCache.clear();
}

/**
 * Get cache stats
 */
export function getCacheStats() {
    return {
        size: scenarioCache.size,
        ids: Array.from(scenarioCache.keys()),
    };
}

export default {
    fetchScenario,
    fetchRandomScenarioForGame,
    fetchCachedScenarios,
    clearCache,
    getCacheStats,
};
