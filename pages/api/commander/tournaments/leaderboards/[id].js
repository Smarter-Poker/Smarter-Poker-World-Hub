/**
 * Tournament Leaderboard Detail API
 * GET /api/commander/tournaments/leaderboards/[id] - Get full leaderboard with standings
 * PUT /api/commander/tournaments/leaderboards/[id] - Update leaderboard
 * DELETE /api/commander/tournaments/leaderboards/[id] - Deactivate leaderboard
 */
import { createClient } from '../../../../../src/lib/supabaseServerClient';
import { guardWriteStaff } from '../../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    const _g = await guardWriteStaff(req, res); if (!_g) return;
    const { id } = req.query;

    if (req.method === 'GET') return getLeaderboard(req, res, id);
    if (req.method === 'PUT') return updateLeaderboard(req, res, id);
    if (req.method === 'DELETE') return deactivateLeaderboard(req, res, id);

    res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
    return res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED' } });
}

async function getLeaderboard(req, res, id) {
    try {
        const { data: lb, error } = await supabase
            .from('commander_tournament_leaderboards')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (error) throw error;
        if (!lb) return res.status(404).json({ success: false, error: { message: 'Leaderboard not found' } });

        // Get all points with tournament info
        const { data: points } = await supabase
            .from('commander_tournament_points')
            .select('*, commander_tournaments(name, scheduled_start)')
            .eq('leaderboard_id', id)
            .order('created_at', { ascending: false });

        // Aggregate standings
        const playerMap = {};
        (points || []).forEach(p => {
            const key = p.player_id || p.player_name;
            if (!playerMap[key]) {
                playerMap[key] = {
                    player_id: p.player_id,
                    player_name: p.player_name,
                    total_points: 0,
                    events_played: 0,
                    best_finish: null,
                    results: []
                };
            }
            const totalPts = (p.points || 0) + (p.entry_points || 0);
            playerMap[key].total_points += totalPts;
            playerMap[key].events_played += 1;
            if (p.finish_position && (!playerMap[key].best_finish || p.finish_position < playerMap[key].best_finish)) {
                playerMap[key].best_finish = p.finish_position;
            }
            playerMap[key].results.push({
                tournament_name: p.commander_tournaments?.name,
                tournament_date: p.commander_tournaments?.scheduled_start,
                finish_position: p.finish_position,
                points: totalPts
            });
        });

        const standings = Object.values(playerMap)
            .sort((a, b) => b.total_points - a.total_points)
            .map((player, index) => ({ ...player, rank: index + 1 }));

        return res.status(200).json({ success: true, data: { leaderboard: lb, standings } });
    } catch (error) {
        console.error('Get leaderboard error:', error);
        return res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
}

async function updateLeaderboard(req, res, id) {
    try {
        const updates = {};
        const allowed = ['name', 'season_start', 'season_end', 'point_for_entry', 'point_structure', 'is_active'];
        allowed.forEach(key => {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        });

        const { data, error } = await supabase
            .from('commander_tournament_leaderboards')
            .update(updates)
            .eq('id', id)
            .select()
            .maybeSingle();

        if (error) throw error;

        return res.status(200).json({ success: true, data: { leaderboard: data } });
    } catch (error) {
        console.error('Update leaderboard error:', error);
        return res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
}

async function deactivateLeaderboard(req, res, id) {
    try {
        const { data, error } = await supabase
            .from('commander_tournament_leaderboards')
            .update({ is_active: false })
            .eq('id', id)
            .select()
            .maybeSingle();

        if (error) throw error;

        return res.status(200).json({ success: true, data: { leaderboard: data } });
    } catch (error) {
        console.error('Deactivate leaderboard error:', error);
        return res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
}
