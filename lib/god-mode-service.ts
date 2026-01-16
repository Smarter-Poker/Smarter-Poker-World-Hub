/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GOD MODE SERVICE - GTO Strategy Query Layer
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Connects training games to the solved_spots_gold table.
 * Provides real-time GTO strategy lookups for all 1,326 hands.
 * 
 * @version 1.0.0
 * @author Antigravity AI
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface GTOAction {
    ev: number;
    freq: number;
    ev_loss: number;
    size?: string; // For raises: "66%", "75%", "3bb", etc.
}

export interface GTOHandStrategy {
    best_action: string; // "Fold", "Call", "Raise", or "Mixed"
    max_ev: number;
    ev_loss: number;
    actions: {
        Fold: GTOAction;
        Call: GTOAction;
        Raise: GTOAction;
    };
    is_mixed: boolean;
}

export interface GTOStrategyMatrix {
    [hand: string]: GTOHandStrategy; // e.g., "AhKd": {...}
}

export interface GTOMacroMetrics {
    hero_range_adv?: number;
    villain_range_adv?: number;
    total_hero_ev?: number;
    total_villain_ev?: number;
    avg_hero_ev?: number;
    hand_count?: number;
    spr?: number;
    nut_adv?: number;
    board_texture?: string;
    pot_size?: number;
}

export interface GTOScenario {
    id: string;
    scenario_hash: string;
    street: 'Flop' | 'Turn' | 'River';
    stack_depth: number;
    game_type: 'Cash' | 'MTT' | 'Spin';
    topology: 'HU' | '3-Max' | '6-Max' | '9-Max';
    mode: 'ChipEV' | 'ICM' | 'PKO';
    board_cards: string[];
    macro_metrics: GTOMacroMetrics;
    strategy_matrix: GTOStrategyMatrix;
    created_at?: string;
    updated_at?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT
// ═══════════════════════════════════════════════════════════════════════════

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Supabase credentials not configured for God Mode service');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize board cards to consistent format.
 * @param cards - Array of card strings (e.g., ["As", "Kd", "2h"])
 * @returns Normalized card array
 */
function normalizeBoardCards(cards: string[]): string[] {
    return cards.map(card => {
        // Ensure format: RankSuit (e.g., "As", "Kd")
        const rank = card[0].toUpperCase();
        const suit = card[1].toLowerCase();
        return rank + suit;
    });
}

/**
 * Generate scenario hash for database lookup.
 * Format: "AsKd2h_BTN_vs_BB_40bb_Cash_ChipEV_Flop"
 * 
 * @param params - Scenario parameters
 * @returns Scenario hash string
 */
function generateScenarioHash(params: {
    boardCards: string[];
    position?: string;
    stackDepth: number;
    gameType: 'Cash' | 'MTT' | 'Spin';
    mode: 'ChipEV' | 'ICM' | 'PKO';
    street: 'Flop' | 'Turn' | 'River';
}): string {
    const {
        boardCards,
        position = 'BTN_vs_BB', // Default position
        stackDepth,
        gameType,
        mode,
        street
    } = params;

    // Normalize and join board cards
    const boardStr = normalizeBoardCards(boardCards).join('');

    // Construct hash
    return `${boardStr}_${position}_${stackDepth}bb_${gameType}_${mode}_${street}`;
}

/**
 * Detect street from board card count.
 * @param boardCards - Array of board cards
 * @returns Street name
 */
function detectStreet(boardCards: string[]): 'Flop' | 'Turn' | 'River' {
    const count = boardCards.length;
    if (count === 3) return 'Flop';
    if (count === 4) return 'Turn';
    if (count === 5) return 'River';
    throw new Error(`Invalid board card count: ${count}. Expected 3, 4, or 5.`);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get GTO strategy for a specific scenario.
 * 
 * @param params - Scenario parameters
 * @returns GTO strategy matrix or null if not found
 * 
 * @example
 * ```typescript
 * const strategy = await getGTOStrategy({
 *   gameType: 'MTT',
 *   stackDepth: 40,
 *   street: 'Turn',
 *   boardCards: ['As', 'Ks', '2d', '3c'],
 *   mode: 'ICM',
 *   position: 'BTN_vs_BB'
 * });
 * 
 * if (strategy) {
 *   const akAction = strategy.strategy_matrix['AhKd'];
 *   console.log('Best action for AhKd:', akAction.best_action);
 *   console.log('EV:', akAction.max_ev);
 * }
 * ```
 */
export async function getGTOStrategy(params: {
    gameType: 'Cash' | 'MTT' | 'Spin';
    stackDepth: number;
    street?: 'Flop' | 'Turn' | 'River'; // Optional - auto-detected from board
    boardCards: string[];
    mode?: 'ChipEV' | 'ICM' | 'PKO';
    topology?: 'HU' | '3-Max' | '6-Max' | '9-Max';
    position?: string;
}): Promise<GTOScenario | null> {
    try {
        // Auto-detect street if not provided
        const street = params.street || detectStreet(params.boardCards);

        // Default mode based on game type
        const mode = params.mode || (params.gameType === 'Cash' ? 'ChipEV' : 'ICM');

        // Default topology
        const topology = params.topology || 'HU';

        // Generate scenario hash
        const scenarioHash = generateScenarioHash({
            boardCards: params.boardCards,
            position: params.position,
            stackDepth: params.stackDepth,
            gameType: params.gameType,
            mode,
            street
        });

        console.log(`🔍 Querying God Mode: ${scenarioHash}`);

        // Query database
        const { data, error } = await supabase
            .from('solved_spots_gold')
            .select('*')
            .eq('scenario_hash', scenarioHash)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No rows returned - scenario not in database
                console.warn(`⚠️ Scenario not found: ${scenarioHash}`);
                return null;
            }
            console.error('❌ God Mode query error:', error);
            return null;
        }

        if (!data) {
            console.warn(`⚠️ No data for scenario: ${scenarioHash}`);
            return null;
        }

        console.log(`✅ God Mode hit: ${scenarioHash} (${data.macro_metrics?.hand_count || 0} hands)`);

        return data as GTOScenario;

    } catch (err) {
        console.error('❌ getGTOStrategy error:', err);
        return null;
    }
}

