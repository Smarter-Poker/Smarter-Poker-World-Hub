/**
 * POST /api/notifications/mark-read
 * 
 * Mark one or all notifications as read for the authenticated user.
 * Body: { notificationId } — mark one, or {} — mark all
 * Auth: Bearer token
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Auth required' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  try {
    const { notificationId } = req.body || {};

    if (notificationId) {
      // Mark single notification
      await supabaseAdmin
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('user_id', user.id);
    } else {
      // Mark all unread
      await supabaseAdmin
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('is_read', false);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[mark-read]', err);
    return res.status(500).json({ error: 'Failed to mark notifications' });
  }
}
