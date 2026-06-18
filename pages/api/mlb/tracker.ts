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
            .from('fact_games')
            .select(`
                game_pk,
                official_date,
                first_pitch_utc,
                status,
                away_score,
                home_score,
                away_team:dim_teams!fact_games_away_team_id_fkey(abbr),
                home_team:dim_teams!fact_games_home_team_id_fkey(abbr)
            `)
            .order('first_pitch_utc', { ascending: true });

        if (error) {
            console.warn('[API/MLB/Tracker] Error fetching games from fact_games:', error.message);
            return new Response(JSON.stringify({ games: [] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' }
            });
        }

        const mappedGames = (data || []).map(game => ({
            ...game,
            start_time: game.first_pitch_utc,
            away_team: game.away_team?.abbr || 'TBD',
            home_team: game.home_team?.abbr || 'TBD',
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
