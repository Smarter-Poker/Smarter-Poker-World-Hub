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

        // Call our RPC
        const { data, error } = await mlbDb.rpc('get_best_bets_stats');

        if (error) {
            console.error('RPC Error, falling back to JS aggregation:', error);
            
            // Fallback JS aggregation
            const { data: latestDateData, error: dateErr } = await mlbDb
                .from('pred_best_bets')
                .select('official_date')
                .order('official_date', { ascending: false })
                .limit(1);
                
            if (dateErr) {
                console.warn('[MLB Best Bets] Fallback error on pred_best_bets (table might be missing):', dateErr.message);
                return new Response(JSON.stringify({ bets: [], stats: { totalBets: 0, eliteBets: 0, topScore: 0, topLock: 0 }, officialDate: null }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
                });
            }
            
            if (!latestDateData || latestDateData.length === 0) {
                return new Response(JSON.stringify({ bets: [], stats: { totalBets: 0, eliteBets: 0, topScore: 0, topLock: 0 }, officialDate: null }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
                });
            }
            
            const officialDate = latestDateData[0].official_date;
            
            const { data: bets, error: betsErr } = await mlbDb
                .from('pred_best_bets')
                .select('*')
                .eq('official_date', officialDate)
                .order('rank', { ascending: true });
                
            if (betsErr) {
                console.warn('[MLB Best Bets] Error fetching bets:', betsErr.message);
            }
            
            const betsArr = bets || [];
            
            interface BetRow {
                edge?: number;
                bet_score?: number;
                implied_prob?: number;
                [key: string]: any;
            }

            const totalBets = betsArr.length;
            const eliteBets = betsArr.filter((b: BetRow) => (b.edge || 0) >= 5).length;
            const topScore = betsArr.length > 0 ? Math.max(...betsArr.map((b: BetRow) => b.bet_score || 0)) : 0;
            const topLock = betsArr.length > 0 ? Math.max(...betsArr.map((b: BetRow) => b.win_confidence || 0)) : 0;
            
            return new Response(JSON.stringify({
                bets: betsArr,
                stats: {
                    totalBets,
                    eliteBets,
                    topScore,
                    topLock
                },
                officialDate
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
            });
        }
        
        // Ensure topLock is formatted correctly if it's 0-1
        let topLock = data?.stats?.topLock || 0;
        if (topLock > 0 && topLock <= 1) {
            topLock = topLock * 100;
        }

        return new Response(JSON.stringify({
            bets: data?.bets || [],
            stats: {
                totalBets: data?.stats?.totalBets || 0,
                eliteBets: data?.stats?.eliteBets || 0,
                topScore: data?.stats?.topScore || 0,
                topLock: topLock
            },
            officialDate: data?.officialDate || null
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
        });
    } catch (err: any) {
        console.error('Error fetching best bets API:', err);
        return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
