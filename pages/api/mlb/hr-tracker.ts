import { createClient } from '@supabase/supabase-js';

const CURRENT_SEASON = new Date().getFullYear();

// mlb_hr_cache lives in the MAIN smarter.poker Supabase project, not the MLB analytics project
const getMainSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '',
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

export default async function handler(req: Request) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  const url = new URL(req.url);
  const sortBy = url.searchParams.get('sort') || 'due_score';
  const filterStatus = url.searchParams.get('status');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '500', 10), 1000);

  try {
    const supabase = getMainSupabase();
    // Exclude 'ghost' players who are no longer active/refreshed
    const FORTY_EIGHT_HOURS_AGO = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    let query = supabase
      .from('mlb_hr_cache')
      .select('player_id, full_name, team, status, hr, games_played, games_since_hr, games_per_hr, due_score, matchup_due_score, refreshed_at, season')
      .eq('season', CURRENT_SEASON)
      .gte('refreshed_at', FORTY_EIGHT_HOURS_AGO);

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

    return new Response(
      JSON.stringify({
        players: rows,
        total: rows.length,
        season: CURRENT_SEASON,
        updatedAt,
        stale,
        source: 'cache',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[hr-tracker] Fatal error:', err);
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch HR tracker data',
        players: [],
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export const config = {
  runtime: 'edge',
};
