/**
 * GET /api/sandbox/session-stats
 * Returns aggregated coach mode analytics for the authenticated user:
 *  - Total sessions & hands
 *  - Accuracy trend (last 20 sessions bucketed by day)
 *  - Strongest/weakest position
 *  - Weakest street
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

        // ── 1. Total stats from the accuracy view ──────────────────
        const { data: summary } = await supabase
            .from('sandbox_coach_accuracy')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

        // ── 2. Accuracy trend (last 30 days, bucketed by day) ──────
        const { data: trendRows } = await supabase
            .from('sandbox_coach_results')
            .select('created_at, is_correct')
            .eq('user_id', userId)
            .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
            .order('created_at', { ascending: true });

        // Bucket by date
        const buckets = {};
        (trendRows || []).forEach(r => {
            const day = r.created_at?.slice(0, 10);
            if (!day) return;
            if (!buckets[day]) buckets[day] = { total: 0, correct: 0 };
            buckets[day].total++;
            if (r.is_correct) buckets[day].correct++;
        });

        const accuracyTrend = Object.entries(buckets)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-20)
            .map(([date, { total, correct }]) => ({
                date,
                total,
                correct,
                pct: total > 0 ? Math.round(100 * correct / total) : 0,
            }));

        // ── 3. Position breakdown ──────────────────────────────────
        const { data: posRows } = await supabase
            .from('sandbox_coach_results')
            .select('hero_position, is_correct')
            .eq('user_id', userId)
            .not('hero_position', 'is', null);

        const positions = {};
        (posRows || []).forEach(r => {
            const p = (r.hero_position || 'unknown').toUpperCase();
            if (!positions[p]) positions[p] = { total: 0, correct: 0 };
            positions[p].total++;
            if (r.is_correct) positions[p].correct++;
        });

        const positionStats = Object.entries(positions)
            .filter(([, v]) => v.total >= 2)
            .map(([pos, { total, correct }]) => ({
                position: pos,
                total,
                correct,
                pct: Math.round(100 * correct / total),
            }))
            .sort((a, b) => b.pct - a.pct);

        const topPosition = positionStats[0]?.position || null;
        const weakPosition = positionStats[positionStats.length - 1]?.position || null;

        // ── 4. Street breakdown ────────────────────────────────────
        const { data: streetRows } = await supabase
            .from('sandbox_coach_results')
            .select('street, is_correct')
            .eq('user_id', userId);

        const streets = {};
        (streetRows || []).forEach(r => {
            const s = (r.street || 'preflop').toLowerCase();
            if (!streets[s]) streets[s] = { total: 0, correct: 0 };
            streets[s].total++;
            if (r.is_correct) streets[s].correct++;
        });

        const streetStats = Object.entries(streets)
            .map(([street, { total, correct }]) => ({
                street,
                total,
                correct,
                pct: total > 0 ? Math.round(100 * correct / total) : 0,
            }))
            .sort((a, b) => a.pct - b.pct);

        const weakestStreet = streetStats[0]?.street || null;

        return res.status(200).json({
            success: true,
            totalHands: summary?.total_hands || 0,
            correctCount: summary?.correct_count || 0,
            accuracyPct: summary?.accuracy_pct || null,
            avgLeakEv: summary?.avg_leak_ev || null,
            accuracyTrend,
            positionStats,
            topPosition,
            weakPosition,
            streetStats,
            weakestStreet,
        });
    } catch (err) {
        console.error('[session-stats] Handler error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
