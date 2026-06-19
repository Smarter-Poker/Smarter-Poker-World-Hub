import { getMlbSupabase } from '../../../utils/supabase/mlb';
import { fetchPortfolioStats } from '../../../utils/mlbStats';





async function edgeHandler(req: Request) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const url = new URL(req.url);
        const days = url.searchParams.get('days');
        const market = url.searchParams.get('market');
        const parsedDays = days ? parseInt(days as string, 10) : undefined;
        const parsedMarket = market ? market as string : undefined;

        const mlbDb = getMlbSupabase();
        const stats = await fetchPortfolioStats(mlbDb, parsedDays, parsedMarket);

        return new Response(JSON.stringify(stats), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
            }
        });

    } catch (err: any) {
        console.error('[MLB Portfolio API] Exception:', err);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
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
