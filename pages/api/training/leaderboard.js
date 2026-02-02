/**
 * 🏆 TRAINING LEADERBOARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Daily/weekly/all-time rankings for training performance
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { period = 'daily', limit = 20, gameId } = req.query;
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // Calculate period key
        const now = new Date();
        let periodKey;

        switch (period) {
            case 'daily':
                periodKey = now.toISOString().split('T')[0]; // 2026-02-02
                break;
            case 'weekly':
                const weekNum = Math.ceil((now.getDate() + new Date(now.getFullYear(), now.getMonth(), 1).getDay()) / 7);
                periodKey = `${now.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
                break;
            case 'monthly':
                periodKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
                break;
            case 'alltime':
                periodKey = 'alltime';
                break;
            default:
                periodKey = now.toISOString().split('T')[0];
        }

        // Fetch leaderboard - use left join to handle missing profiles
        const { data: leaderboard, error } = await supabase
            .from('training_leaderboard')
            .select(`
                user_id,
                sessions_completed,
                questions_answered,
                questions_correct,
                accuracy,
                total_xp,
                best_streak
            `)
            .eq('period_type', period)
            .eq('period_key', periodKey)
            .order('accuracy', { ascending: false })
            .order('total_xp', { ascending: false })
            .limit(parseInt(limit));

        if (error) throw error;

        // Fetch profiles separately for any entries
        const userIds = (leaderboard || []).map(e => e.user_id);
        let profilesMap = {};

        if (userIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, username, avatar_url')
                .in('id', userIds);

            profilesMap = (profiles || []).reduce((acc, p) => {
                acc[p.id] = p;
                return acc;
            }, {});
        }

        // Format response with rankings
        const rankings = (leaderboard || []).map((entry, index) => ({
            rank: index + 1,
            userId: entry.user_id,
            username: profilesMap[entry.user_id]?.username || 'Anonymous',
            avatarUrl: profilesMap[entry.user_id]?.avatar_url,
            accuracy: entry.accuracy,
            sessionsCompleted: entry.sessions_completed,
            questionsCorrect: entry.questions_correct,
            totalXp: entry.total_xp,
            bestStreak: entry.best_streak
        }));

        return res.status(200).json({
            success: true,
            period,
            periodKey,
            leaderboard: rankings,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[Leaderboard] Error:', error.message);
        return res.status(500).json({ error: 'Failed to fetch leaderboard', details: error.message });
    }
}
