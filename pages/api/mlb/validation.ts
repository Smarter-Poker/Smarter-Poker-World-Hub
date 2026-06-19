import { getMlbSupabase } from '../../../utils/supabase/mlb';





async function edgeHandler(req: Request) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const url = new URL(req.url);
        const queryDays = url.searchParams.get('days');
        const days = queryDays ? parseInt(queryDays as string, 10) : null;
        const mlbDb = getMlbSupabase();
        
        let cutoffDate: string | null = null;
        if (days && !isNaN(days)) {
            cutoffDate = new Date(Date.now() - days * 86400000).toISOString();
        }

        const { data: stats, error } = await mlbDb.rpc('get_mlb_validation_stats', {
            cutoff: cutoffDate
        });
            
        if (error) {
            console.error("RPC get_mlb_validation_stats failed:", error.message);
            // Fallback for when RPC is not deployed yet or fails
            return new Response(JSON.stringify({ stats: null }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }
            });
        }
        
        if (!stats || !stats.all || stats.all.count === 0) {
            return new Response(JSON.stringify({ stats: null }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }
            });
        }

        if (days && !isNaN(days)) {
            stats.activeDays = days;
        } else {
            stats.activeDays = null;
        }
        
        return new Response(JSON.stringify({ stats }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
            }
        });
    } catch (err: any) {
        console.error('Error fetching validation stats:', err);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}


import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers.host || 'localhost';
        const url = `${protocol}://${host}${req.url}`;
        
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
    } catch (err: any) {
        console.error('API Polyfill Error:', err);
        res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
}