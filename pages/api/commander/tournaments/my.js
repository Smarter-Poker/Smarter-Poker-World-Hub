/**
 * My Tournament Registrations API
 * GET /api/commander/tournaments/my - Get player's tournament registrations
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
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' }
    });
  }

  try {
    const { status, limit = 20, offset = 0 } = req.query;

    let query = supabase
      .from('commander_tournament_entries')
      .select(`
        id,
        entry_number,
        buyin_amount,
        entry_status,
        registered_at,
        finish_position,
        prize_amount,
        commander_tournaments:tournament_id (
          id,
          name,
          status,
          scheduled_start,
          buyin_amount,
          buyin_fee,
          guaranteed_prizepool,
          actual_prizepool,
          total_entries,
          max_entries,
          poker_venues:venue_id (id, name, city, state)
        )
      `, { count: 'exact' })
      .eq('player_id', user.id)
      .order('registered_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) {
      query = query.eq('entry_status', status);
    }

    const { data: registrations, error, count } = await query;

    if (error) throw error;

    // Format response
    const formattedRegistrations = registrations?.map(r => ({
      id: r.id,
      entry_number: r.entry_number,
      buyin_amount: r.buyin_amount,
      status: r.entry_status,
      registered_at: r.registered_at,
      finish_position: r.finish_position,
      prize_amount: r.prize_amount,
      tournament_id: r.commander_tournaments?.id,
      tournament_name: r.commander_tournaments?.name,
      tournament_status: r.commander_tournaments?.status,
      scheduled_start: r.commander_tournaments?.scheduled_start,
      buyin: r.commander_tournaments?.buyin_amount,
      fee: r.commander_tournaments?.buyin_fee,
      prizepool: r.commander_tournaments?.actual_prizepool || r.commander_tournaments?.guaranteed_prizepool,
      entries: r.commander_tournaments?.total_entries,
      max_entries: r.commander_tournaments?.max_entries,
      venue: r.commander_tournaments?.poker_venues
    })) || [];

    return res.status(200).json({
      success: true,
      data: {
        registrations: formattedRegistrations,
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Get my tournaments error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to get tournament registrations' }
    });
  }
}
