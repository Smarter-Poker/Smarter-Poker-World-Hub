import { getMlbSupabase } from '../../../utils/supabase/mlb';





async function edgeHandler(req: Request) {
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


import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || 'localhost';
    const url = `${protocol}://${host}${req.url}`;
    
    const requestOptions: RequestInit = {
        method: req.method,
        headers: req.headers as unknown as HeadersInit,
    };
    
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        requestOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
    
    const request = new Request(url, requestOptions);
    const response = await edgeHandler(request);
    
    res.status(response.status);
    response.headers.forEach((value, key) => {
        res.setHeader(key, value);
    });
    
    const text = await response.text();
    if (text) {
        try {
            res.json(JSON.parse(text));
        } catch {
            res.send(text);
        }
    } else {
        res.end();
    }
}
