/**
 * Mark All Notifications Read API
 * POST - Mark all user's notifications as read
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { guardUser } from '../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../../src/lib/serverAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  if (req.method !== 'GET') { const _u = await guardUser(req, res); if (!_u) return; }

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
    .from('commander_notifications')
    .update({
      read_at: new Date().toISOString()
    })
    .eq('player_id', user.id)
    .is('read_at', null)
    .select();

  if (error) {
    console.error('Mark all read error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }

  return res.status(200).json({
    success: true,
    data: {
      updated_count: data?.length || 0
    }
  });
  } catch (err) {
    console.error('[pages/api/commander/notifications/mark-all-read.js]', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
