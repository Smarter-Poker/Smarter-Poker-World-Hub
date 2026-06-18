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
        
        // Fetch global stats from agg_model
        const { data: aggModelData, error: aggModelError } = await mlbDb
            .from('agg_model')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1);

        if (aggModelError) {
            console.warn('[API/MLB/ModelIntel] Error fetching agg_model:', aggModelError.message);
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

        const currentIntel = aggModelData && aggModelData.length > 0 ? aggModelData[0] : null;

        return new Response(JSON.stringify({ 
            intel: {
                total_bets_tracked: currentIntel ? currentIntel.total_bets_tracked : (portfolio ? portfolio.reduce((sum, day) => sum + (day.bets_won || 0) + (day.bets_lost || 0), 0) : 0),
                recent_roi: currentIntel ? currentIntel.recent_roi : (portfolio && portfolio.length > 0 ? portfolio[0].roi : 0),
                model_version: currentIntel ? currentIntel.model_version : 'v4.2.1-Edge',
                last_training_date: currentIntel ? currentIntel.last_training_date : new Date().toISOString()
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
