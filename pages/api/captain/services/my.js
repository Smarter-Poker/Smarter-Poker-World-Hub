/**
 * Player Service Requests API
 * GET /api/captain/services/my - Get player's own service requests
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
      .from('captain_service_requests')
      .select(`
        *,
        poker_venues:venue_id (id, name),
        captain_tables:table_id (id, table_number),
        captain_staff:assigned_to (id, display_name)
      `, { count: 'exact' })
      .eq('player_id', user.id)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: requests, error, count } = await query;

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: {
        requests: requests || [],
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Get my services error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch service requests' }
    });
  }
}
