/**
 * Check Player Exclusion Status API
 * GET /api/commander/responsible-gaming/check/:playerId
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Auth guard: require staff auth for write operations
  const _authResult = await guardWriteStaff(req, res);
  if (!_authResult) return;

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed' }
    });
  }

  const { playerId } = req.query;
  const { venue_id } = req.query;

  try {
    // Check for active exclusions (not yet expired + not lifted)
    let query = supabase
      .from('commander_self_exclusions')
      .select('*')
      .eq('player_id', playerId)
      .is('lifted_at', null)
      .gte('expires_at', new Date().toISOString())
          .limit(100);

    // Check venue-specific or global exclusions
    if (venue_id) {
      // BUG #270 FIX: Sanitize to prevent PostgREST filter injection
      const safeVenueId = String(venue_id).replace(/[^a-zA-Z0-9-]/g, '');
      if (safeVenueId) {
        query = query.or(`venue_id.eq.${safeVenueId},venue_id.is.null`)
            .limit(100);
      }
    }

    const { data: exclusions, error } = await query;

    if (error) throw error;

    const isExcluded = exclusions && exclusions.length > 0;
    const activeExclusion = isExcluded ? exclusions[0] : null;

    // Also check spending limits (all limits are active if they exist)
    const { data: limits } = await supabase
      .from('commander_spending_limits')
      .select('*')
      .eq('player_id', playerId)
      .single();

    // Check current spending against limits
    let limitReached = false;
    let limitType = null;

    if (limits) {
      const { data: sessions } = await supabase
        .from('commander_player_sessions')
        .select('total_buyin')
        .eq('player_id', playerId)
        .gte('check_in_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (sessions) {
        const dailyTotal = sessions.reduce((sum, s) => sum + (s.total_buyin || 0), 0);
        if (limits.daily_limit && dailyTotal >= limits.daily_limit) {
          limitReached = true;
          limitType = 'daily';
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        is_excluded: isExcluded,
        exclusion: activeExclusion,
        limit_reached: limitReached,
        limit_type: limitType,
        can_play: !isExcluded && !limitReached
      }
    });
  } catch (error) {
    console.error('Check exclusion error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to check status' }
    });
  }
}
