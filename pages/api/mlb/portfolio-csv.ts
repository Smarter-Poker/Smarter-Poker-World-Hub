import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const { days: daysQuery, market: marketQuery } = req.query;
        const daysStr = Array.isArray(daysQuery) ? daysQuery[0] : daysQuery;
        const marketStr = Array.isArray(marketQuery) ? marketQuery[0] : marketQuery;
        const parsedDays = (daysStr && daysStr !== '' && !isNaN(parseInt(daysStr, 10))) ? parseInt(daysStr, 10) : undefined;
        if (parsedDays !== undefined && parsedDays < 0) {
            return res.status(400).send('Bad Request: Days cannot be negative');
        }
        const parsedMarket = marketStr && marketStr.toUpperCase() !== 'ALL' ? marketStr.toUpperCase() : undefined;

        const mlbDb = getMlbSupabase();

        let allBets: any[] = [];
        let hasMore = true;
        let page = 0;
        const PAGE_SIZE = 1000;

        // Anchor the rolling window to the latest bet (mirrors get_portfolio_stats RPC),
        // so a filtered export matches exactly what the page shows for the same filters.
        let anchorCutoffIso: string | undefined;
        if (parsedDays !== undefined && !isNaN(parsedDays)) {
            let maxQuery = mlbDb
                .from('sim_bets')
                .select('as_of_ts')
                .order('as_of_ts', { ascending: false })
                .limit(1);
            if (parsedMarket) {
                maxQuery = maxQuery.eq('market', parsedMarket);
            }
            const { data: maxRow, error: maxError } = await maxQuery.maybeSingle();
            if (maxError) {
                console.error('[CSV Export] maxQuery error:', maxError.message);
                return res.status(500).send('Internal Server Error: Anchor Query Failed');
            }
            if (maxRow?.as_of_ts) {
                const anchor = new Date(maxRow.as_of_ts);
                if (!isNaN(anchor.getTime())) {
                    anchor.setDate(anchor.getDate() - parsedDays);
                    anchorCutoffIso = anchor.toISOString();
                }
            }
        }

        while (hasMore) {
            let pageQuery = mlbDb
                .from('sim_bets')
                .select('id, as_of_ts, pnl, result, stake, bankroll_after, market, selection, edge_pts, bet_score, bet_tier');
            if (anchorCutoffIso) {
                pageQuery = pageQuery.gte('as_of_ts', anchorCutoffIso);
            }
            if (parsedMarket) {
                pageQuery = pageQuery.eq('market', parsedMarket);
            }

            const { data, error } = await pageQuery
                .order('as_of_ts', { ascending: true })
                .order('id', { ascending: true })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

            if (error) {
                console.error('[CSV Export] fetch error:', error.message);
                return res.status(500).send('Internal Server Error: DB Query Failed');
            }

            if (data && data.length > 0) {
                allBets.push(...data);
                if (data.length < PAGE_SIZE) {
                    hasMore = false;
                } else {
                    page++;
                }
            } else {
                hasMore = false;
            }
        }

        const headers = ['id', 'as_of_ts', 'market', 'selection', 'bet_score', 'bet_tier', 'result', 'stake', 'edge_pts', 'pnl', 'bankroll_after'];
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

        const csvContent = headers.join(',') + '\n' + rows.join('\n');

        const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
        const todayStr = formatter.format(new Date());

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=mlb_portfolio_export_${todayStr}.csv`);
        res.status(200).send(csvContent);

    } catch (err: any) {
        console.error('[MLB Portfolio CSV] Exception:', err);
        return res.status(500).send('Internal Server Error');
    }
}
