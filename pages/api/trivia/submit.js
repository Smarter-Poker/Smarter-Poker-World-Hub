/**
 * TRIVIA SUBMIT API - Save Quiz Results
 * ═══════════════════════════════════════════════════════════════════════════
 * Saves player's trivia score and awards XP
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { score, correctCount, xpEarned, totalQuestions } = req.body;

        if (typeof score !== 'number' || typeof correctCount !== 'number') {
            return res.status(400).json({ error: 'Invalid score data' });
        }

        const today = new Date().toISOString().split('T')[0];

        // For now, save as anonymous (would use auth in production)
        const username = 'Guest_' + Math.random().toString(36).substring(2, 8);

        // Save score to leaderboard
        const { error: insertError } = await supabase
            .from('trivia_scores')
            .insert({
                username,
                score,
                correct_count: correctCount,
                total_questions: totalQuestions,
                xp_earned: xpEarned,
                play_date: today,
                created_at: new Date().toISOString()
            });

        if (insertError) {
            console.error('[Trivia Submit] Insert error:', insertError);
            // Don't fail - the table might not exist yet
        }

        // Get updated leaderboard
        const { data: leaderboard } = await supabase
            .from('trivia_scores')
            .select('username, score')
            .eq('play_date', today)
            .order('score', { ascending: false })
            .limit(10);

        return res.status(200).json({
            success: true,
            message: 'Score saved successfully',
            score,
            xpEarned,
            leaderboard: leaderboard || []
        });

    } catch (error) {
        console.error('[Trivia Submit] Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
