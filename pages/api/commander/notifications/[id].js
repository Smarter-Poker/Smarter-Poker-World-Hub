/**
 * Notification Detail API
 * PATCH - Mark notification as read
 * DELETE - Delete a notification
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

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

  if (req.method === 'PATCH') {
    // Mark notification as read
    const { read_at } = req.body;

    const { data, error } = await supabase
      .from('commander_notifications')
      .update({ read_at: read_at || new Date().toISOString() })
      .eq('id', id)
      .eq('player_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Mark read error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, data: { notification: data } });
  }

  if (req.method === 'DELETE') {
    // Delete notification
    const { error } = await supabase
      .from('commander_notifications')
      .delete()
      .eq('id', id)
      .eq('player_id', user.id);

    if (error) {
      console.error('Delete error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
