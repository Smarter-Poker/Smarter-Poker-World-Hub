import { getMlbSupabase } from '../../../utils/supabase/mlb';

export const config = {
    runtime: 'edge',
};




export default async function handler(req: Request) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {

        const mlbDb = getMlbSupabase();
        
        // Formatter for 'today' in US Central Time (America/Chicago)
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const todayStr = formatter.format(new Date());

        const [
            topBetsResult,
            pipelineResult,
            slateResult
        ] = await Promise.all([
            mlbDb.from('pred_best_bets').select('*').eq('official_date', todayStr).order('rank', { ascending: true }).limit(3),
            mlbDb.from('pred_props').select('as_of_ts').order('as_of_ts', { ascending: false }).limit(1),
            // raw_games for game slate
            mlbDb.from('raw_games').select('*').eq('official_date', todayStr).order('event_time', { ascending: true })
        ]);

        if (slateResult.error) {
            console.error('[API/MLB/Dashboard] Error fetching slateGames:', slateResult.error);
            throw new Error(`Failed to fetch slate games: ${slateResult.error.message}`);
        }

        const lastUpdate = pipelineResult.data && pipelineResult.data.length > 0 ? pipelineResult.data[0].as_of_ts : null;

        return new Response(JSON.stringify({
            todayStr,
            topBets: topBetsResult.data || [],
            lastUpdate,
            slateGames: slateResult.data || []
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
            }
        });

    } catch (error: any) {
        console.error('[API/MLB/Dashboard] Error fetching dashboard data:', error);
        return new Response(JSON.stringify({ error: error?.message || 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
