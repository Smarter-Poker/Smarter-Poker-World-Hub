/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GAME ENGINE SERVICE - Training Levels & Progression
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Manages the leveling system, question selection, and user progress tracking.
 * Works with God Mode service to provide GTO-backed training.
 * 
 * @version 1.0.0
 * @author Antigravity AI
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { getGTOStrategy, GTOScenario } from './god-mode-service';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface TrainingLevel {
    level_id: number;
    game_mode: 'Cash' | 'MTT' | 'Spin';
    street_filter: 'Flop' | 'Turn' | 'River' | 'All';
    stack_filter: number[];
    difficulty_rating: 'Easy' | 'Hard';
    questions_per_round: number;
    passing_threshold: number;
    level_name: string;
    description: string;
    created_at?: string;
    updated_at?: string;
}

export interface UserProgress {
    user_id: string;
    level_id: number;
    status: 'locked' | 'in_progress' | 'passed' | 'mastered';
    accuracy: number;
    attempts: number;
    best_score: number;
    last_played_at?: string;
    completed_at?: string;
}

export interface QuestionHistory {
    user_id: string;
    scenario_hash: string;
    level_id: number;
    result: 'Correct' | 'Incorrect';
    user_action: string;
    gto_action: string;
    ev_loss: number;
    played_at: string;
}

export interface LevelStats {
    total_questions: number;
    correct_answers: number;
    accuracy: number;
    avg_ev_loss: number;
}

export interface TrainingQuestion {
    scenario_hash: string;
    street: 'Flop' | 'Turn' | 'River';
    stack_depth: number;
    game_type: 'Cash' | 'MTT' | 'Spin';
    board_cards: string[];
    gto_data?: GTOScenario; // Full GTO solution (loaded separately)
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT
// ═══════════════════════════════════════════════════════════════════════════

// Lazily created + memoised. Never build the client at module scope: this module
// is imported transitively by pages, so module scope runs during SSG/SSR where the
// public env vars can resolve to empty strings and createClient() would throw at
// build time (repo Immutable Rule 3).
// NOTE: the cache is typed off a concrete factory, NOT `ReturnType<typeof createClient>`.
// createClient is generic; referencing its ReturnType directly resolves the Database
// generic to its default and collapses every query result to `never`.
function makeClient(url: string, key: string) {
    return createClient(url, key);
}
let _client: ReturnType<typeof makeClient> | null = null;
let _warnedMissingEnv = false;

function getSupabase() {
    if (_client) return _client;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseKey) {
        if (!_warnedMissingEnv) {
            _warnedMissingEnv = true;
            console.error(
                '[GameEngine] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. '
                + 'Training level queries are disabled.'
            );
        }
        return null;
    }

