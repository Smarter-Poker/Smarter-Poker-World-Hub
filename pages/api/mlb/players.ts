import { getMlbSupabase } from '../../../utils/supabase/mlb';





async function edgeHandler(req: Request) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const mlbDb = getMlbSupabase();

        // Fetch Hitters and Pitchers concurrently
        // PostgREST caps responses at 1000 rows regardless of .limit(); page through with
        // .range() so the directory returns the full pool (~1950 hitters / ~1220 pitchers)
        // instead of the first 1000.
        const fetchAllRows = async (build: () => any, pageSize = 1000, maxRows = 20000): Promise<any[]> => {
            let all: any[] = [];
            for (let from = 0; from < maxRows; from += pageSize) {
                const { data, error } = await build().range(from, from + pageSize - 1);
                if (error) throw error;
                const rows = data || [];
                all = all.concat(rows);
                if (rows.length < pageSize) break;
            }
            return all;
        };

        let hitters: any[] = [];
        let pitchers: any[] = [];
        let fetchError = false;
        try {
            [hitters, pitchers] = await Promise.all([
                fetchAllRows(() => mlbDb
                    .from('v_hitter_profile')
                    .select('player_id, full_name, team_id, wrc_plus, woba, pa')
                    .order('wrc_plus', { ascending: false })),
                fetchAllRows(() => mlbDb
                    .from('v_pitcher_profile')
                    .select('player_id, full_name, team_id, fip, siera, bf')
                    .order('fip', { ascending: true })), // Lower FIP is better
            ]);
        } catch (err: any) {
            fetchError = true;
            console.warn('[MLB Players] Profile fetch error:', err?.message || err);
        }

        return new Response(JSON.stringify({
            hitters,
            pitchers,
            fetchError
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
            }
        });
    } catch (err) {
        console.error('Error fetching players:', err);
        return new Response(JSON.stringify({ 
            hitters: [], 
            pitchers: [], 
            fetchError: true 
        }), {
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