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
 *   xpEarned: number,
 *   diamondsEarned: number,
 *   timeSpentSeconds: number
 * }
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
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
            xpEarned,
            diamondsEarned,
            timeSpentSeconds
        } = req.body;

        // Validation
        if (!userId || !gameId || !level) {
            return res.status(400).json({ error: 'Missing required fields' });
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
                xp_earned: xpEarned,
                diamonds_earned: diamondsEarned
            })
            .select()
            .single();

        if (historyError) {
            console.error('Error saving level history:', historyError);
        }

        // 2. Update or create training_progress
        const { data: existingProgress } = await supabase
            .from('training_progress')
            .select('*')
            .eq('user_id', userId)
            .eq('game_id', gameId)
            .single();

        const newMasteryPercentage = passed ? level * 10 : (existingProgress?.mastery_percentage || 0);
        const newHighestLevel = passed ? Math.max(level, existingProgress?.highest_level_completed || 0) : (existingProgress?.highest_level_completed || 0);
        const newCurrentLevel = passed ? Math.min(level + 1, 10) : level;

        if (existingProgress) {
            // Update existing progress
            const { data: updatedProgress, error: updateError } = await supabase
                .from('training_progress')
                .update({
                    current_level: newCurrentLevel,
                    highest_level_completed: newHighestLevel,
                    mastery_percentage: newMasteryPercentage,
                    total_questions_answered: (existingProgress.total_questions_answered || 0) + questionsAnswered,
                    total_correct: (existingProgress.total_correct || 0) + questionsCorrect,
                    total_incorrect: (existingProgress.total_incorrect || 0) + (questionsAnswered - questionsCorrect),
                    current_streak: streak,
                    best_streak: Math.max(streak, existingProgress.best_streak || 0),
                    total_xp_earned: (existingProgress.total_xp_earned || 0) + xpEarned,
                    total_diamonds_earned: (existingProgress.total_diamonds_earned || 0) + diamondsEarned,
                    last_played_at: new Date().toISOString()
                })
                .eq('user_id', userId)
                .eq('game_id', gameId)
                .select()
                .single();

            if (updateError) {
                console.error('Error updating progress:', updateError);
                return res.status(500).json({ error: 'Failed to update progress' });
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
                    current_level: newCurrentLevel,
                    highest_level_completed: newHighestLevel,
                    mastery_percentage: newMasteryPercentage,
                    total_questions_answered: questionsAnswered,
                    total_correct: questionsCorrect,
                    total_incorrect: questionsAnswered - questionsCorrect,
                    current_streak: streak,
                    best_streak: streak,
                    total_xp_earned: xpEarned,
                    total_diamonds_earned: diamondsEarned,
                    last_played_at: new Date().toISOString(),
                    first_played_at: new Date().toISOString()
                })
                .select()
                .single();

            if (insertError) {
                console.error('Error creating progress:', insertError);
                return res.status(500).json({ error: 'Failed to create progress' });
            }

            return res.status(200).json({
                success: true,
                progress: newProgress,
                levelHistory: levelHistory
            });
        }

    } catch (error) {
        console.error('Error in save-progress:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
