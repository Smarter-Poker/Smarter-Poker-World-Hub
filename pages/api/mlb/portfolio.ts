import { getMlbSupabase } from '../../../utils/supabase/mlb';
import { fetchPortfolioStats } from '../../../utils/mlbStats';



export default async function handler(req: Request) {
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