/**
 * Get GTO action for a specific hand in a scenario.
 * 
 * @param params - Scenario and hand parameters
 * @returns GTO hand strategy or null if not found
 * 
 * @example
 * ```typescript
 * const action = await getGTOActionForHand({
 *   gameType: 'MTT',
 *   stackDepth: 40,
 *   boardCards: ['As', 'Ks', '2d', '3c'],
 *   heroHand: ['Ah', 'Kd'],
 *   mode: 'ICM'
 * });
 * 
 * if (action) {
 *   console.log('Best action:', action.best_action);
 *   console.log('EV loss if you fold:', action.actions.Fold.ev_loss);
 * }
 * ```
 */
export async function getGTOActionForHand(params: {
    gameType: 'Cash' | 'MTT' | 'Spin';
    stackDepth: number;
    boardCards: string[];
    heroHand: string[]; // e.g., ['Ah', 'Kd']
    mode?: 'ChipEV' | 'ICM' | 'PKO';
    street?: 'Flop' | 'Turn' | 'River';
    position?: string;
    topology?: 'HU' | '3-Max' | '6-Max' | '9-Max';
}): Promise<GTOHandStrategy | null> {
    // Get full scenario
    const scenario = await getGTOStrategy(params);

    if (!scenario) {
        return null;
    }

    // Convert hand to lookup key (e.g., "AhKd")
    const handKey = params.heroHand.join('');

    // Lookup hand in strategy matrix
    const handStrategy = scenario.strategy_matrix[handKey];

    if (!handStrategy) {
        console.warn(`⚠️ Hand ${handKey} not found in strategy matrix`);
        return null;
    }

    return handStrategy;
}

/**
 * Check if God Mode data exists for a specific scenario.
 * Fast check without fetching full strategy matrix.
 * 
 * @param params - Scenario parameters
 * @returns True if scenario exists in database
 */
export async function hasGTODataForScenario(params: {
    gameType: 'Cash' | 'MTT' | 'Spin';
    stackDepth: number;
    boardCards: string[];
    mode?: 'ChipEV' | 'ICM' | 'PKO';
    street?: 'Flop' | 'Turn' | 'River';
    position?: string;
}): Promise<boolean> {
    try {
        const street = params.street || detectStreet(params.boardCards);
        const mode = params.mode || (params.gameType === 'Cash' ? 'ChipEV' : 'ICM');

        const scenarioHash = generateScenarioHash({
            boardCards: params.boardCards,
            position: params.position,
            stackDepth: params.stackDepth,
            gameType: params.gameType,
            mode,
            street
        });

        const { data, error } = await supabase
            .from('solved_spots_gold')
            .select('id')
            .eq('scenario_hash', scenarioHash)
            .single();

        return !error && !!data;

    } catch {
        return false;
    }
}

