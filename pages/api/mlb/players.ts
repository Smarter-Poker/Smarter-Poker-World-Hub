import { getMlbSupabase } from '../../../utils/supabase/mlb';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const mlbDb = getMlbSupabase();

        // Fetch Hitters and Pitchers concurrently
        const [hittersResult, pitchersResult] = await Promise.all([
            mlbDb
                .from('v_hitter_profile')
                .select('player_id, full_name, team_id, wrc_plus, woba, pa')
                .order('wrc_plus', { ascending: false }),
            mlbDb
                .from('v_pitcher_profile')
                .select('player_id, full_name, team_id, fip, siera, bf')
                .order('fip', { ascending: true }) // Lower FIP is better
        ]);

        if (hittersResult.error) {
            console.warn('[MLB Players] Fallback error on v_hitter_profile:', hittersResult.error.message);
        }
        if (pitchersResult.error) {
            console.warn('[MLB Players] Fallback error on v_pitcher_profile:', pitchersResult.error.message);
        }

        return new Response(JSON.stringify({
            hitters: hittersResult.data || [],
            pitchers: pitchersResult.data || [],
            fetchError: false
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
