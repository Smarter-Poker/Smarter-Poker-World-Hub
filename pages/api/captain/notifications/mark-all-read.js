/**
 * Mark All Notifications Read API
 * POST - Mark all user's notifications as read
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Verify auth
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }

  // Mark all unread notifications as read
  const { data, error } = await supabase
    .from('captain_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('player_id', user.id)
    .is('read_at', null)
    .select();

  if (error) {
    console.error('Mark all read error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }

  return res.status(200).json({
    success: true,
    data: {
      updated_count: data?.length || 0
    }
  });
}
