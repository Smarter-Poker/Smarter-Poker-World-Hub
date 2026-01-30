/**
 * Poker Leaderboards API
 *
 * GET /api/poker/leaderboards?type=<checkins|reviews|activity|overall>&period=<week|month|all>&limit=25
 *
 * Returns ranked players based on poker engagement metrics.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { type = 'overall', period = 'all', limit = '25' } = req.query;
    const maxLimit = Math.min(parseInt(limit) || 25, 100);

    // Calculate date filter
    let dateFilter = null;
    const now = new Date();
    if (period === 'week') {
        dateFilter = new Date(now.getTime() - 7 * 86400000).toISOString();
    } else if (period === 'month') {
        dateFilter = new Date(now.getTime() - 30 * 86400000).toISOString();
    }

    try {
        const leaders = [];

        if (type === 'checkins' || type === 'overall') {
            let query = supabase
                .from('poker_checkins')
                .select('user_id, created_at');
            if (dateFilter) query = query.gte('created_at', dateFilter);
            const { data: checkins } = await query;

            const counts = {};
            (checkins || []).forEach(c => {
                counts[c.user_id] = (counts[c.user_id] || 0) + 1;
            });

            if (type === 'checkins') {
                const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, maxLimit);
                const userIds = sorted.map(([id]) => id);
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, username, full_name, avatar_url')
                    .in('id', userIds);
                const profileMap = {};
                (profiles || []).forEach(p => { profileMap[p.id] = p; });

                return res.status(200).json({
                    type: 'checkins',
                    period,
                    leaders: sorted.map(([id, count], i) => ({
                        rank: i + 1,
                        user: profileMap[id] || { id, username: 'Player' },
                        count,
                        metric: 'check-ins'
                    }))
                });
            }

            // Store for overall
            Object.entries(counts).forEach(([id, count]) => {
                const existing = leaders.find(l => l.user_id === id);
                if (existing) { existing.checkins = count; existing.score += count * 2; }
                else { leaders.push({ user_id: id, checkins: count, reviews: 0, posts: 0, score: count * 2 }); }
            });
        }

        if (type === 'reviews' || type === 'overall') {
            let query = supabase
                .from('poker_reviews')
                .select('user_id, created_at');
            if (dateFilter) query = query.gte('created_at', dateFilter);
            const { data: reviews } = await query;

            const counts = {};
            (reviews || []).forEach(r => {
                counts[r.user_id] = (counts[r.user_id] || 0) + 1;
            });

            if (type === 'reviews') {
                const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, maxLimit);
                const userIds = sorted.map(([id]) => id);
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, username, full_name, avatar_url')
                    .in('id', userIds);
                const profileMap = {};
                (profiles || []).forEach(p => { profileMap[p.id] = p; });

                return res.status(200).json({
                    type: 'reviews',
                    period,
                    leaders: sorted.map(([id, count], i) => ({
                        rank: i + 1,
                        user: profileMap[id] || { id, username: 'Player' },
                        count,
                        metric: 'reviews'
                    }))
                });
            }

            Object.entries(counts).forEach(([id, count]) => {
                const existing = leaders.find(l => l.user_id === id);
                if (existing) { existing.reviews = count; existing.score += count * 3; }
                else { leaders.push({ user_id: id, checkins: 0, reviews: count, posts: 0, score: count * 3 }); }
            });
        }

        if (type === 'activity' || type === 'overall') {
            let query = supabase
                .from('social_posts')
                .select('author_id, created_at');
            if (dateFilter) query = query.gte('created_at', dateFilter);
            const { data: posts } = await query;

            const counts = {};
            (posts || []).forEach(p => {
                if (p.author_id) counts[p.author_id] = (counts[p.author_id] || 0) + 1;
            });

            if (type === 'activity') {
                const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, maxLimit);
                const userIds = sorted.map(([id]) => id);
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, username, full_name, avatar_url')
                    .in('id', userIds);
                const profileMap = {};
                (profiles || []).forEach(p => { profileMap[p.id] = p; });

                return res.status(200).json({
                    type: 'activity',
                    period,
                    leaders: sorted.map(([id, count], i) => ({
                        rank: i + 1,
                        user: profileMap[id] || { id, username: 'Player' },
                        count,
                        metric: 'posts'
                    }))
                });
            }

            Object.entries(counts).forEach(([id, count]) => {
                const existing = leaders.find(l => l.user_id === id);
                if (existing) { existing.posts = count; existing.score += count; }
                else { leaders.push({ user_id: id, checkins: 0, reviews: 0, posts: count, score: count }); }
            });
        }

        // Overall - return combined scores
        leaders.sort((a, b) => b.score - a.score);
        const topLeaders = leaders.slice(0, maxLimit);
        const userIds = topLeaders.map(l => l.user_id);
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .in('id', userIds);
        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        return res.status(200).json({
            type: 'overall',
            period,
            leaders: topLeaders.map((l, i) => ({
                rank: i + 1,
                user: profileMap[l.user_id] || { id: l.user_id, username: 'Player' },
                score: l.score,
                checkins: l.checkins,
                reviews: l.reviews,
                posts: l.posts
            }))
        });

    } catch (error) {
        console.error('Leaderboard error:', error);
        return res.status(500).json({ error: 'Failed to load leaderboards' });
    }
}
