/**
 * API: Save Training Progress
 * ═══════════════════════════════════════════════════════════════════════════
 * Saves user progress after completing a level
 * 
 * POST /api/training/save-progress
 * 
 * Body:
 * {
 *   userId: string,
 *   gameId: string,
 *   level: number,
 *   questionsAnswered: number,
 *   questionsCorrect: number,
 *   accuracy: number,
 *   passed: boolean,
 *   streak: number,
 *   diamondsEarned: number,
 *   timeSpentSeconds: number
 * }
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Upsert leaderboard entry for user
 * Updates both 'daily' and 'all_time' leaderboards
 */
async function upsertLeaderboard(sb, userId, gameId, diamondsEarned, accuracy, passed) {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    for (const leaderboardType of ['daily', 'all_time']) {
        // Check if entry exists
        const { data: existing } = await sb
            .from('training_leaderboard')
            .select('id, total_games_completed, average_accuracy, total_mastery_points')
            .eq('user_id', userId)
            .eq('leaderboard_type', leaderboardType)
            .maybeSingle();

        if (existing) {
            // Update existing entry
            const newGamesCompleted = (existing.total_games_completed || 0) + (passed ? 1 : 0);
            const newAccuracy = newGamesCompleted > 0
                ? ((existing.average_accuracy || 0) * (existing.total_games_completed || 0) + accuracy) / newGamesCompleted
                : accuracy;

            await sb.from('training_leaderboard')
                .update({
                    total_games_completed: newGamesCompleted,
                    total_mastery_points: (existing.total_mastery_points || 0) + diamondsEarned,
                    average_accuracy: Math.round(newAccuracy),
                    updated_at: now.toISOString(),
                })
                .eq('id', existing.id);
        } else {
            // Insert new entry
            await sb.from('training_leaderboard').insert({
                user_id: userId,
                leaderboard_type: leaderboardType,
                game_id: gameId,
                total_games_completed: passed ? 1 : 0,
                total_mastery_points: diamondsEarned,
                average_accuracy: accuracy,
                period_start: leaderboardType === 'daily' ? periodStart : null,
                period_end: leaderboardType === 'daily' ? periodEnd : null,
            });
        }
    }
}

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    // Require JWT auth for write operations
    if (req.method !== 'GET') {
        const _token = req.headers.authorization?.replace('Bearer ', '');
        if (!_token) return res.status(401).json({ success: false, error: 'Authentication required' });
        const { data: { user: _authUser }, error: _authErr } = await supabase.auth.getUser(_token);
        if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });
        if (req.body) req.body.userId = _authUser.id;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const {
            userId,
            gameId,
            level,
            questionsAnswered,
            questionsCorrect,
            accuracy,
            passed,
            streak,
            diamondsEarned,
            timeSpentSeconds
        } = req.body;

        // Validation
        if (!userId || !gameId || !level) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // 1. Save level completion to history
        const { data: levelHistory, error: historyError } = await supabase
            .from('training_level_history')
            .insert({
                user_id: userId,
                game_id: gameId,
                level: level,
                questions_answered: questionsAnswered,
                questions_correct: questionsCorrect,
                accuracy_percentage: accuracy,
                passed: passed,
                time_spent_seconds: timeSpentSeconds,
                best_streak: streak,
                diamonds_earned: diamondsEarned
            })
            .select()
            .maybeSingle();

        if (historyError) {
            console.error('Error saving level history:', historyError);
        }

        // 2. Update or create training_progress
        const { data: existingProgress } = await supabase
            .from('training_progress')
            .select('*')
            .eq('user_id', userId)
            .eq('game_id', gameId)
            .maybeSingle();

        if (existingProgress) {
            // Update existing progress
            const { data: updatedProgress, error: updateError } = await supabase
                .from('training_progress')
                .update({
                    level: passed ? Math.min(level + 1, 10) : level,
                    hands_played: (existingProgress.hands_played || 0) + questionsAnswered,
                    correct_answers: (existingProgress.correct_answers || 0) + questionsCorrect,
                    total_answers: (existingProgress.total_answers || 0) + questionsAnswered,
                    current_streak: streak,
                    best_streak: Math.max(streak, existingProgress.best_streak || 0),
                    last_played_at: new Date().toISOString()
                })
                .eq('user_id', userId)
                .eq('game_id', gameId)
                .select()
                .maybeSingle();

            if (updateError) {
                console.error('Error updating progress:', updateError);
                return res.status(500).json({ success: false, error: 'Failed to update progress' });
            }

            // 3. Upsert leaderboard entry
            try {
                await upsertLeaderboard(supabase, userId, gameId, diamondsEarned, accuracy, passed);
            } catch (lbError) {
                console.warn('Leaderboard upsert failed:', lbError.message);
            }

            return res.status(200).json({
                success: true,
                progress: updatedProgress,
                levelHistory: levelHistory
            });
        } else {
            // Create new progress
            const { data: newProgress, error: insertError } = await supabase
                .from('training_progress')
                .insert({
                    user_id: userId,
                    game_id: gameId,
                    level: passed ? Math.min(level + 1, 10) : level,
                    hands_played: questionsAnswered,
                    correct_answers: questionsCorrect,
                    total_answers: questionsAnswered,
                    current_streak: streak,
                    best_streak: streak,
                    last_played_at: new Date().toISOString()
                })
                .select()
                .maybeSingle();

            if (insertError) {
                console.error('Error creating progress:', JSON.stringify(insertError, null, 2));
                console.error('Insert payload:', { userId, gameId, level, questionsAnswered, questionsCorrect });
                return res.status(500).json({
                    success: false, error: 'Failed to create progress',
                    details: insertError.message,
                    code: insertError.code,
                    hint: insertError.hint
                });
            }

            // 3. Upsert leaderboard entry
            try {
                await upsertLeaderboard(supabase, userId, gameId, diamondsEarned, accuracy, passed);
            } catch (lbError) {
                console.warn('Leaderboard upsert failed:', lbError.message);
            }

            return res.status(200).json({
                success: true,
                progress: newProgress,
                levelHistory: levelHistory
            });
        }

    } catch (error) {
        console.error('Error in save-progress:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
