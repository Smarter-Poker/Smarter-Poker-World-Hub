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
        
        // Fetch from raw_games table
        // Sorting by start_time to show live/upcoming games first
        const { data, error } = await mlbDb
            .from('raw_games')
            .select('*')
            .order('start_time', { ascending: true });

        if (error) {
            console.warn('[API/MLB/Tracker] Error fetching games from raw_games:', error.message);
            return new Response(JSON.stringify({ games: [] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' }
            });
        }

        const mappedGames = (data || []).map(game => ({
            ...game,
            start_time: game.start_time,
            away_team: game.away_team || 'TBD',
            home_team: game.home_team || 'TBD',
            inning: game.inning || '',
            inning_state: game.inning_state || ''
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
