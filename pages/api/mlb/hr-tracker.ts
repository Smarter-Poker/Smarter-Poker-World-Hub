import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const CURRENT_SEASON = new Date().getFullYear();

// mlb_hr_cache lives in the MAIN smarter.poker Supabase project, not the MLB analytics project
const getMainSupabase = () => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '',
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

const supabase = getMainSupabase();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const sortBy = (req.query.sort as string) || 'due_score';
    const filterStatus = req.query.status as string | undefined;
    const limit = Math.min(parseInt((req.query.limit as string) || '500', 10), 1000);

    try {
        let query = supabase
            .from('mlb_hr_cache')
            .select('*')
            .eq('season', CURRENT_SEASON);

        if (filterStatus && filterStatus !== 'ALL') {
            query = query.eq('status', filterStatus.toUpperCase());
        }

        // Mapping front-end sort keys to DB columns
        switch (sortBy) {
            case 'due_score':
                query = query.order('due_score', { ascending: false });
                break;
            case 'hr':
                query = query.order('hr', { ascending: false });
                break;
            case 'games_since_hr':
                query = query.order('games_since_hr', { ascending: false });
                break;
            case 'games_per_hr':
                query = query.order('games_per_hr', { ascending: true });
                break;
            case 'full_name':
                query = query.order('full_name', { ascending: true });
                break;
            default:
                query = query.order('due_score', { ascending: false });
                break;
        }

        query = query.limit(limit);

        const { data, error } = await query;

        if (error) {
            console.error('[hr-tracker] Supabase error:', error.message);
            throw new Error(`Cache error: ${error.message}`);
        }

        const updatedAt = (data && data.length > 0) ? data[0].refreshed_at : new Date().toISOString();

        return res.status(200).json({
            players: data || [],
            total: data ? data.length : 0,
            season: CURRENT_SEASON,
            updatedAt,
            source: 'cache'
        });
    } catch (err: any) {
        console.error('[hr-tracker] Fatal error:', err);
        return res.status(500).json({
            error: 'Failed to fetch HR tracker data',
            players: [],
        });
    }
}
