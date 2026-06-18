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
        
        // Fetch teams from dim_teams
        const { data: dimData, error: dimError } = await mlbDb
            .from('dim_teams')
            .select('team_id, name, abbr, league, division');

        if (dimError) {
            console.warn('[API/MLB/Standings] Error fetching dim_teams:', dimError.message);
            return new Response(JSON.stringify({ teams: [] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Return the teams with 0/0/0 data mapped so the UI doesn't crash or show undefined
        const teams = (dimData || []).map(team => ({
            ...team,
            w: 0,
            l: 0,
            pct: 0.000,
            gb: '-'
        }));

        // Sort by division or league if needed, but for now we'll just return them
        return new Response(JSON.stringify({ teams }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
            }
        });
    } catch (err) {
        console.error('[API/MLB/Standings] Unhandled error:', err);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