    _client = makeClient(supabaseUrl, supabaseKey);
    return _client;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all training levels.
 * @returns Array of training levels
 */
export async function getAllLevels(): Promise<TrainingLevel[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('training_levels')
        .select('*')
        .order('level_id');

    if (error) {
        console.error('Error fetching levels:', error);
        return [];
    }

    return data || [];
}

/**
 * Get specific training level.
 * @param levelId - Level ID
 * @returns Training level or null
 */
export async function getLevel(levelId: number): Promise<TrainingLevel | null> {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('training_levels')
        .select('*')
        .eq('level_id', levelId)
        .maybeSingle();

    if (error) {
        console.error(`Error fetching level ${levelId}:`, error);
        return null;
    }

    return data || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// USER PROGRESS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get user's progress across all levels.
 * @param userId - User ID
 * @returns Array of user progress records
 */
export async function getUserProgress(userId: string): Promise<UserProgress[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('user_level_progress')
        .select('*')
        .eq('user_id', userId)
        .order('level_id');

    if (error) {
        console.error('Error fetching user progress:', error);
        return [];
    }

    return data || [];
}

/**
 * Get user's progress for specific level.
 * @param userId - User ID
 * @param levelId - Level ID
 * @returns User progress or null
 */
export async function getLevelProgress(
    userId: string,
    levelId: number
): Promise<UserProgress | null> {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('user_level_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('level_id', levelId)
        .maybeSingle();

    if (error) {
        console.error('Error fetching level progress:', error);
        return null;
    }

    return data || null;
}

/**
 * Initialize or update user progress for a level.
 * @param userId - User ID
 * @param levelId - Level ID
 * @param status - Status to set
 * @returns Updated progress
 */
export async function updateLevelProgress(
    userId: string,
    levelId: number,
    updates: Partial<UserProgress>
): Promise<UserProgress | null> {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('user_level_progress')
        .upsert({
            user_id: userId,
            level_id: levelId,
            ...updates,
            updated_at: new Date().toISOString()
        })
        .select()
        .maybeSingle();

    if (error) {
        console.error('Error updating progress:', error);
        return null;
    }

    return data || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUESTION SELECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get next training question for user.
 * Uses database function to exclude already-played questions.
 * 
 * @param userId - User ID
 * @param levelId - Level ID
 * @returns Training question or null if no questions available
 */
export async function getNextQuestion(
    userId: string,
    levelId: number
): Promise<TrainingQuestion | null> {
    try {
        const supabase = getSupabase();
        if (!supabase) return null;

        // Call database function
        const { data, error } = await supabase
            .rpc('get_next_training_question', {
                p_user_id: userId,
                p_level_id: levelId
            });

        if (error) {
            console.error('Error getting next question:', error);
            return null;
        }

        if (!data || data.length === 0) {
            console.warn(`No more questions available for level ${levelId}`);
            return null;
        }

        const question = data[0];

        // Optionally load full GTO data
        const gtoData = await getGTOStrategy({
            gameType: question.game_type,
            stackDepth: question.stack_depth,
            street: question.street,
            boardCards: question.board_cards
        });

        return {
            ...question,
            gto_data: gtoData || undefined
        };

    } catch (err) {
        console.error('getNextQuestion error:', err);
        return null;
    }
}

/**
 * Get multiple questions for a level session.
 *
 * get_next_training_question only excludes scenarios already recorded in
 * user_question_history, and nothing is recorded until submitAnswer() runs after
 * the round - so the RPC can hand back the same scenario several times inside one
 * session. De-duplicate here (bounded retries so a small candidate pool cannot
 * spin forever).
 *
 * @param userId - User ID
 * @param levelId - Level ID
 * @param count - Number of questions to fetch
 * @returns Array of training questions (no duplicate scenario_hash)
 */
export async function getQuestionSet(
    userId: string,
    levelId: number,
    count: number = 20
): Promise<TrainingQuestion[]> {
    const questions: TrainingQuestion[] = [];
    const selectedHashes = new Set<string>();

    // Allow a few extra draws to absorb duplicates without looping unbounded.
    const maxAttempts = count * 3;
    let consecutiveDuplicates = 0;

    for (let attempt = 0; attempt < maxAttempts && questions.length < count; attempt++) {
        const question = await getNextQuestion(userId, levelId);
        if (!question) break;

        const hash = question.scenario_hash;

        if (hash && selectedHashes.has(hash)) {
            consecutiveDuplicates++;
            // The candidate pool is clearly exhausted - stop instead of burning
            // round trips on scenarios we already have.
            if (consecutiveDuplicates >= 5) break;
            continue;
        }

        consecutiveDuplicates = 0;
        if (hash) selectedHashes.add(hash);
        questions.push(question);
    }

    return questions;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANSWER SUBMISSION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Submit user's answer and record in history.
 * 
 * @param params - Answer submission parameters
 * @returns Question history record
 */
export async function submitAnswer(params: {
    userId: string;
    scenarioHash: string;
    levelId: number;
    userAction: string;
    gtoAction: string;
    evLoss: number;
    result: 'Correct' | 'Incorrect';
}): Promise<QuestionHistory | null> {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('user_question_history')
        .insert({
            user_id: params.userId,
            scenario_hash: params.scenarioHash,
            level_id: params.levelId,
            user_action: params.userAction,
            gto_action: params.gtoAction,
            ev_loss: params.evLoss,
            result: params.result,
            played_at: new Date().toISOString()
        })
        .select()
        .maybeSingle();

    if (error) {
        console.error('Error submitting answer:', error);
        return null;
    }

    return data || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get user's statistics for a level.
 * @param userId - User ID
 * @param levelId - Level ID
 * @returns Level statistics
 */
export async function getLevelStats(
    userId: string,
    levelId: number
): Promise<LevelStats | null> {
    try {
        const supabase = getSupabase();
        if (!supabase) return null;

        const { data, error } = await supabase
            .rpc('get_user_level_stats', {
                p_user_id: userId,
                p_level_id: levelId
            });

        if (error) {
            console.error('Error getting level stats:', error);
            return null;
        }

        if (!data || data.length === 0) {
            return {
                total_questions: 0,
                correct_answers: 0,
                accuracy: 0,
                avg_ev_loss: 0
            };
        }

        return data[0];

    } catch (err) {
        console.error('getLevelStats error:', err);
        return null;
    }
}

/**
 * Get user's question history for a level.
 * @param userId - User ID
 * @param levelId - Level ID (optional - all levels if not provided)
 * @returns Array of question history records
 */
export async function getQuestionHistory(
    userId: string,
    levelId?: number
): Promise<QuestionHistory[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    let query = supabase
        .from('user_question_history')
        .select('*')
        .eq('user_id', userId)
        .order('played_at', { ascending: false });

    if (levelId) {
        query = query.eq('level_id', levelId);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching question history:', error);
        return [];
    }

    return data || [];
}

/**
 * Check if user has passed a level.
 * @param userId - User ID
 * @param levelId - Level ID
 * @returns True if user passed
 */
export async function hasPassedLevel(
    userId: string,
    levelId: number
): Promise<boolean> {
    const level = await getLevel(levelId);
    if (!level) return false;

    const stats = await getLevelStats(userId, levelId);
    if (!stats) return false;

    return stats.accuracy >= level.passing_threshold;
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start a new training session.
 * Marks level as in_progress and returns question set.
 * 
 * @param userId - User ID
 * @param levelId - Level ID
 * @returns Question set for session
 */
export async function startTrainingSession(
    userId: string,
    levelId: number
): Promise<TrainingQuestion[]> {
    // Mark level as in progress
    await updateLevelProgress(userId, levelId, {
        status: 'in_progress',
        last_played_at: new Date().toISOString()
    });

    // Get level config
    const level = await getLevel(levelId);
    if (!level) return [];

    // Fetch question set
    const questions = await getQuestionSet(
        userId,
        levelId,
        level.questions_per_round
    );

    return questions;
}

/**
 * Complete training session and update progress.
 * @param userId - User ID
 * @param levelId - Level ID
 * @returns Updated progress
 */
export async function completeTrainingSession(
    userId: string,
    levelId: number
): Promise<UserProgress | null> {
    // Get stats
    const stats = await getLevelStats(userId, levelId);
    if (!stats) return null;

    const level = await getLevel(levelId);
    if (!level) return null;

    // Determine new status
    const passed = stats.accuracy >= level.passing_threshold;
    const mastered = stats.accuracy >= 95; // Mastery threshold

    const status = mastered ? 'mastered' : passed ? 'passed' : 'in_progress';

    // Update progress
    const progress = await getLevelProgress(userId, levelId);

    return updateLevelProgress(userId, levelId, {
        status,
        accuracy: stats.accuracy,
        attempts: (progress?.attempts || 0) + 1,
        best_score: Math.max(stats.correct_answers, progress?.best_score || 0),
        completed_at: passed ? new Date().toISOString() : undefined
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
    // Levels
    getAllLevels,
    getLevel,

    // Progress
    getUserProgress,
    getLevelProgress,
    updateLevelProgress,
    hasPassedLevel,

    // Questions
    getNextQuestion,
    getQuestionSet,
    submitAnswer,

    // Stats
    getLevelStats,
    getQuestionHistory,

    // Sessions
    startTrainingSession,
    completeTrainingSession
};
