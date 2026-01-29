/**
 * Player Notifications API
 * GET /api/commander/notifications/my
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

  // Get player from auth header
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
    });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Invalid token' }
      });
    }

    const { unread_only, limit = 50 } = req.query;

    let query = supabase
      .from('commander_notifications')
      .select(`
        *,
        poker_venues (id, name)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (unread_only === 'true') {
      query = query.eq('is_read', false);
    }

    const { data: notifications, error } = await query;

    if (error) throw error;

    // Count unread
    const { count: unreadCount } = await supabase
      .from('commander_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    return res.status(200).json({
      success: true,
      data: {
        notifications: notifications || [],
        unread_count: unreadCount || 0
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch notifications' }
    });
  }
}
