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
        
        // Fetch from fact_games table, joining dim_teams to get abbreviations
        // Sorting by first_pitch_utc to show live/upcoming games first
        const { data, error } = await mlbDb
            .from('fct_games')
            .select('*')
            .order('start_time', { ascending: true });

        if (error) {
            console.warn('[API/MLB/Tracker] Error fetching games from fct_games:', error.message);
            return new Response(JSON.stringify({ games: [] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' }
            });
        }

        const mappedGames = (data || []).map(game => ({
            ...game,
            start_time: game.first_pitch_utc,
            away_team: Array.isArray(game.away_team) ? game.away_team[0]?.abbr : (game.away_team as any)?.abbr || 'TBD',
            home_team: Array.isArray(game.home_team) ? game.home_team[0]?.abbr : (game.home_team as any)?.abbr || 'TBD',
            inning: 'Top 1',
            inning_state: 'Top'
        }));

        return new Response(JSON.stringify({ 
            games: mappedGames 
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120'
            }
        });
    } catch (err) {
        console.error('[API/MLB/Tracker] Unhandled error:', err);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
