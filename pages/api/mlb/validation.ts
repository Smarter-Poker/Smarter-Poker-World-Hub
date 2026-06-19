import { getMlbSupabase } from '../../../utils/supabase/mlb';

export const config = {
    runtime: 'edge',
};




export default async function handler(req: Request) {
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
