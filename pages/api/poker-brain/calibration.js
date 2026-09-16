import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Poker Brain -- Calibration Profiles API
 * GET:    List user's calibration profiles
 * POST:   Save a new calibration profile
 * DELETE: Remove a calibration profile
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

export default async function handler(req, res) {
  // [Phase 6.1.15] Rate limit writes — prevents enumeration + drain attacks.
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    // GET: list profiles
    if (req.method === 'GET') {
      const { data: profiles, error } = await getSupabase()
        .from('pb_calibration_profiles')
        .select('id, name, device_name, overrides, created_at, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) {
        console.warn('[poker-brain/calibration] list error:', error);
        return res.status(500).json({ error: 'Failed to fetch profiles' });
      }
      return res.status(200).json({ profiles: profiles || [] });
    }

    // POST: create profile
    if (req.method === 'POST') {
      const { name, device_name, overrides } = req.body || {};
      if (!name || !overrides) {
        return res.status(400).json({ error: 'name and overrides are required' });
      }

      const { data: profile, error } = await getSupabase()
        .from('pb_calibration_profiles')
        .insert({
          user_id: user.id,
          name,
          device_name: device_name || 'Unknown Device',
          overrides: typeof overrides === 'string' ? overrides : JSON.stringify(overrides),
        })
        .select()
        .maybeSingle();

      if (error) {
        console.warn('[poker-brain/calibration] insert error:', error);
        return res.status(500).json({ error: 'Failed to save profile' });
      }
      return res.status(201).json({ profile });
    }

    // DELETE: remove profile
    if (req.method === 'DELETE') {
      const { id } = req.body || req.query || {};
      if (!id) return res.status(400).json({ error: 'Profile id required' });

      // Verify ownership
      const { data: existing } = await getSupabase()
        .from('pb_calibration_profiles')
        .select('user_id')
        .eq('id', id)
        .maybeSingle();

      if (!existing || existing.user_id !== user.id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const { error } = await getSupabase()
        .from('pb_calibration_profiles')
        .delete()
        .eq('id', id);

      if (error) {
        console.warn('[poker-brain/calibration] delete error:', error);
        return res.status(500).json({ error: 'Failed to delete profile' });
      }
      return res.status(200).json({ deleted: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[poker-brain/calibration] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
