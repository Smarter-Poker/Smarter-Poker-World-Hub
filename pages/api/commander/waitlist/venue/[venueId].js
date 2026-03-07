/**
 * Commander Venue Waitlist API - GET /api/commander/waitlist/venue/:venueId [Public]
 * Get all waitlists at a venue
 * Reference: API_REFERENCE.md - Waitlist section
 */
import { createClient } from '../../../../../src/lib/supabaseServerClient';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed' }
    });
  }

  const { venueId } = req.query;

  if (!venueId) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Venue ID required' }
    });
  }

  try {
    // ═══ Auto-cleanup: delete expired web entries (>1 hour, not checked in) ═══
    try {
      const expiryTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await supabase
        .from('commander_waitlist')
        .delete()
        .eq('venue_id', venueId)
        .eq('signup_method', 'web')
        .eq('status', 'waiting')
        .is('checked_in_at', null)
        .lt('created_at', expiryTime);
    } catch (cleanupErr) { /* non-critical */ }

    // Get all waiting entries at venue
    const { data: entries, error } = await supabase
      .from('commander_waitlist')
      .select('*')
      .eq('venue_id', venueId)
      .in('status', ['waiting', 'called'])
      .order('position', { ascending: true })
          .limit(100)

    if (error) {
      console.error('Commander venue waitlist query error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to fetch waitlist' }
      });
    }

    // Group by game type and stakes
    const waitlistMap = {};
    (entries || []).forEach(entry => {
      const key = `${entry.game_type}-${entry.stakes}`;
      if (!waitlistMap[key]) {
        waitlistMap[key] = {
          game_type: entry.game_type,
          stakes: entry.stakes,
          players: [],
          count: 0,
          estimated_wait: 0
        };
      }
      waitlistMap[key].players.push({
        id: entry.id,
        position: entry.position,
        player_name: entry.player_name || 'Player',
        status: entry.status,
        signup_method: entry.signup_method,
        call_count: entry.call_count,
        created_at: entry.created_at
      });
      waitlistMap[key].count++;
    });

    // Calculate estimated wait for each waitlist
    const waitlists = Object.values(waitlistMap).map(wl => {
      // Estimate: last position * 15 minutes
      const lastPosition = wl.players.length > 0
        ? Math.max(...wl.players.map(p => p.position))
        : 0;
      return {
        ...wl,
        estimated_wait: lastPosition * 15
      };
    });

    return res.status(200).json({
      success: true,
      data: { waitlists }
    });
  } catch (error) {
    console.error('Commander venue waitlist API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
