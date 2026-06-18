import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const { days, market } = req.query;
        const parsedDays = days && typeof days === 'string' ? parseInt(days, 10) : undefined;
        const parsedMarket = market && typeof market === 'string' && market !== 'ALL' ? market : undefined;

        const mlbDb = getMlbSupabase();
        
        let allBets: any[] = [];
        let hasMore = true;
        let page = 0;
        const PAGE_SIZE = 1000;

        while (hasMore) {
            let pageQuery = mlbDb.from('sim_bets').select('id, as_of_ts, pnl, result, stake, bankroll_after, market, selection, edge_pts');
            if (parsedDays && !isNaN(parsedDays)) {
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - parsedDays);
                pageQuery = pageQuery.gte('as_of_ts', cutoffDate.toISOString());
            }
            if (parsedMarket) {
                pageQuery = pageQuery.eq('market', parsedMarket);
            }

            const { data, error } = await pageQuery
                .order('as_of_ts', { ascending: true })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
                
            if (error) {
                console.error('[CSV Export] fetch error:', error.message);
                return res.status(500).send('Internal Server Error: DB Query Failed');
            }
            
            if (data && data.length > 0) {
                allBets = [...allBets, ...data];
                if (data.length < PAGE_SIZE) {
                    hasMore = false;
                } else {
                    page++;
                }
            } else {
                hasMore = false;
            }
        }

        const headers = ['id', 'as_of_ts', 'market', 'selection', 'result', 'stake', 'edge_pts', 'pnl', 'bankroll_after'];
        const rows = allBets.map(bet => {
            return headers.map(header => {
                const val = bet[header];
                if (val === null || val === undefined) return '';
                if (typeof val === 'string') {
                    return `"${val.replace(/"/g, '""')}"`;
                }
                return val;
            }).join(',');
        });
        
        const csvContent = [headers.join(','), ...rows].join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=mlb_portfolio_export_${new Date().toISOString().split('T')[0]}.csv`);
        res.status(200).send(csvContent);
        
    } catch (err: any) {
        console.error('[MLB Portfolio CSV] Exception:', err);
        return res.status(500).send('Internal Server Error');
    }
}
