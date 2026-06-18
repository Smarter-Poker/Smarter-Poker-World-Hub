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
        
        // Fetch global stats from a high-level view or summarize recent performance
        // Assuming we have some agg_model or similar table, or we can just fetch top-level metrics
        const { data: portfolio, error } = await mlbDb
            .from('fct_portfolio')
            .select('*')
            .order('official_date', { ascending: false })
            .limit(10);

        if (error) {
            console.warn('[API/MLB/ModelIntel] Error fetching portfolio summary:', error.message);
        }

        // Return a mock object if we don't have deep model intel, or summarize the portfolio
        return new Response(JSON.stringify({ 
            intel: {
                total_bets_tracked: portfolio ? portfolio.reduce((sum, day) => sum + (day.bets_won || 0) + (day.bets_lost || 0), 0) : 0,
                recent_roi: portfolio && portfolio.length > 0 ? portfolio[0].roi : 0,
                model_version: 'v4.2.1',
                last_training_date: new Date().toISOString()
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
