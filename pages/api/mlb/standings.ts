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
        
        const { data, error } = await mlbDb
            .from('v_mlb_standings')
            .select('*');

        if (error) {
            console.warn('[API/MLB/Standings] Error fetching standings:', error.message);
            return new Response(JSON.stringify({ teams: [] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' }
            });
        }

        return new Response(JSON.stringify({ 
            teams: data || []
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200'
            }
        });
    } catch (err) {
        console.error('[API/MLB/Standings] Unhandled error:', err);
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
