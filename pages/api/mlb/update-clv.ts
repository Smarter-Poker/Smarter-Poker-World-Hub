import { getMlbSupabase } from '../../../utils/supabase/mlb';

export const config = {
    runtime: 'edge',
};




export default async function handler(req: Request) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    // Auth check
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.MLB_CRON_SECRET}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        // The Python engine handles CLV updates. This endpoint is maintained for backwards compatibility
        // with existing crons but acts as a no-op to avoid crashing on missing schema columns.
        return new Response(JSON.stringify({ message: 'Success (No-op in Hub)', updated: 0 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error('CLV Update Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
