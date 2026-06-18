import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

        const mlbDb = getMlbSupabase();
        
        const { data: summaryData, error: sumErr } = await mlbDb
            .from('v_backtest_summary')
            .select('*')
            .order('date', { ascending: false });
            
        if (sumErr) throw sumErr;
        
        let totalN = 0;
        let sumBrier = 0;
        let brierCount = 0;
        let sumClv = 0;
        let clvCount = 0;
        
        // For accurate ROI, we sum the total profit and divide by total bets placed
        let totalProfit = 0;
        let totalBets = 0;

        interface BacktestRow {
            n: number | null;
            brier: number | null;
            avg_clv: number | null;
            sum_unit_profit: number | null;
            bet_count: number | null;
            [key: string]: any;
        }

        const tableData: BacktestRow[] = [];

        (summaryData || []).forEach((row: BacktestRow) => {
            if (!row.n) return;
            totalN += row.n;
            
            if (row.brier !== null) {
                sumBrier += row.brier;
                brierCount++;
            }
            if (row.avg_clv !== null) {
                sumClv += row.avg_clv;
                clvCount++;
            }
            if (row.sum_unit_profit !== null && row.bet_count !== null) {
                totalProfit += row.sum_unit_profit;
                totalBets += row.bet_count;
            }
            tableData.push(row);
        });

        const avgClv = clvCount > 0 ? (sumClv / clvCount).toFixed(2) : '0.00';
        const avgRoi = totalBets > 0 ? ((totalProfit / totalBets) * 100).toFixed(1) : '0.0';
        const avgBrier = brierCount > 0 ? (sumBrier / brierCount).toFixed(3) : '0.000';

        return res.status(200).json({
            tableData,
            kpi: {
                n: totalN,
                clv: avgClv,
                roi: avgRoi,
                brier: avgBrier
            }
        });
    } catch (error) {
        console.error('[API/MLB/Accuracy] Error fetching backtest summary:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
