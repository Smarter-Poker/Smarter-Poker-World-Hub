/**
 * /api/horses/hg-onboarding-status
 * GET ?userId=<uuid>  → fn_get_home_games_onboarding_status_admin
 *
 * ADMIN-ONLY (admin|superadmin|god). Customer-support lookup.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

const ADMIN_ROLES = ['admin', 'superadmin', 'god'];

let _sb = null;
function getSB() {
  if (!_sb) {
    _sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return _sb;
}

async function requireAdmin(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ error: 'Authorization required' }); return null; }
  const { data: authData, error } = await getSB().auth.getUser(token);
  if (error || !authData?.user) { res.status(401).json({ error: 'Invalid token' }); return null; }
  const { data: profile } = await getSB().from('profiles').select('role').eq('id', authData.user.id).maybeSingle();
  if (!profile || !ADMIN_ROLES.includes(profile.role)) {
    res.status(403).json({ error: 'Admin access required' }); return null;
  }
  return authData.user;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const user = await requireAdmin(req, res);
    if (!user) return;

    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId query param required' });
    }

    const { data, error } = await getSB().rpc('fn_get_home_games_onboarding_status_admin', {
      p_caller_user_id: user.id,
      p_target_user_id: userId,
    });
    if (error) {
      console.warn('[hg-onboarding-status GET]', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    return res.status(200).json({ success: true, status: data });
  } catch (err) {
    console.warn('[hg-onboarding-status] Unhandled error:', err?.message || err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
