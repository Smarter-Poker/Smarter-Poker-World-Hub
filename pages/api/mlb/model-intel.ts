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
        
        // Fetch recent backtest summary for history and global stats
        const { data: summary, error: summaryError } = await mlbDb
            .from('v_backtest_summary')
            .select('*')
            .order('date', { ascending: false })
            .limit(10);

        if (summaryError) {
            console.warn('[API/MLB/ModelIntel] Error fetching backtest summary:', summaryError.message);
        }

        const asOfTs = summary && summary.length > 0 ? summary[0].date : new Date().toISOString().split('T')[0];

        return new Response(JSON.stringify({ 
            intel: {
                total_bets_tracked: summary ? summary.reduce((sum, day) => sum + (day.bets_won || 0) + (day.bets_lost || 0), 0) : 0,
                recent_roi: summary && summary.length > 0 ? summary[0].roi : 0,
                model_version: 'v4.2.1-Edge',
                last_training_date: asOfTs
            },
            history: summary || []
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
