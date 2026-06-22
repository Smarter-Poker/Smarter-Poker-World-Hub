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
        
        if (days !== null && days !== undefined && days !== '' && isNaN(parseInt(days as string, 10))) {
            return new Response(JSON.stringify({ error: 'Bad Request: Invalid days parameter' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const parsedDays = (days && !isNaN(parseInt(days as string, 10))) ? parseInt(days as string, 10) : undefined;
        const parsedMarket = market ? market as string : undefined;

        const mlbDb = getMlbSupabase();
        const stats = await fetchPortfolioStats(mlbDb, parsedDays, parsedMarket);

        return new Response(JSON.stringify(stats), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900'
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
    try {
        const forwardedProto = req.headers['x-forwarded-proto'];
        const rawProtocol = Array.isArray(forwardedProto) ? forwardedProto[0] : (forwardedProto || 'http');
        const protocol = rawProtocol.split(',')[0].trim();
        const host = req.headers.host || 'localhost';
        
        let url: string;
        try {
            url = new URL(`${protocol}://${host}${req.url || '/'}`).toString();
        } catch (e) {
            return res.status(400).json({ error: 'Bad Request: Malformed URL' });
        }
        
        // Safely convert headers to Record<string, string>
        const safeHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
            if (Array.isArray(value)) {
                safeHeaders[key] = value.join(', ');
            } else if (value !== undefined) {
                safeHeaders[key] = value;
            }
        }
        
        const requestOptions: RequestInit = {
            method: req.method,
            headers: safeHeaders,
        };
        
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            try {
                requestOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
            } catch (e) {
                return res.status(400).json({ error: 'Bad Request: Unserializable body' });
            }
        }
        
        let request: Request;
        try {
            request = new Request(url, requestOptions);
        } catch (e) {
            return res.status(400).json({ error: 'Bad Request: Invalid Edge Request' });
        }
        
        const response = await edgeHandler(request);
        
        res.status(response.status);
        response.headers.forEach((value, key) => {
            if (key.toLowerCase() === 'set-cookie') {
                res.setHeader(key, value.split(/(?<!Expires=\w{3},\s\d{2}\s\w{3}\s\d{4}\s\d{2}:\d{2}:\d{2}\sGMT),\s/i));
            } else {
                res.setHeader(key, value);
            }
        });
        
        let text: string;
        try {
            text = await response.text();
        } catch (streamErr) {
            console.error('API Stream Error:', streamErr);
            return res.status(500).json({ error: 'Stream failed to decode' });
        }
        
        if (text) {
            try {
                res.json(JSON.parse(text));
            } catch {
                res.send(text);
            }
        } else {
            res.end();
        }
    } catch (err: any) {
        console.error('API Polyfill Error:', err);
        res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
}