import { getMlbSupabase } from '../../../utils/supabase/mlb';





async function edgeHandler(req: Request) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const mlbDb = getMlbSupabase();
        
        const todayStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());

        // Fetch teams, advanced stats, dimension info, and current market edges
        const [teamsRes, aggRes, dimRes, predRes, hittersRes, pitchersRes] = await Promise.all([
            mlbDb.from('v_team_profile').select('*').order('name', { ascending: true }),
            mlbDb.from('agg_team').select('team_id, era, fip, xfip, siera, pitching_war, avg, obp, slg, ops, hr, sb, hitting_war, def, uzr, drs, oaa').eq('window_kind', 'season'),
            mlbDb.from('dim_teams').select('team_id, name, abbr, league, division'),
            mlbDb.from('pred_props').select('player_id, edge_pts').gt('edge_pts', 0).gte('as_of_ts', `${todayStr}T00:00:00`),
            mlbDb.from('v_hitter_profile').select('player_id, team_id'),
            mlbDb.from('v_pitcher_profile').select('player_id, team_id')
        ]);

        if (teamsRes.error) {
            console.warn('[API/MLB/Teams] Error fetching teams (table may be missing):', teamsRes.error.message);
            return new Response(JSON.stringify({ teams: [], globalEdgeActive: false }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
            });
        }

        const teams = teamsRes.data || [];
        const aggData = aggRes.data || [];
        const dimData = dimRes.data || [];
        const predData = predRes.data || [];
        
        // Map player_id to team_id
        const playerToTeam = new Map<number, number>();
        (hittersRes.data || []).forEach(h => {
            if (h.player_id && h.team_id) playerToTeam.set(h.player_id, h.team_id);
        });
        (pitchersRes.data || []).forEach(p => {
            if (p.player_id && p.team_id) playerToTeam.set(p.player_id, p.team_id);
        });

        // Determine if there is a global MLB Edge available today
        const globalEdgeActive = predData.length > 0;

        // Build a set of team_ids that have active edges
        const teamIdsWithEdge = new Set<number>();
        predData.forEach(p => {
            const tId = playerToTeam.get(p.player_id);
            if (tId) teamIdsWithEdge.add(tId);
        });

        // Merge advanced stats, dim info, and predictions into teams
        const mergedTeams = teams.map(team => {
            // Find latest stats for team
            const teamStats = aggData.filter(a => a.team_id === team.team_id);
            const latestStats = teamStats.length > 0 ? teamStats[0] : null;
            
            // Find dimension info
            const dimInfo = dimData.find(d => d.team_id === team.team_id) || null;

            // Check if this specific team has an active predictive edge today
            const hasEdge = teamIdsWithEdge.has(team.team_id);

            return {
                ...team,
                league: team.league || dimInfo?.league,
                division: team.division || dimInfo?.division,
                has_active_edge: hasEdge,
                adv_stats: latestStats
            };
        });

        return new Response(JSON.stringify({ 
            teams: mergedTeams,
            globalEdgeActive
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
            }
        });
    } catch (err) {
        console.error('[API/MLB/Teams] Unhandled error:', err);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}


import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers.host || 'localhost';
        const url = `${protocol}://${host}${req.url}`;
        
        // Safely convert headers to Record<string, string>
        const safeHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
            if (Array.isArray(value)) {
                safeHeaders[key] = value.join(', ');
            } else if (value !== undefined) {
                safeHeaders[key] = value;
            }
        }
        
        const requestOptions: RequestInit = {
            method: req.method,
            headers: safeHeaders,
        };
        
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            requestOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        }
        
        const request = new Request(url, requestOptions);
        const response = await edgeHandler(request);
        
        res.status(response.status);
        response.headers.forEach((value, key) => {
            res.setHeader(key, value);
        });
        
        const text = await response.text();
        if (text) {
            try {
                res.json(JSON.parse(text));
            } catch {
                res.send(text);
            }
        } else {
            res.end();
        }
    } catch (err: any) {
        console.error('API Polyfill Error:', err);
        res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
}