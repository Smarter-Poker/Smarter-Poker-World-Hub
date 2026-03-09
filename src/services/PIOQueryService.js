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
     * Now includes hand_evs for real EV loss computation
     */
    transformPIOData(rawData) {
        return rawData.map(scenario => {
            const board = this.parseBoardCards(scenario.scenario_hash);
            const strategies = scenario.strategy_matrix || {};

            return {
                id: scenario.id,
                scenarioHash: scenario.scenario_hash,
                board: board,
                street: scenario.street,
                stackDepth: scenario.stack_depth,
                gameType: scenario.game_type,
                strategies: strategies,
                handEVs: strategies.hand_evs || {},
                macroMetrics: scenario.macro_metrics,
                createdAt: scenario.created_at
            };
        });
    }

    /**
     * Get GTO frequencies for a specific hand across all actions
     * @param {Object} strategyMatrix - The strategy_matrix from solved_spots_gold
     * @param {string} hand - Hand notation (e.g., 'AKs', 'AA')
     * @returns {Object} { actionId: frequencyPercent } (0-100 scale)
     */
    getFrequenciesForHand(strategyMatrix, hand) {
        const actions = strategyMatrix?.actions || [];
        const frequencies = strategyMatrix?.frequencies || {};
        const result = {};

        actions.forEach(action => {
            const freq = frequencies[action]?.[hand];
            if (freq !== undefined && freq >= 0 && freq <= 1) {
                result[action] = Math.round(freq * 100);
            }
        });

        return result;
    }

    /**
     * Get EV for a specific hand
     * @param {Object} strategyMatrix - The strategy_matrix from solved_spots_gold
     * @param {string} hand - Hand notation (e.g., 'AKs', 'AA')
     * @returns {number} EV in normalized units (0.0-1.0 scale from solver)
     */
    getEVForHand(strategyMatrix, hand) {
        const handEVs = strategyMatrix?.hand_evs || {};
        return handEVs[hand] || 0;
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
     * ACTUAL Format: "hu_cash_BTN_100bb_3h7c7s" → ["3h", "7c", "7s"]
     * Board is at the END of the scenario_hash after the last underscore
     */
    parseBoardCards(scenarioHash) {
        if (!scenarioHash) return [];

        // Extract board string from end (e.g., "3h7c7s" from "hu_cash_BTN_100bb_3h7c7s")
        const parts = scenarioHash.split('_');
        const boardString = parts[parts.length - 1]; // Get last part after underscore

        if (!boardString || boardString.length < 4) return [];

        const cards = [];

        // Parse into individual cards (2 characters each: rank + suit)
        // Board string format: "3h7c7s" = 3h, 7c, 7s (flop)
        // Or "3h7c7s9d" = 3h, 7c, 7s, 9d (turn)
        for (let i = 0; i < boardString.length; i += 2) {
            if (i + 1 < boardString.length) {
                const card = boardString.substr(i, 2);
                // Validate it looks like a card (rank + suit)
                if (/^[2-9TJQKA][shdc]$/i.test(card)) {
                    cards.push(card);
                }
            }
        }

        return cards;
    }

    /**
     * Determine which street to query based on level
     * Levels 1-3: Flop
     * Levels 4-7: Turn
     * Levels 8-10: River
     * NOTE: Database uses lowercase street names
     */
    getStreetForLevel(level) {
        if (level <= 3) return 'flop';
        if (level <= 7) return 'turn';
        return 'river';
    }

    /**
     * Get game configuration for PIO queries
     * ACTUAL DATABASE VALUES (Feb 2026):
     * - hu_cash: HU flop spots (stack_depth: 20, 40, 60, 80, 100, 200)
     * - postflop_complete: Turn/River (stack_depth: 100)
     * - river_mtt_chipev: MTT river ChipEV (stack_depth: 10, 20, 40, 80, 100)
     * - river_mtt_icm: MTT river ICM (stack_depth: 10, 20, 40, 60, 80, 100)
     * - turn_mtt_icm: MTT turn ICM (stack_depth: 10, 20, 40, 60, 80, 100)
     * - turn_spin: Spin & Go turn (stack_depth: 10, 20, 40, 60)
     */
    getGameConfig(gameId) {
        const configs = {
            // ═══════════════════════════════════════════════════════════════
            // CASH GAMES (25) - Use hu_cash for flop training
            // ═══════════════════════════════════════════════════════════════
            'cash-001': { id: 'cash-001', sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 }, // Preflop Mastery
            'cash-002': { id: 'cash-002', sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 }, // C-Bet Clinic
            'cash-003': { id: 'cash-003', sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 }, // Barrel Strategy
            'cash-004': { id: 'cash-004', sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 }, // Value Extraction
            'cash-005': { id: 'cash-005', sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 }, // Bluff Catcher
            'cash-006': { id: 'cash-006', sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 }, // Position Power
            'cash-007': { id: 'cash-007', sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 }, // 3-Bet Pots
            'cash-008': { id: 'cash-008', sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 }, // 4-Bet Battles
            'cash-009': { id: 'cash-009', sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 200 }, // Deep Stack
            'cash-010': { id: 'cash-010', sourceOfTruth: 'ICMIZER', pioStackDepth: 40 }, // Short Stack (CHART)
            'cash-011': { id: 'cash-011', sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 }, // Donk Defense
            'cash-012': { id: 'cash-012', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // River Decisions
            'cash-013': { id: 'cash-013', sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 }, // Check-Raise
            'cash-014': { id: 'cash-014', sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 }, // Squeeze Play
            'cash-015': { id: 'cash-015', sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 }, // Overbetting
            'cash-016': { id: 'cash-016', sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 }, // Multi-way Pots
            'cash-017': { id: 'cash-017', sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 }, // Probe Bets
            'cash-018': { id: 'cash-018', sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 }, // Blind vs Blind
            'cash-019': { id: 'cash-019', sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 }, // Thin Value
            'cash-020': { id: 'cash-020', sourceOfTruth: 'SCENARIO' }, // Table Selection (Mental)
            'cash-021': { id: 'cash-021', sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 }, // Mixed Strategies
            'cash-022': { id: 'cash-022', sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 }, // Texture Reading
            'cash-023': { id: 'cash-023', sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 }, // Equity Denial
            'cash-024': { id: 'cash-024', sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 }, // Pot Control
            'cash-025': { id: 'cash-025', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // Cash King

            // ═══════════════════════════════════════════════════════════════
            // MTT GAMES (25) - Use mtt_6max_icm/mtt_9max_icm/mtt_6max_chipev for tournament training
            // FIXED: Now using actual database game_types (was river_mtt_icm/turn_mtt_icm with only 100-200 records)
            // ═══════════════════════════════════════════════════════════════
            'mtt-001': { id: 'mtt-001', sourceOfTruth: 'ICMIZER', pioStackDepth: 10 }, // Push/Fold (CHART)
            'mtt-002': { id: 'mtt-002', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_icm', pioStackDepth: 20 }, // ICM Pressure
            'mtt-003': { id: 'mtt-003', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_icm', pioStackDepth: 40 }, // Bubble Play
            'mtt-004': { id: 'mtt-004', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_icm', pioStackDepth: 60 }, // Final Table
            'mtt-005': { id: 'mtt-005', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_icm', pioStackDepth: 40 }, // PKO Game
            'mtt-006': { id: 'mtt-006', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_icm', pioStackDepth: 20 }, // Satellite
            'mtt-007': { id: 'mtt-007', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_chipev', pioStackDepth: 100 }, // Deep Stack MTT
            'mtt-008': { id: 'mtt-008', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_chipev', pioStackDepth: 10 }, // Short Stack
            'mtt-009': { id: 'mtt-009', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_chipev', pioStackDepth: 20 }, // Resteal
            'mtt-010': { id: 'mtt-010', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_chipev', pioStackDepth: 40 }, // Ante Play
            'mtt-011': { id: 'mtt-011', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_icm', pioStackDepth: 60 }, // Pay Jump
            'mtt-012': { id: 'mtt-012', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_chipev', pioStackDepth: 80 }, // Big-Blind Defense
            'mtt-013': { id: 'mtt-013', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_icm', pioStackDepth: 40 }, // Chipleader
            'mtt-014': { id: 'mtt-014', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_3max_chipev', pioStackDepth: 20 }, // 3-Max Blitz
            'mtt-015': { id: 'mtt-015', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_hu_chipev', pioStackDepth: 40 }, // Heads Up Duel
            'mtt-016': { id: 'mtt-016', sourceOfTruth: 'ICMIZER', pioStackDepth: 10 }, // Chip & Chair (CHART)
            'mtt-017': { id: 'mtt-017', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_chipev', pioStackDepth: 20 }, // BB Defense
            'mtt-018': { id: 'mtt-018', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_chipev', pioStackDepth: 40 }, // BTN Warfare
            'mtt-019': { id: 'mtt-019', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_icm', pioStackDepth: 60 }, // Middle Stack
            'mtt-020': { id: 'mtt-020', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_chipev', pioStackDepth: 80 }, // Late Reg
            'mtt-021': { id: 'mtt-021', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_chipev', pioStackDepth: 100 }, // All-In EV
            'mtt-022': { id: 'mtt-022', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_icm', pioStackDepth: 40 }, // Multi-Entry
            'mtt-023': { id: 'mtt-023', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_icm', pioStackDepth: 60 }, // Day 2 Play
            'mtt-024': { id: 'mtt-024', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_chipev', pioStackDepth: 80 }, // Triple Barrel
            'mtt-025': { id: 'mtt-025', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_chipev', pioStackDepth: 100 }, // MTT Champion

            // ═══════════════════════════════════════════════════════════════
            // SPINS (10) - Use spin_3max_chipev/spin_3max_icm/spin_hu_chipev for Spin & Go training
            // FIXED: Now using actual database game_types (was turn_spin with only 52 records)
            // ═══════════════════════════════════════════════════════════════
            'spins-001': { id: 'spins-001', sourceOfTruth: 'PioSOLVER', pioGameType: 'spin_3max_chipev', pioStackDepth: 20 }, // Standard Play
            'spins-002': { id: 'spins-002', sourceOfTruth: 'PioSOLVER', pioGameType: 'spin_3max_icm', pioStackDepth: 20 }, // Jackpot Tactics
            'spins-003': { id: 'spins-003', sourceOfTruth: 'PioSOLVER', pioGameType: 'spin_3max_chipev', pioStackDepth: 20 }, // Button Limp
            'spins-004': { id: 'spins-004', sourceOfTruth: 'PioSOLVER', pioGameType: 'spin_hu_chipev', pioStackDepth: 10 }, // SNG Endgame
            'spins-005': { id: 'spins-005', sourceOfTruth: 'PioSOLVER', pioGameType: 'spin_3max_chipev', pioStackDepth: 25 }, // Phase Shifting
            'spins-006': { id: 'spins-006', sourceOfTruth: 'PioSOLVER', pioGameType: 'spin_3max_icm', pioStackDepth: 20 }, // Limp Trap
            'spins-007': { id: 'spins-007', sourceOfTruth: 'PioSOLVER', pioGameType: 'spin_hu_icm', pioStackDepth: 10 }, // All-In Spots
            'spins-008': { id: 'spins-008', sourceOfTruth: 'PioSOLVER', pioGameType: 'spin_hu_chipev', pioStackDepth: 20 }, // Stop & Go
            'spins-009': { id: 'spins-009', sourceOfTruth: 'PioSOLVER', pioGameType: 'spin_3max_icm', pioStackDepth: 25 }, // Multiplier Hunt
            'spins-010': { id: 'spins-010', sourceOfTruth: 'PioSOLVER', pioGameType: 'spin_3max_chipev', pioStackDepth: 25 }, // Spin Master

            // ═══════════════════════════════════════════════════════════════
            // PSYCHOLOGY (20) - Use SCENARIO engine (Grok AI)
            // ═══════════════════════════════════════════════════════════════
            'psy-001': { id: 'psy-001', sourceOfTruth: 'SCENARIO' }, // Tilt Control
            'psy-002': { id: 'psy-002', sourceOfTruth: 'SCENARIO' }, // Timing Discipline
            'psy-003': { id: 'psy-003', sourceOfTruth: 'SCENARIO' }, // Bankroll Mentality
            'psy-004': { id: 'psy-004', sourceOfTruth: 'SCENARIO' }, // Focus Drills
            'psy-005': { id: 'psy-005', sourceOfTruth: 'SCENARIO' }, // Loss Recovery
            'psy-006': { id: 'psy-006', sourceOfTruth: 'SCENARIO' }, // Win Management
            'psy-007': { id: 'psy-007', sourceOfTruth: 'SCENARIO' }, // Variance Control
            'psy-008': { id: 'psy-008', sourceOfTruth: 'SCENARIO' }, // Fear Control
            'psy-009': { id: 'psy-009', sourceOfTruth: 'SCENARIO' }, // Confidence Builder
            'psy-010': { id: 'psy-010', sourceOfTruth: 'SCENARIO' }, // Ego Check
            'psy-011': { id: 'psy-011', sourceOfTruth: 'SCENARIO' }, // Session Stamina
            'psy-012': { id: 'psy-012', sourceOfTruth: 'SCENARIO' }, // Snap Decision
            'psy-013': { id: 'psy-013', sourceOfTruth: 'SCENARIO' }, // Pattern Recognition
            'psy-014': { id: 'psy-014', sourceOfTruth: 'SCENARIO' }, // Showdown Mental
            'psy-015': { id: 'psy-015', sourceOfTruth: 'SCENARIO' }, // Bad Beat Immunity
            'psy-016': { id: 'psy-016', sourceOfTruth: 'SCENARIO' }, // Cooler Survival
            'psy-017': { id: 'psy-017', sourceOfTruth: 'SCENARIO' }, // Opponent Reads
            'psy-018': { id: 'psy-018', sourceOfTruth: 'SCENARIO' }, // Table Dynamics
            'psy-019': { id: 'psy-019', sourceOfTruth: 'SCENARIO' }, // Mindfulness
            'psy-020': { id: 'psy-020', sourceOfTruth: 'SCENARIO' }, // Mind Master

            // ═══════════════════════════════════════════════════════════════
            // ADVANCED (20) - Use postflop_complete for advanced theory
            // ═══════════════════════════════════════════════════════════════
            'adv-001': { id: 'adv-001', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // Solver Basics
            'adv-002': { id: 'adv-002', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // Range Construction
            'adv-003': { id: 'adv-003', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // Node Locking
            'adv-004': { id: 'adv-004', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // Bet Sizing
            'adv-005': { id: 'adv-005', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // Frequency Play
            'adv-006': { id: 'adv-006', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // EV Calculations
            'adv-007': { id: 'adv-007', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // Indifference Theory
            'adv-008': { id: 'adv-008', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // Range Advantage
            'adv-009': { id: 'adv-009', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // Nut Advantage
            'adv-010': { id: 'adv-010', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // Board Coverage
            'adv-011': { id: 'adv-011', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // SPR Mastery
            'adv-012': { id: 'adv-012', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // Polarization
            'adv-013': { id: 'adv-013', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // Linear Ranges
            'adv-014': { id: 'adv-014', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // Equity Realization
            'adv-015': { id: 'adv-015', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // Population Reads
            'adv-016': { id: 'adv-016', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // Exploit Ladder
            'adv-017': { id: 'adv-017', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // MDF Theory
            'adv-018': { id: 'adv-018', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // Alpha Bluffs
            'adv-019': { id: 'adv-019', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // Solver Scripts
            'adv-020': { id: 'adv-020', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // GTO Apex

            // ═══════════════════════════════════════════════════════════════
            // SPECIAL GAMES (Additional games in TRAINING_LIBRARY)
            // ═══════════════════════════════════════════════════════════════
            'tournament-prep': { id: 'tournament-prep', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_icm', pioStackDepth: 40 }, // ICM Structure Planner
            'final-table-sim': { id: 'final-table-sim', sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_icm', pioStackDepth: 60 }, // ICM $Equity Analysis
            'quiz-gauntlet': { id: 'quiz-gauntlet', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // High-speed GTO blitz
            'hand-lab': { id: 'hand-lab', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // Interactive Equity Builder
            'bluff-catcher': { id: 'bluff-catcher', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // MDF & Hand Reading
            'mixed-strategy-lab': { id: 'mixed-strategy-lab', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // Frequency EV Visualizer
            'study-group': { id: 'study-group', sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 }, // Collaborative Hand Review
        };

        return configs[gameId] || null;
    }
}

// Export singleton instance
export const pioQueryService = new PIOQueryService();
