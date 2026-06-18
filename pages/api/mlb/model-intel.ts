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
        
        // Fetch global stats from pred_props for freshness
        const { data: latestPred, error: predError } = await mlbDb
            .from('pred_props')
            .select('as_of_ts')
            .order('as_of_ts', { ascending: false })
            .limit(1);

        if (predError) {
            console.warn('[API/MLB/ModelIntel] Error fetching pred_props:', predError.message);
        }

        // Fetch recent portfolio for history
        const { data: portfolio, error: portfolioError } = await mlbDb
            .from('fct_portfolio')
            .select('*')
            .order('official_date', { ascending: false })
            .limit(10);

        if (portfolioError) {
            console.warn('[API/MLB/ModelIntel] Error fetching portfolio summary:', portfolioError.message);
        }

        const asOfTs = latestPred && latestPred.length > 0 ? latestPred[0].as_of_ts : new Date().toISOString();

        return new Response(JSON.stringify({ 
            intel: {
                total_bets_tracked: portfolio ? portfolio.reduce((sum, day) => sum + (day.bets_won || 0) + (day.bets_lost || 0), 0) : 0,
                recent_roi: portfolio && portfolio.length > 0 ? portfolio[0].roi : 0,
                model_version: 'v4.2.1-Edge',
                last_training_date: asOfTs
            },
            history: portfolio || []
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
            }
        });
    } catch (err) {
        console.error('[API/MLB/ModelIntel] Unhandled error:', err);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
