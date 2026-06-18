import { getMlbSupabase } from '../../../utils/supabase/mlb';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
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
