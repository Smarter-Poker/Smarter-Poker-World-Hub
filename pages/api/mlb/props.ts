import { getMlbSupabase } from '../../../utils/supabase/mlb';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const mlbDb = getMlbSupabase();
        
        // Fetch from pred_props table directly using its schema
        const { data, error } = await mlbDb
            .from('pred_props')
            .select(`
                id,
                player_id,
                player_name,
                team_abbr,
                prop_type,
                line,
                over_odds,
                under_odds,
                model_proj,
                edge_pts,
                implied_prob,
                game_pk
            `)
            .order('edge_pts', { ascending: false, nullsFirst: false });

        if (error) {
            console.warn('[API/MLB/Props] Error fetching props from pred_props:', error.message);
            return new Response(JSON.stringify({ props: [] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
            });
        }

        const mappedProps = (data || []).map(p => {
            const isOver = Number(p.model_proj) > Number(p.line);
            const odds = isOver ? Number(p.over_odds) : Number(p.under_odds);
            let ev_pct: number | null = null;
            if (p.implied_prob != null && !isNaN(odds)) {
                const decimalOdds = odds > 0 ? (1 + odds/100) : (1 - 100/odds);
                const ev = (Number(p.implied_prob) * decimalOdds) - 1;
                ev_pct = ev * 100;
            }

            return {
                ...p,
                ev_pct,
                prob_over: p.implied_prob, // Map to what frontend expects
                proj_mean: p.model_proj, // Fallback mapping
                prop: p.prop_type // Fallback mapping
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
