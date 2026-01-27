/**
 * Check Player Exclusion Status API
 * GET /api/captain/responsible-gaming/check/:playerId
 */
import { createClient } from '@supabase/supabase-js';

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

  const { playerId } = req.query;
  const { venue_id } = req.query;

  try {
    // Check for active exclusions
    let query = supabase
      .from('captain_self_exclusions')
      .select('*')
      .eq('player_id', playerId)
      .eq('exclusion_status', 'active')
      .gte('end_date', new Date().toISOString());

    // Check venue-specific or global exclusions
    if (venue_id) {
      query = query.or(`venue_id.eq.${venue_id},venue_id.is.null`);
    }

    const { data: exclusions, error } = await query;

    if (error) throw error;

    const isExcluded = exclusions && exclusions.length > 0;
    const activeExclusion = isExcluded ? exclusions[0] : null;

    // Also check spending limits
    const { data: limits } = await supabase
      .from('captain_spending_limits')
      .select('*')
      .eq('player_id', playerId)
      .eq('enabled', true)
      .single();

    // Check current spending against limits
    let limitReached = false;
    let limitType = null;

    if (limits) {
      const { data: sessions } = await supabase
        .from('captain_player_sessions')
        .select('buy_in, cash_out')
        .eq('player_id', playerId)
        .gte('check_in_time', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (sessions) {
        const dailyTotal = sessions.reduce((sum, s) => sum + (s.buy_in || 0), 0);
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
