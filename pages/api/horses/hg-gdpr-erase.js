/**
 * /api/horses/hg-gdpr-erase
 * POST { userId, confirmed: true } → fn_anonymize_hg_user_content
 *
 * ADMIN-ONLY (admin|superadmin|god). Legal/DPO tool.
 * Requires explicit confirmed: true in body — defense against accidental calls.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const ADMIN_ROLES = ['admin', 'superadmin', 'god'];

// A malformed id reaches Postgres as an invalid uuid literal and comes back as
// a 500. Reject it up front as the 400 it actually is.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  // Rate-limit all erasure calls
  if (!applyRateLimit(req, res, LIMITS.write)) return;

  try {
    const user = await requireAdmin(req, res);
    if (!user) return;

    const { userId, confirmed } = req.body || {};
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }
    if (!UUID_RE.test(String(userId))) {
      return res.status(400).json({ success: false, error: 'userId must be a valid uuid' });
    }
    if (confirmed !== true) {
      return res.status(400).json({ success: false, error: 'confirmed must be true — this action is irreversible' });
    }

    // CRITICAL: p_requested_by MUST match auth.uid() — server-side enforced
    const { data, error } = await getSB().rpc('fn_anonymize_hg_user_content', {
      p_user_id: userId,
      p_requested_by: user.id,
    });
    if (error) {
      console.warn('[hg-gdpr-erase POST]', error);
      return res.status(500).json({ success: false, error: 'Erasure request failed' });
    }
    return res.status(200).json({ success: true, counts: data });
  } catch (err) {
    console.warn('[hg-gdpr-erase] Unhandled error:', err?.message || err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
