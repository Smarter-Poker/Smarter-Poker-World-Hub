import { getMlbSupabase } from '../../../utils/supabase/mlb';


export default async function handler(req: Request) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const mlbDb = getMlbSupabase();
        
        // Fetch props and profiles concurrently
        const [propsRes, hittersRes, pitchersRes, teamsRes] = await Promise.all([
            mlbDb
                .from('pred_props')
                .select(`
                    game_pk,
                    as_of_ts,
                    player_id,
                    prop,
                    line,
                    proj_mean,
                    prob_over,
                    market_novig_over,
                    edge_pts,
                    best_price,
                    best_book,
                    rec
                `)
                .order('edge_pts', { ascending: false, nullsFirst: false }),
            mlbDb.from('v_hitter_profile').select('player_id, full_name, team_id'),
            mlbDb.from('v_pitcher_profile').select('player_id, full_name, team_id'),
            mlbDb.from('dim_teams').select('team_id, abbr')
        ]);

        if (propsRes.error) {
            console.error('[API/MLB/Props] Error fetching props from pred_props:', propsRes.error);
            return new Response(JSON.stringify({ error: `Database error: ${propsRes.error.message}` }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const hitters = hittersRes.data || [];
        const pitchers = pitchersRes.data || [];
        const dimTeams = teamsRes.data || [];

        const teamMap = new Map<number, string>();
        dimTeams.forEach(t => teamMap.set(t.team_id, t.abbr));

        const playerMap = new Map<number, { name: string, team: string }>();
        hitters.forEach(h => {
            if (h.player_id) playerMap.set(h.player_id, { name: h.full_name, team: teamMap.get(h.team_id) || '' });
        });
        pitchers.forEach(p => {
            if (p.player_id) playerMap.set(p.player_id, { name: p.full_name, team: teamMap.get(p.team_id) || '' });
        });

        const mappedProps = (propsRes.data || []).map(p => {
            const playerInfo = playerMap.get(p.player_id) || { name: `Unknown (${p.player_id})`, team: '' };
            const isOver = p.rec === 'over';
            const odds = Number(p.best_price);
            
            let ev_pct: number | null = null;
            if (p.prob_over != null && !isNaN(odds)) {
                const decimalOdds = odds > 0 ? (1 + odds/100) : (1 - 100/odds);
                const impliedProb = isOver ? p.prob_over : (1 - p.prob_over);
                const ev = (impliedProb * decimalOdds) - 1;
                ev_pct = ev * 100;
            }

            return {
                ...p,
                player_name: playerInfo.name,
                team_abbr: playerInfo.team,
                ev_pct,
                isOver,
                odds,
                // Maps to legacy schema for UI compatibility:
                prop_type: p.prop,
                implied_prob: p.prob_over,
                model_proj: p.proj_mean,
                over_odds: isOver ? odds : null,
                under_odds: !isOver ? odds : null,
            };
        });

        return new Response(JSON.stringify({ 
            props: mappedProps 
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
            }
        });
    } catch (err) {
        console.error('[API/MLB/Props] Unhandled error:', err);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
