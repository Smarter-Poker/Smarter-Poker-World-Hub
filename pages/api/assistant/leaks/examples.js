/**
 * GET /api/assistant/leaks/examples?leakId=<uuid>
 *
 * Returns private hand examples only after authenticating the caller and
 * proving that the parent leak belongs to that account. The browser never
 * reads leak_hand_examples directly.
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/apiErrorHandler';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, LIMITS.read || { max: 120, windowMs: 60_000 })) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabase();
    const { user, error: authError } = await getServerUserWithFallback(req, supabase);
    if (authError || !user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const leakId = typeof req.query.leakId === 'string' ? req.query.leakId.trim() : '';
    if (!UUID_RE.test(leakId)) {
      return res.status(400).json({ success: false, error: 'Invalid leak id' });
    }

    const { data: ownedLeak, error: ownershipError } = await supabase
      .from('user_leaks')
      .select('id')
      .eq('id', leakId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (ownershipError) {
      console.warn('[leaks/examples] ownership read failed:', ownershipError.message);
      return res.status(503).json({ success: false, error: 'Hand examples are temporarily unavailable' });
    }
    // A foreign id and a missing id are intentionally indistinguishable.
    if (!ownedLeak) return res.status(404).json({ success: false, error: 'Leak not found' });

    const { data, error } = await supabase
      .from('leak_hand_examples')
      .select('id, hand_data, ev_loss, created_at, hand_history_id')
      .eq('leak_id', leakId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.warn('[leaks/examples] private example read failed:', error.message);
      return res.status(503).json({ success: false, error: 'Hand examples are temporarily unavailable' });
    }

    return res.status(200).json({
      success: true,
      examples: (data || []).map((example) => ({
        id: example.id,
        snapshot: example.hand_data,
        evLoss: example.ev_loss,
        date: example.created_at,
        handId: example.hand_history_id,
      })),
    });
  } catch (error) {
    try { reportApiError(error, req); } catch (_) { /* reporting must not mask the response */ }
    console.warn('[leaks/examples] handler failed:', error?.message || error);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
