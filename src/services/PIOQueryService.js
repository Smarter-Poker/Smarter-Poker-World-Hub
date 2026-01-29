/**
 * PIO Query Service
 * ═══════════════════════════════════════════════════════════════════════════
 * Service for querying PIO solver data from Supabase
 * Integrates with the Antigravity Training Engine
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export class PIOQueryService {
    /**
     * Query PIO database for training scenarios
     * @param {string} gameId - Game identifier (e.g., 'cash-018')
     * @param {number} level - Current level (1-10)
     * @param {string} userId - User ID for tracking
     * @returns {Promise<Array|null>} PIO scenarios or null if not available
     */
    async queryScenarios(gameId, level, userId) {
        const gameConfig = this.getGameConfig(gameId);

        if (!gameConfig) {
            console.log(`[PIO] No config found for game: ${gameId}`);
            return null;
        }

        // Determine which database to query based on source of truth
        if (gameConfig.sourceOfTruth === 'PioSOLVER') {
            return await this.querySolvedSpots(gameConfig, level, userId);
        } else if (gameConfig.sourceOfTruth === 'ICMIZER') {
            return await this.queryMemoryCharts(gameConfig, level, userId);
        } else {
            // Grok-only game, no PIO data
            console.log(`[PIO] Game ${gameId} uses ${gameConfig.sourceOfTruth}, skipping PIO query`);
            return null;
        }
    }

    /**
     * Query solved_spots_gold table for postflop scenarios
     */
    async querySolvedSpots(gameConfig, level, userId) {
        try {
            const street = this.getStreetForLevel(level);

            console.log(`[PIO] Querying solved_spots_gold:`, {
                game_type: gameConfig.pioGameType,
                stack_depth: gameConfig.pioStackDepth,
                street: street
            });

            const { data, error } = await supabase
                .from('solved_spots_gold')
                .select('*')
                .eq('game_type', gameConfig.pioGameType)
                .eq('stack_depth', gameConfig.pioStackDepth)
                .eq('street', street)
                .limit(25);

            if (error) {
                console.error('[PIO] Query error:', error);
                return null;
            }

            if (!data || data.length === 0) {
                console.log('[PIO] No scenarios found for criteria');
                return null;
            }

            console.log(`[PIO] Found ${data.length} scenarios`);
            return this.transformPIOData(data);

        } catch (error) {
            console.error('[PIO] Exception in querySolvedSpots:', error);
            return null;
        }
    }

    /**
     * Query memory_charts_gold table for preflop/push-fold charts
     */
    async queryMemoryCharts(gameConfig, level, userId) {
        try {
            console.log(`[PIO] Querying memory_charts_gold for ${gameConfig.id}`);

            const { data, error } = await supabase
                .from('memory_charts_gold')
                .select('*')
                .eq('stack_depth', gameConfig.pioStackDepth)
                .limit(5);

            if (error) {
                console.error('[PIO] Chart query error:', error);
                return null;
            }

            if (!data || data.length === 0) {
                console.log('[PIO] No charts found');
                return null;
            }

            console.log(`[PIO] Found ${data.length} charts`);
            return this.transformChartData(data);

        } catch (error) {
            console.error('[PIO] Exception in queryMemoryCharts:', error);
            return null;
        }
    }

    /**
     * Transform raw PIO data into usable format
     */
    transformPIOData(rawData) {
        return rawData.map(scenario => {
            const board = this.parseBoardCards(scenario.scenario_hash);

            return {
                id: scenario.id,
                scenarioHash: scenario.scenario_hash,
                board: board,
                street: scenario.street,
                stackDepth: scenario.stack_depth,
                gameType: scenario.game_type,
                strategies: scenario.strategy_matrix,
                macroMetrics: scenario.macro_metrics,
                createdAt: scenario.created_at
            };
        });
    }

    /**
     * Transform chart data into usable format
     */
    transformChartData(rawData) {
        return rawData.map(chart => ({
            id: chart.id,
            chartName: chart.chart_name,
            category: chart.category,
            chartGrid: chart.chart_grid,
            stackDepth: chart.stack_depth,
            topology: chart.topology,
            position: chart.position
        }));
    }

    /**
     * Parse board cards from scenario hash
     * Example: "AsKs7d.csv_Cash_100bb_Flop" → ["As", "Ks", "7d"]
     */
    parseBoardCards(scenarioHash) {
        if (!scenarioHash) return [];

        // Extract board string (e.g., "AsKs7d" from "AsKs7d.csv_Cash_100bb_Flop")
        const match = scenarioHash.match(/^([A-K0-9][shdc]+)/);
        if (!match) return [];

        const boardString = match[1];
        const cards = [];

        // Parse into individual cards (2 characters each)
        for (let i = 0; i < boardString.length; i += 2) {
            if (i + 1 < boardString.length) {
                cards.push(boardString.substr(i, 2));
            }
        }

        return cards;
    }

    /**
     * Determine which street to query based on level
     * Levels 1-3: Flop
     * Levels 4-7: Turn
     * Levels 8-10: River
     */
    getStreetForLevel(level) {
        if (level <= 3) return 'Flop';
        if (level <= 7) return 'Turn';
        return 'River';
    }

    /**
     * Get game configuration for PIO queries
     */
    getGameConfig(gameId) {
        const configs = {
            // Cash Games (PioSOLVER)
            'cash-001': { id: 'cash-001', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },
            'cash-002': { id: 'cash-002', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },
            'cash-003': { id: 'cash-003', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },
            'cash-004': { id: 'cash-004', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },
            'cash-005': { id: 'cash-005', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },
            'cash-006': { id: 'cash-006', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },
            'cash-007': { id: 'cash-007', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },
            'cash-009': { id: 'cash-009', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 200 },
            'cash-012': { id: 'cash-012', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },
            'cash-014': { id: 'cash-014', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },
            'cash-015': { id: 'cash-015', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },
            'cash-016': { id: 'cash-016', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },
            'cash-018': { id: 'cash-018', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },
            'cash-022': { id: 'cash-022', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },
            'cash-023': { id: 'cash-023', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },
            'cash-024': { id: 'cash-024', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },

            // MTT Games (PioSOLVER)
            'mtt-007': { id: 'mtt-007', sourceOfTruth: 'PioSOLVER', pioGameType: 'MTT', pioStackDepth: 100 },
            'mtt-015': { id: 'mtt-015', sourceOfTruth: 'PioSOLVER', pioGameType: 'MTT', pioStackDepth: 100 },
            'mtt-018': { id: 'mtt-018', sourceOfTruth: 'PioSOLVER', pioGameType: 'MTT', pioStackDepth: 100 },
            'mtt-021': { id: 'mtt-021', sourceOfTruth: 'PioSOLVER', pioGameType: 'MTT', pioStackDepth: 100 },
            'mtt-024': { id: 'mtt-024', sourceOfTruth: 'PioSOLVER', pioGameType: 'MTT', pioStackDepth: 100 },

            // Chart Games (ICMIZER)
            'mtt-001': { id: 'mtt-001', sourceOfTruth: 'ICMIZER', pioStackDepth: 15 },
            'mtt-016': { id: 'mtt-016', sourceOfTruth: 'ICMIZER', pioStackDepth: 1 },
            'cash-010': { id: 'cash-010', sourceOfTruth: 'ICMIZER', pioStackDepth: 40 },

            // Advanced Theory (PioSOLVER)
            'adv-001': { id: 'adv-001', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },
            'adv-002': { id: 'adv-002', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },
            'adv-008': { id: 'adv-008', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },
            'adv-009': { id: 'adv-009', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },
            'adv-017': { id: 'adv-017', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },
            'adv-018': { id: 'adv-018', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },
            'adv-020': { id: 'adv-020', sourceOfTruth: 'PioSOLVER', pioGameType: 'Cash', pioStackDepth: 100 },
        };

        return configs[gameId] || null;
    }
}

// Export singleton instance
export const pioQueryService = new PIOQueryService();
