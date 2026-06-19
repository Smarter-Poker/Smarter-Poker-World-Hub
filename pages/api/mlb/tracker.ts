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
        
        const todayStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());

        const { data, error } = await mlbDb
            .from('raw_games')
            .select('*')
            .gte('start_time', `${todayStr}T00:00:00Z`)
            .order('start_time', { ascending: true })
            .limit(50);

        if (error) {
            console.warn('[API/MLB/Tracker] Error fetching games from raw_games:', error.message);
            return new Response(JSON.stringify({ games: [] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' }
            });
        }

        const mappedGames = (data || []).map(game => ({
            ...game,
            start_time: game.start_time,
            away_team: game.away_team || 'TBD',
            home_team: game.home_team || 'TBD',
            inning: game.inning || '',
            inning_state: game.inning_state || ''
        }));

        return new Response(JSON.stringify({ 
            games: mappedGames 
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120'
            }
        });
    } catch (err) {
        console.error('[API/MLB/Tracker] Unhandled error:', err);
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