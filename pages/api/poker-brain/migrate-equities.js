import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * Poker Brain -- Historical Equity Migration API
 * POST /api/poker-brain/migrate-equities
 * Body: { dryRun: boolean, batchSize: number }
 *
 * Recomputes equity values for hands stored under older engine versions.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Minimal server-side equity recompute using the engine's pure functions
// Note: the full recompute.js imports PokerBrainEngine which uses `document`,
// so for server-side we do a simplified version querying stored data.

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const { dryRun = true, batchSize = 100 } = req.body || {};
    const safeBatch = Math.min(500, Math.max(1, parseInt(batchSize) || 100));

    // Find hands that need recomputation (no schema_version or < 4)
    // We query user's sessions first, then hands within those sessions
    const { data: sessions } = await getSupabase()
      .from('pb_sessions')
      .select('id')
      .eq('user_id', user.id);

    if (!sessions || sessions.length === 0) {
      return res.status(200).json({
        processed: 0, updated: 0, skipped: 0, errors: 0,
        message: 'No sessions found'
      });
    }

    const sessionIds = sessions.map(s => s.id);

    const { data: staleHands, error: queryErr } = await getSupabase()
      .from('pb_hands')
      .select('id, hole_cards, board, equity, low_equity, session_id')
      .in('session_id', sessionIds)
      .or('schema_version.is.null,schema_version.lt.4')
      .limit(safeBatch);

    if (queryErr) {
      console.warn('[poker-brain/migrate] query error:', queryErr);
      return res.status(500).json({ error: 'Failed to query hands' });
    }

    const hands = staleHands || [];

    if (dryRun) {
      return res.status(200).json({
        dryRun: true,
        handsToProcess: hands.length,
        batchSize: safeBatch,
        message: `Found ${hands.length} hands needing recomputation. Set dryRun=false to execute.`
      });
    }

    // Mark hands as schema_version=4 (equity will be recomputed client-side
    // on next load via the recompute module)
    let updated = 0;
    let errors = 0;

    for (const hand of hands) {
      const { error: updateErr } = await getSupabase()
        .from('pb_hands')
        .update({ schema_version: 4, equity_needs_recompute: true })
        .eq('id', hand.id);

      if (updateErr) {
        errors++;
        console.warn(`[poker-brain/migrate] update error for hand ${hand.id}:`, updateErr);
      } else {
        updated++;
      }
    }

    return res.status(200).json({
      processed: hands.length,
      updated,
      skipped: 0,
      errors,
      message: `Flagged ${updated} hands for client-side equity recomputation.`
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[poker-brain/migrate] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