/**
 * Get total count of scenarios in God Mode database.
 * @returns Total scenario count
 */
export async function getGTOScenarioCount(): Promise<number> {
    try {
        const { count, error } = await supabase
            .from('solved_spots_gold')
            .select('id', { count: 'exact', head: true });

        if (error) {
            console.error('Error counting scenarios:', error);
            return 0;
        }

        return count || 0;

    } catch (err) {
        console.error('Error in getGTOScenarioCount:', err);
        return 0;
    }
}

/**
 * Get macro metrics for a scenario (range advantage, SPR, etc.)
 * @param params - Scenario parameters
 * @returns Macro metrics or null
 */
export async function getScenarioMetrics(params: {
    gameType: 'Cash' | 'MTT' | 'Spin';
    stackDepth: number;
    boardCards: string[];
    mode?: 'ChipEV' | 'ICM' | 'PKO';
    street?: 'Flop' | 'Turn' | 'River';
    position?: string;
}): Promise<GTOMacroMetrics | null> {
    const scenario = await getGTOStrategy(params);
    return scenario?.macro_metrics || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUIZ GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

export interface LevelQuizQuestion extends GTOScenario {
    is_review: boolean; // True if question is a repeat
    question_number: number; // 1-20
}

export interface LevelQuiz {
    level_id: number;
    level_name: string;
    questions: LevelQuizQuestion[];
    total_questions: number;
    fresh_questions: number;
    review_questions: number;
    is_review_mode: boolean; // True if any questions are repeats
}

/**
 * Generate a complete quiz for a training level.
 * 
 * Algorithm:
 * 1. Fetch level recipe from training_levels
 * 2. Query solved_spots_gold for matching scenarios
 * 3. Exclude scenarios user has already seen
 * 4. If < 20 fresh questions, fill remainder with repeats (review mode)
 * 5. Return 20 questions with full GTO data
 * 
 * @param userId - User ID
 * @param levelId - Level ID
 * @returns Complete quiz with 20 questions
 * 
 * @example
 * ```typescript
 * const quiz = await generateLevelQuiz('user-123', 1);
 * 
 * console.log('Level:', quiz.level_name);
 * console.log('Fresh questions:', quiz.fresh_questions);
 * console.log('Review questions:', quiz.review_questions);
 * 
 * quiz.questions.forEach((q, i) => {
 *   console.log(`Q${i + 1}: ${q.board_cards.join(' ')} ${q.is_review ? '(REVIEW)' : ''}`);
 * });
 * ```
 */
export async function generateLevelQuiz(
    userId: string,
    levelId: number
): Promise<LevelQuiz | null> {
    try {
        console.log(`🎯 Generating quiz for Level ${levelId}, User: ${userId}`);

        // ─────────────────────────────────────────────────────────────────────
        // STEP 1: Fetch Level Recipe
        // ─────────────────────────────────────────────────────────────────────

        const { data: level, error: levelError } = await supabase
            .from('training_levels')
            .select('*')
            .eq('level_id', levelId)
            .single();

        if (levelError || !level) {
            console.error(`❌ Level ${levelId} not found:`, levelError);
            return null;
        }

        console.log(`📖 Level Recipe: ${level.level_name}`);
        console.log(`   Game: ${level.game_mode}, Street: ${level.street_filter}, Stacks: ${level.stack_filter}`);

        const questionCount = level.questions_per_round || 20;

        // ─────────────────────────────────────────────────────────────────────
        // STEP 2: Get User's Question History (scenarios to exclude)
        // ─────────────────────────────────────────────────────────────────────

        const { data: history, error: historyError } = await supabase
            .from('user_question_history')
            .select('scenario_hash')
            .eq('user_id', userId);

        if (historyError) {
            console.error('Error fetching user history:', historyError);
        }

        const seenHashes = new Set(history?.map(h => h.scenario_hash) || []);
        console.log(`📚 User has seen ${seenHashes.size} scenarios total`);

        // ─────────────────────────────────────────────────────────────────────
        // STEP 3: Query Fresh Questions (exclude seen)
        // ─────────────────────────────────────────────────────────────────────

        let query = supabase
            .from('solved_spots_gold')
            .select('*')
            .eq('game_type', level.game_mode);

        // Apply street filter
        if (level.street_filter && level.street_filter !== 'All') {
            query = query.eq('street', level.street_filter);
        }

        // Apply stack filter
        if (level.stack_filter && level.stack_filter.length > 0) {
            query = query.in('stack_depth', level.stack_filter);
        }

        // Apply difficulty filter (Easy = pure strategies only)
        // Note: This would require checking strategy_matrix in application code
        // For now, we'll fetch all and filter client-side if needed

        const { data: allMatches, error: queryError } = await query;

        if (queryError) {
            console.error('Error querying scenarios:', queryError);
            return null;
        }

        console.log(`🎲 Found ${allMatches?.length || 0} total matching scenarios`);

        if (!allMatches || allMatches.length === 0) {
            console.warn('⚠️ No scenarios match this level criteria');
            return null;
        }

        // Filter by difficulty (client-side)
        let filteredScenarios = allMatches;
        if (level.difficulty_rating === 'Easy') {
            // Only include scenarios with pure strategies (no mixed)
            filteredScenarios = allMatches.filter(scenario => {
                const matrix = scenario.strategy_matrix as GTOStrategyMatrix;
                // Check if any hand has is_mixed = true
                const hasMixed = Object.values(matrix).some(hand => hand.is_mixed);
                return !hasMixed;
            });
            console.log(`🎯 Filtered to ${filteredScenarios.length} pure-strategy scenarios`);
        }

        // Separate fresh vs seen
        const freshScenarios = filteredScenarios.filter(
            s => !seenHashes.has(s.scenario_hash)
        );
        const seenScenarios = filteredScenarios.filter(
            s => seenHashes.has(s.scenario_hash)
        );

        console.log(`✨ Fresh scenarios available: ${freshScenarios.length}`);
        console.log(`📖 Seen scenarios available: ${seenScenarios.length}`);

        // ─────────────────────────────────────────────────────────────────────
        // STEP 4: Select Questions (fresh first, then repeats if needed)
        // ─────────────────────────────────────────────────────────────────────

        const selectedQuestions: LevelQuizQuestion[] = [];

        // Shuffle fresh scenarios
        const shuffledFresh = freshScenarios.sort(() => Math.random() - 0.5);

        // Take up to questionCount fresh questions
        const freshToUse = shuffledFresh.slice(0, questionCount);
        freshToUse.forEach((scenario, i) => {
            selectedQuestions.push({
                ...scenario,
                is_review: false,
                question_number: i + 1
            } as LevelQuizQuestion);
        });

        // If we need more questions, fill with repeats
        const remaining = questionCount - selectedQuestions.length;
        if (remaining > 0) {
            console.log(`⚠️ Review Mode: Need ${remaining} more questions`);

            // Shuffle seen scenarios
            const shuffledSeen = seenScenarios.sort(() => Math.random() - 0.5);

            // Take remaining from seen
            const reviewToUse = shuffledSeen.slice(0, remaining);
            reviewToUse.forEach((scenario, i) => {
                selectedQuestions.push({
                    ...scenario,
                    is_review: true,
                    question_number: selectedQuestions.length + 1
                } as LevelQuizQuestion);
            });
        }

        // ─────────────────────────────────────────────────────────────────────
        // STEP 5: Build Quiz Result
        // ─────────────────────────────────────────────────────────────────────

        const freshCount = selectedQuestions.filter(q => !q.is_review).length;
        const reviewCount = selectedQuestions.filter(q => q.is_review).length;

        const quiz: LevelQuiz = {
            level_id: levelId,
            level_name: level.level_name,
            questions: selectedQuestions,
            total_questions: selectedQuestions.length,
            fresh_questions: freshCount,
            review_questions: reviewCount,
            is_review_mode: reviewCount > 0
        };

        console.log('✅ Quiz Generated:');
        console.log(`   Total: ${quiz.total_questions} questions`);
        console.log(`   Fresh: ${quiz.fresh_questions}`);
        console.log(`   Review: ${quiz.review_questions}`);
        if (quiz.is_review_mode) {
            console.log('   🔄 REVIEW MODE ACTIVE');
        }

        return quiz;

    } catch (err) {
        console.error('❌ generateLevelQuiz error:', err);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
    getGTOStrategy,
    getGTOActionForHand,
    hasGTODataForScenario,
    getGTOScenarioCount,
    getScenarioMetrics,
    generateLevelQuiz,
    generateScenarioHash,
    detectStreet
};
