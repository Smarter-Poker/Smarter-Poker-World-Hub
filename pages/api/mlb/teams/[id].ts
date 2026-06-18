import { getMlbSupabase } from '../../../../utils/supabase/mlb';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const url = new URL(req.url);
        const segments = url.pathname.split('/');
        const id = segments[segments.length - 1]; // get the dynamic id
        
        if (!id) {
            return new Response(JSON.stringify({ error: 'Missing Team ID' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const mlbDb = getMlbSupabase();
        
        // Fetch team profile
        const { data: teamData, error: teamErr } = await mlbDb
            .from('v_team_profile')
            .select('*')
            .eq('team_id', id)
            .maybeSingle();

        // Fetch team advanced stats
        const { data: statsData } = await mlbDb
            .from('agg_team')
            .select('*')
            .eq('team_id', id)
            .eq('window_kind', 'season')
            .maybeSingle();
            
        // Fetch team dimension info for names
        const { data: dimData } = await mlbDb
            .from('dim_teams')
            .select('*')
            .eq('team_id', id)
            .maybeSingle();

        const teamName = teamData?.name || dimData?.name || id;
        const teamAbbr = teamData?.abbr || dimData?.abbr || id;

        // Fetch recent/upcoming games for team
        // Using fct_games
        const { data: gamesData } = await mlbDb
            .from('fct_games')
            .select('*')
            .or(`home_team.eq.${teamName},away_team.eq.${teamName},home_team_name.eq.${teamName},away_team_name.eq.${teamName},home_team.eq.${teamAbbr},away_team.eq.${teamAbbr}`)
            .order('start_time', { ascending: false })
            .limit(10);
            
        // Fetch predictive props for team
        const { data: propsData } = await mlbDb
            .from('pred_props')
            .select('*')
            .eq('team', teamAbbr)
            .order('edge_pts', { ascending: false, nullsFirst: false })
            .limit(10);

        if (teamErr && !dimData) {
            console.warn(`[API/MLB/Teams/${id}] Team not found`);
            return new Response(JSON.stringify({ error: 'Team not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ 
            team: teamData || dimData || { team_id: id, name: id },
            stats: statsData || null,
            games: gamesData || [],
            props: propsData || []
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
            }
        });
    } catch (err) {
        console.error('[API/MLB/Teams/[id]] Unhandled error:', err);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
