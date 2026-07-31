import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Poker Brain -- Single Session Detail API
 * GET /api/poker-brain/session/[id]
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

    const sessionId = req.query.id;
    if (!sessionId) return res.status(400).json({ error: 'Session ID required' });

    // Fetch session with ownership check
    const { data: session, error: sessErr } = await getSupabase()
      .from('pb_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (sessErr) {
      console.warn('[poker-brain/session] query error:', sessErr);
      return res.status(500).json({ error: 'Failed to fetch session' });
    }
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Fetch all hands in this session
    const { data: hands, error: handsErr } = await getSupabase()
      .from('pb_hands')
      .select('id, hand_number, hole_cards, board, game_type, equity, pot_odds, decision, raise_amount, confidence, reasoning, pot_size, bet_to_call, stack_size, position, detected_auto, street_decisions, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (handsErr) {
      console.warn('[poker-brain/session] hands error:', handsErr);
      return res.status(500).json({ error: 'Failed to fetch hands' });
    }

    return res.status(200).json({ session, hands: hands || [] });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[poker-brain/session] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
