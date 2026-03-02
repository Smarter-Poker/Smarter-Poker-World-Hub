/**
 * 🏆 UPDATE LEADERBOARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Updates user's leaderboard stats after completing a training session
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    // Require JWT auth for write operations
    if (req.method !== 'GET') {
        const _token = req.headers.authorization?.replace('Bearer ', '');
        if (!_token) return res.status(401).json({ error: 'Authentication required' });
        const { data: { user: _authUser }, error: _authErr } = await supabase.auth.getUser(_token);
        if (_authErr || !_authUser) return res.status(401).json({ error: 'Invalid token' });
        if (req.body) req.body.userId = _authUser.id;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const {
        userId,
        questionsAnswered,
        questionsCorrect,
        accuracy,
        xpEarned,
        bestStreak = 0
    } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        const now = new Date();

        // Calculate period keys
        const dailyKey = now.toISOString().split('T')[0];
        const weekNum = Math.ceil((now.getDate() + new Date(now.getFullYear(), now.getMonth(), 1).getDay()) / 7);
        const weeklyKey = `${now.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
        const monthlyKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;

        const periods = [
            { type: 'daily', key: dailyKey },
            { type: 'weekly', key: weeklyKey },
            { type: 'monthly', key: monthlyKey },
            { type: 'alltime', key: 'alltime' }
        ];

        // Update each period
        for (const period of periods) {
            // Check if entry exists
            const { data: existing } = await supabase
                .from('training_leaderboard')
                .select('*')
                .eq('user_id', userId)
                .eq('period_type', period.type)
                .eq('period_key', period.key)
                .single();

            if (existing) {
                // Update existing entry
                const newTotal = existing.questions_answered + questionsAnswered;
                const newCorrect = existing.questions_correct + questionsCorrect;
                const newAccuracy = newTotal > 0 ? (newCorrect / newTotal * 100).toFixed(2) : 0;

                await supabase
                    .from('training_leaderboard')
                    .update({
                        sessions_completed: existing.sessions_completed + 1,
                        questions_answered: newTotal,
                        questions_correct: newCorrect,
                        accuracy: newAccuracy,
                        total_xp: existing.total_xp + xpEarned,
                        best_streak: Math.max(existing.best_streak, bestStreak),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existing.id);
            } else {
                // Create new entry
                await supabase
                    .from('training_leaderboard')
                    .insert({
                        user_id: userId,
                        period_type: period.type,
                        period_key: period.key,
                        sessions_completed: 1,
                        questions_answered: questionsAnswered,
                        questions_correct: questionsCorrect,
                        accuracy,
                        total_xp: xpEarned,
                        best_streak: bestStreak
                    });
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Leaderboard updated for all periods'
        });

    } catch (error) {
        console.error('[UpdateLeaderboard] Error:', error.message);
        return res.status(500).json({ error: 'Failed to update leaderboard' });
    }
}
