/**
 * GET /api/sandbox/leaderboard
 * Weekly accuracy leaderboard from sandbox_coach_results.
 * Returns top 10 users by accuracy % (min 20 hands this week).
 */
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const supabase = getSupabase();

        // Authenticate
        let userId = null;
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.replace('Bearer ', '');
            try {
                const { data: { user } } = await supabase.auth.getUser(token);
                if (user) userId = user.id;
            } catch (e) { /* non-fatal */ }
        }

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // Week boundaries (Monday → Sunday)
        const now = new Date();
        const dayOfWeek = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
        monday.setHours(0, 0, 0, 0);

        const weekStart = monday.toISOString();

        // Fetch all coach results this week
        const { data: rows } = await supabase
            .from('sandbox_coach_results')
            .select('user_id, is_correct')
            .gte('created_at', weekStart);

        // Aggregate per user
        const userStats = {};
        (rows || []).forEach(r => {
            if (!userStats[r.user_id]) userStats[r.user_id] = { correct: 0, total: 0 };
            userStats[r.user_id].total++;
            if (r.is_correct) userStats[r.user_id].correct++;
        });

        // Filter: min 20 hands, calculate accuracy
        const qualified = Object.entries(userStats)
            .filter(([, v]) => v.total >= 20)
            .map(([uid, v]) => ({
                user_id: uid,
                total_hands: v.total,
                correct_count: v.correct,
                accuracy_pct: Math.round(100 * v.correct / v.total),
            }))
            .sort((a, b) => b.accuracy_pct - a.accuracy_pct || b.total_hands - a.total_hands)
            .slice(0, 10);

        // Fetch usernames for the top 10
        const userIds = qualified.map(q => q.user_id);
        let usernameMap = {};
        if (userIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, username, display_name')
                .in('id', userIds);
            (profiles || []).forEach(p => {
                usernameMap[p.id] = p.display_name || p.username || 'Player';
            });
        }

        const leaderboard = qualified.map(q => ({
            ...q,
            username: usernameMap[q.user_id] || 'Player',
        }));

        // Find current user's rank
        const allRanked = Object.entries(userStats)
            .filter(([, v]) => v.total >= 20)
            .map(([uid, v]) => ({
                user_id: uid,
                accuracy_pct: Math.round(100 * v.correct / v.total),
                total_hands: v.total,
            }))
            .sort((a, b) => b.accuracy_pct - a.accuracy_pct || b.total_hands - a.total_hands);

        const userRank = allRanked.findIndex(r => r.user_id === userId) + 1;

        return res.status(200).json({
            success: true,
            leaderboard,
            userRank: userRank > 0 ? userRank : null,
            weekStart,
        });
    } catch (err) {
        console.error('[leaderboard] Handler error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
