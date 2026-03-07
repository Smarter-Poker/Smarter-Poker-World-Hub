/**
 * 🏆 TRAINING LEADERBOARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Daily/weekly/all-time rankings for training performance
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    // CDN cache: fresh for 30s, serve stale up to 120s
    if (req.method === 'GET') {
        res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
    }

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Require JWT auth for write operations
    if (req.method !== 'GET') {
        const _token = req.headers.authorization?.replace('Bearer ', '');
        if (!_token) return res.status(401).json({ success: false, error: 'Authentication required' });
        const { data: { user: _authUser }, error: _authErr } = await supabase.auth.getUser(_token);
        if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });
        if (req.body) req.body.userId = _authUser.id;
    }



    // POST: Update leaderboard entry after session
    if (req.method === 'POST') {
        const { userId, accuracy, questionsAnswered, questionsCorrect, bestStreak, gameId, gtowScore } = req.body;
        const isPerfectRound = accuracy === 100;

        // GTOW Score is the new metric for XP. Default to accuracy if not provided by older games
        const earnedXp = gtowScore !== undefined ? gtowScore : (accuracy || 0);

        if (!userId) {
            return res.status(400).json({ success: false, error: 'userId required' });
        }

        try {
            const now = new Date();
            const periods = [
                { type: 'daily', key: now.toISOString().split('T')[0] },
                { type: 'weekly', key: `${now.getFullYear()}-W${Math.ceil((now.getDate() + new Date(now.getFullYear(), now.getMonth(), 1).getDay()) / 7).toString().padStart(2, '0')}` },
                { type: 'monthly', key: `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}` },
                { type: 'alltime', key: 'alltime' }
            ];

            // Upsert entry for each period
            for (const period of periods) {
                const { data: existing } = await supabase
                    .from('training_leaderboard')
                    .select('*')
                    .eq('user_id', userId)
                    .eq('period_type', period.type)
                    .eq('period_key', period.key)
                    .single();

                if (existing) {
                    const newTotal = existing.questions_answered + questionsAnswered;
                    const newCorrect = existing.questions_correct + questionsCorrect;
                    await supabase
                        .from('training_leaderboard')
                        .update({
                            sessions_completed: existing.sessions_completed + 1,
                            questions_answered: newTotal,
                            questions_correct: newCorrect,
                            accuracy: newTotal > 0 ? Math.round((newCorrect / newTotal) * 100) : 0,
                            best_streak: Math.max(existing.best_streak || 0, bestStreak || 0),
                            perfect_rounds: (existing.perfect_rounds || 0) + (isPerfectRound ? 1 : 0),
                            total_xp: (existing.total_xp || 0) + earnedXp,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', existing.id);
                } else {
                    await supabase
                        .from('training_leaderboard')
                        .insert({
                            user_id: userId,
                            period_type: period.type,
                            period_key: period.key,
                            sessions_completed: 1,
                            questions_answered: questionsAnswered,
                            questions_correct: questionsCorrect,
                            accuracy: questionsAnswered > 0 ? Math.round((questionsCorrect / questionsAnswered) * 100) : 0,
                            best_streak: bestStreak || 0,
                            perfect_rounds: isPerfectRound ? 1 : 0,
                            total_xp: earnedXp
                        });
                }
            }

            return res.status(200).json({ success: true, message: 'Leaderboard updated' });
        } catch (error) {
            console.error('[Leaderboard] Update error:', error.message);
            return res.status(500).json({ success: false, error: 'Failed to update leaderboard' });
        }
    }

    // GET: Fetch leaderboard
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }


    const { period = 'daily', limit = 20, gameId } = req.query;


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
        return res.status(500).json({ success: false, error: 'Failed to fetch leaderboard', details: error.message });
    }
}
