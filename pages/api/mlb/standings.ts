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

        const [standingsRes, aggRes] = await Promise.all([
            mlbDb.from('v_mlb_standings').select('*'),
            mlbDb
                .from('agg_team')
                .select('team_id, era, avg, fip')
                .eq('window_kind', 'season')
                .order('created_at', { ascending: false }),
        ]);

        if (standingsRes.error) {
            console.warn('[API/MLB/Standings] Error fetching standings:', standingsRes.error.message);
            return new Response(JSON.stringify({ teams: [] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' }
            });
        }

        // Build a map of latest agg stats per team (ordered desc so first = latest)
        const aggMap = new Map<number, { era: number | null; avg: number | null; fip: number | null }>();
        (aggRes.data || []).forEach((row: any) => {
            if (!aggMap.has(row.team_id)) {
                aggMap.set(row.team_id, { era: row.era, avg: row.avg, fip: row.fip });
            }
        });

        // Merge agg stats into standings (view may already have era/avg if migration ran)
        const teams = (standingsRes.data || []).map((t: any) => {
            const agg = aggMap.get(t.team_id) || {};
            return {
                ...t,
                era: t.era ?? agg.era ?? null,
                team_avg: t.team_avg ?? agg.avg ?? null,
            };
        });

        return new Response(JSON.stringify({ teams }), {
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