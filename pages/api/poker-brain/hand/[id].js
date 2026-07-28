/**
 * Poker Brain -- Single Hand Detail API
 * GET /api/poker-brain/hand/[id]
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../../src/lib/sentryWrap';

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
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const handId = req.query.id;
    if (!handId) return res.status(400).json({ error: 'Hand ID required' });

    // Fetch hand
    const { data: hand, error: handErr } = await getSupabase()
      .from('pb_hands')
      .select('*')
      .eq('id', handId)
      .maybeSingle();

    if (handErr) {
      console.warn('[poker-brain/hand] query error:', handErr);
      return res.status(500).json({ error: 'Failed to fetch hand' });
    }
    if (!hand) return res.status(404).json({ error: 'Hand not found' });

    // Verify ownership through session
    const { data: session } = await getSupabase()
      .from('pb_sessions')
      .select('user_id')
      .eq('id', hand.session_id)
      .maybeSingle();

    if (!session || session.user_id !== user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    return res.status(200).json({ hand });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[poker-brain/hand] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
