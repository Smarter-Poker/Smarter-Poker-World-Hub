import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

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
                
            if (dateErr) throw dateErr;
            
            if (!latestDateData || latestDateData.length === 0) {
                return res.status(200).json({ bets: [], stats: { totalBets: 0, eliteBets: 0, topScore: 0, topLock: 0 }, officialDate: null });
            }
            
            const officialDate = latestDateData[0].official_date;
            
            const { data: bets, error: betsErr } = await mlbDb
                .from('pred_best_bets')
                .select('*')
                .eq('official_date', officialDate)
                .order('rank', { ascending: true });
                
            if (betsErr) throw betsErr;
            
            const betsArr = bets || [];
            
            interface BetRow {
                edge_pts?: number;
                bet_score?: number;
                implied_prob?: number;
                [key: string]: any;
            }

            const totalBets = betsArr.length;
            const eliteBets = betsArr.filter((b: BetRow) => (b.edge_pts || 0) >= 5).length;
            const topScore = betsArr.length > 0 ? Math.max(...betsArr.map((b: BetRow) => b.bet_score || 0)) : 0;
            const maxImpliedProb = betsArr.length > 0 ? Math.max(...betsArr.map((b: BetRow) => b.implied_prob || 0)) : 0;
            
            // If implied_prob is typically 0-1, multiply by 100 for the frontend, 
            // but we'll just pass maxImpliedProb as requested.
            const topLock = maxImpliedProb > 1 ? maxImpliedProb : maxImpliedProb * 100;
            
            return res.status(200).json({
                bets: betsArr,
                stats: {
                    totalBets,
                    eliteBets,
                    topScore,
                    topLock
                },
                officialDate
            });
        }
        
        // Ensure topLock is formatted correctly if it's 0-1
        let topLock = data?.stats?.topLock || 0;
        if (topLock > 0 && topLock <= 1) {
            topLock = topLock * 100;
        }

        return res.status(200).json({
            bets: data?.bets || [],
            stats: {
                totalBets: data?.stats?.totalBets || 0,
                eliteBets: data?.stats?.eliteBets || 0,
                topScore: data?.stats?.topScore || 0,
                topLock: topLock
            },
            officialDate: data?.officialDate || null
        });
    } catch (err: any) {
        console.error('Error fetching best bets API:', err);
        return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
}
