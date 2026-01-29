/**
 * Escrow List API
 * GET /api/commander/escrow - List escrow transactions for a group or event
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

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authorization required' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid token' }
      });
    }

    const { group_id, event_id, status, limit = 50, offset = 0 } = req.query;

    if (!group_id && !event_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'group_id or event_id required' }
      });
    }

    // Verify user is host of the group
    if (group_id) {
      const { data: group, error: groupError } = await supabase
        .from('commander_home_game_groups')
        .select('id, host_id')
        .eq('id', group_id)
        .single();

      if (groupError || !group) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Group not found' }
        });
      }

      if (group.host_id !== user.id) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only host can view escrow transactions' }
        });
      }
    }

    let query = supabase
      .from('commander_escrow')
      .select(`
        *,
        profiles:player_id (id, display_name, avatar_url)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (group_id) {
      query = query.eq('group_id', group_id);
    }

    if (event_id) {
      query = query.eq('event_id', event_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    // Map profile data to player_name for convenience
    const transactions = (data || []).map(t => ({
      ...t,
      player_name: t.profiles?.display_name || t.player_name || 'Player'
    }));

    return res.status(200).json({
      success: true,
      data: {
        transactions,
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('List escrow error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to list transactions' }
    });
  }
}
