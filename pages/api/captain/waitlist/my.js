/**
 * Captain My Waitlists API - GET /api/captain/waitlist/my
 * Get current user's waitlist entries
 * Reference: API_REFERENCE.md - Waitlist section
 */
import { createClient } from '@supabase/supabase-js';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  try {
    // Get authenticated user
    const supabaseServerClient = createPagesServerClient({ req, res });
    const { data: { user } } = await supabaseServerClient.auth.getUser();

    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
      });
    }

    // Get user's waitlist entries
    const { data: entries, error } = await supabase
      .from('captain_waitlist')
      .select(`
        *,
        poker_venues (
          id,
          name,
          city,
          state,
          phone
        ),
        captain_games (
          id,
          status,
          current_players,
          max_players
        )
      `)
      .eq('player_id', user.id)
      .in('status', ['waiting', 'called'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Captain my waitlists query error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to fetch waitlists' }
      });
    }

    // Format response
    const formattedEntries = (entries || []).map(entry => ({
      waitlist_entry: {
        id: entry.id,
        game_type: entry.game_type,
        stakes: entry.stakes,
        status: entry.status,
        call_count: entry.call_count,
        last_called_at: entry.last_called_at,
        created_at: entry.created_at
      },
      venue: entry.poker_venues,
      game: entry.captain_games,
      position: entry.position,
      estimated_wait: entry.estimated_wait_minutes
    }));

    return res.status(200).json({
      success: true,
      data: { entries: formattedEntries }
    });
  } catch (error) {
    console.error('Captain my waitlists API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
