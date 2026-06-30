import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const CURRENT_SEASON = new Date().getFullYear();

// mlb_hr_cache lives in the MAIN smarter.poker Supabase project, not the MLB analytics project
const getMainSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '',
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sortBy = (req.query.sort as string) || 'due_score';
  const filterStatus = req.query.status as string | undefined;
  const limit = parseInt((req.query.limit as string) || '500', 10);

  try {
    const supabase = getMainSupabase();
    // Exclude 'ghost' players who are no longer active/refreshed
    const FORTY_EIGHT_HOURS_AGO = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    let query = supabase.from('mlb_hr_cache').select('*').eq('season', CURRENT_SEASON).gte('refreshed_at', FORTY_EIGHT_HOURS_AGO);

    if (filterStatus && filterStatus !== 'ALL') {
      query = query.eq('status', filterStatus.toUpperCase());
    }

    // Mapping front-end sort keys to DB columns
    switch (sortBy) {
      case 'due_score':
        query = query.order('due_score', { ascending: false });
        break;
      case 'matchup_due_score':
        query = query.order('matchup_due_score', { ascending: false, nullsFirst: false });
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

    const rows = data || [];
    // Use the freshest refresh timestamp across all rows (a partial refresh
    // can leave mixed timestamps; the newest reflects the last write).
    const updatedAt =
      rows.length > 0
        ? rows.reduce(
            (max: string, r: any) =>
              r.refreshed_at && r.refreshed_at > max ? r.refreshed_at : max,
            rows[0].refreshed_at
          )
        : null;
    // Flag stale data so the UI can warn when the daily refresh hasn't run.
    const STALE_AFTER_MS = 36 * 60 * 60 * 1000; // 36h (daily cron + buffer)
    const stale = updatedAt ? Date.now() - new Date(updatedAt).getTime() > STALE_AFTER_MS : true;

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json({
      players: rows,
      total: rows.length,
      season: CURRENT_SEASON,
      updatedAt,
      stale,
      source: 'cache',
    });
  } catch (err: any) {
    console.error('[hr-tracker] Fatal error:', err);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(500).json({
      error: 'Failed to fetch HR tracker data',
      players: [],
    });
  }
}
