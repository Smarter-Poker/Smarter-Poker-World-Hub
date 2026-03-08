/**
 * Commander My Waitlists API - GET /api/commander/waitlist/my
 * Get current user's waitlist entries
 * Reference: API_REFERENCE.md - Waitlist section
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, LIMITS.read)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  try {
    // Get authenticated user via JWT (consistent with all other routes)
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
      });
    }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Invalid token' }
      });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
      });
    }

    // Get user's waitlist entries
    const { data: entries, error } = await supabase
      .from('commander_waitlist')
      .select(`
        *,
        poker_venues (
          id,
          name,
          city,
          state,
          phone
        ),
        commander_games (
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
      console.error('Commander my waitlists query error:', error);
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
      game: entry.commander_games,
      position: entry.position,
      estimated_wait: entry.estimated_wait_minutes
    }));

    return res.status(200).json({
      success: true,
      data: { entries: formattedEntries }
    });
  } catch (error) {
    console.error('Commander my waitlists API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
